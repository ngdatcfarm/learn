/**
 * server/practice.ts — Dictation + Speaking Prompt endpoints (Step 9c)
 *
 * Endpoints:
 *   - GET  /api/practice/items?type=dictation|speaking
 *       Trả về list practice items từ question_bank (template_type tương ứng).
 *       Nếu rỗng → fallback về FALLBACK_* arrays (cho dev/test trước khi 9g seed).
 *   - POST /api/practice/dictation/check
 *       Body: { itemId, userInput }
 *       Server-side word diff (LCS) → score 0-100 → ghi skill_measurement (write.accuracy).
 *   - POST /api/practice/speak/submit
 *       Body: { itemId, audioUrl, durationMs?, mime? }
 *       Reuse transcribeFromUrl + speakAnalyze từ server/ai.ts (Step 9b).
 *       INSERT speak_recordings (audio + transcript + analysis + expires_at=24h).
 *       Ghi skill_measurement (speak.fluency 0-100).
 *       Skip speakAnalyze nếu transcript rỗng (cost saving — Gemini trả tiền/call).
 *
 * Practice items:
 *   - Đọc từ question_bank (template_type='dictation'|'speaking').
 *   - Dictation content_json shape: { text: string }
 *   - Speaking content_json shape: { prompt: string }
 *   - 9g sẽ seed content thật; hiện tại dùng fallback nếu question_bank trống.
 *
 * Transactions: mỗi endpoint wrap INSERTs trong withTransaction() để atomicity
 * (speak_recording + skill_measurement + engagement_event hoặc cùng commit hoặc rollback).
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { requireUser } from "./auth";
import { query, queryOne, withTransaction } from "../db/client";
import { transcribeFromUrl, speakAnalyze, SpeakAnalysisResult } from "./ai";
import { assertSafeUploadUrl } from "./audio";

// ============================================================
// Fallback items — dùng khi question_bank rỗng (dev/test trước khi 9g seed)
// ============================================================

interface FallbackItem {
  topic: string;
  level: string;
  content: { text?: string; prompt?: string };
}

const FALLBACK_DICTATION: FallbackItem[] = [
  { topic: "Daily life", level: "A2", content: { text: "The weather is nice today, so we can go to the park." } },
  { topic: "School", level: "A2", content: { text: "I usually wake up at six in the morning." } },
  { topic: "Travel", level: "B1", content: { text: "Have you ever visited a foreign country?" } },
  { topic: "Food", level: "A2", content: { text: "My mother makes the best noodle soup in town." } },
];

const FALLBACK_SPEAKING: FallbackItem[] = [
  { topic: "Hobbies", level: "A2", content: { prompt: "Describe your favorite hobby in 30-60 seconds. Why do you enjoy it?" } },
  { topic: "Daily routine", level: "A2", content: { prompt: "Tell me about your typical weekday morning." } },
  { topic: "Travel", level: "B1", content: { prompt: "Describe a memorable trip you have taken. Where did you go and what did you do?" } },
  { topic: "Food", level: "A2", content: { prompt: "What is your favorite food? How often do you eat it?" } },
];

function fallbackId(type: "dictation" | "speaking", item: FallbackItem): string {
  return `fallback-${type}-${item.topic.toLowerCase().replace(/\s+/g, "-")}-${item.level}`;
}

// ============================================================
// Public types
// ============================================================

export interface PracticeItem {
  id: string;
  template_type: "dictation" | "speaking";
  topic: string | null;
  level: string | null;
  text?: string;     // for dictation
  prompt?: string;   // for speaking
}

export interface DictationDiffWord {
  word: string;
  correct: boolean;
}

export interface DictationCheckResult {
  ok: true;
  score: number;          // 0-100
  expected: string;
  userInput: string;
  diff: DictationDiffWord[];
  correctCount: number;
  totalCount: number;
}

export interface SpeakSubmitResult {
  ok: true;
  recordingId: string;
  transcript: string;
  confidence: "low" | "medium" | "high";
  analysis: SpeakAnalysisResult;
}

// ============================================================
// Router factory
// ============================================================

export function practiceRouter(ai: GoogleGenAI | null): Router {
  const router = Router();

  // ============================================================
  // GET /api/practice/items?type=dictation|speaking
  // ============================================================
  router.get("/items", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const type = String(req.query.type || "");
    if (type !== "dictation" && type !== "speaking") {
      return res.status(400).json({ error: 'type phải là "dictation" hoặc "speaking".' });
    }

    const items: PracticeItem[] = [];

    // 1. Read from question_bank (shared + owned by this user)
    const rows = await query<Array<{
      id: string;
      topic: string | null;
      level: string | null;
      content_json: string;
    }>>(
      `SELECT id, topic, level, content_json
         FROM question_bank
        WHERE template_type = ?
          AND (is_shared = 1 OR owner_id = ?)
        ORDER BY created_at DESC
        LIMIT 50`,
      [type, user.id]
    );

    for (const r of rows) {
      let content: { text?: string; prompt?: string } = {};
      try {
        content = JSON.parse(r.content_json) || {};
      } catch {
        // skip malformed
        continue;
      }
      if (type === "dictation" && !content.text) continue;
      if (type === "speaking" && !content.prompt) continue;
      items.push({
        id: r.id,
        template_type: type,
        topic: r.topic,
        level: r.level,
        text: content.text,
        prompt: content.prompt,
      });
    }

    // 2. Fallback nếu rỗng — dùng hardcoded để dev/test
    if (items.length === 0) {
      const fallback = type === "dictation" ? FALLBACK_DICTATION : FALLBACK_SPEAKING;
      for (const f of fallback) {
        items.push({
          id: fallbackId(type, f),
          template_type: type,
          topic: f.topic,
          level: f.level,
          text: f.content.text,
          prompt: f.content.prompt,
        });
      }
    }

    res.json({ items });
  });

  // ============================================================
  // POST /api/practice/dictation/check
  // ============================================================
  router.post("/dictation/check", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { itemId, userInput } = (req.body || {}) as {
        itemId?: string;
        userInput?: string;
      };
      if (!itemId || typeof userInput !== "string") {
        return res.status(400).json({ error: "Thiếu itemId hoặc userInput." });
      }

      const resolved = await resolvePracticeItem(
        itemId,
        user.id,
        "dictation",
        FALLBACK_DICTATION
      );
      if (!resolved) {
        return res.status(404).json({ error: "Item không tồn tại." });
      }
      if (!resolved.text) {
        return res.status(400).json({ error: "Item không có text để check." });
      }

      const expectedWords = normalizeWords(resolved.text);
      const gotWords = normalizeWords(userInput);
      const diff = computeWordDiff(expectedWords, gotWords);
      const correctCount = diff.filter((d) => d.correct).length;
      const score =
        expectedWords.length > 0
          ? Math.round((correctCount / expectedWords.length) * 100)
          : 0;

      // Atomic: cả 2 INSERT hoặc cùng rollback
      await recordPracticeAttempt({
        userId: user.id,
        source: "dictation",
        skill: "write",
        metric: "accuracy",
        value: score,
        context: { source: "dictation", itemId, expected: resolved.text },
      });

      const result: DictationCheckResult = {
        ok: true,
        score,
        expected: resolved.text,
        userInput,
        diff,
        correctCount,
        totalCount: expectedWords.length,
      };
      res.json(result);
    } catch (err: any) {
      console.error("Dictation check error:", err);
      res.status(500).json({ error: err.message || "Check thất bại." });
    }
  });

  // ============================================================
  // POST /api/practice/speak/submit
  // ============================================================
  router.post("/speak/submit", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { itemId, audioUrl, durationMs, mime } = (req.body || {}) as {
        itemId?: string;
        audioUrl?: string;
        durationMs?: number;
        mime?: string;
      };
      if (!itemId || !audioUrl) {
        return res.status(400).json({ error: "Thiếu itemId hoặc audioUrl." });
      }
      // Path safety check (centralized)
      assertSafeUploadUrl(audioUrl);

      const resolved = await resolvePracticeItem(
        itemId,
        user.id,
        "speaking",
        FALLBACK_SPEAKING
      );
      if (!resolved) {
        return res.status(404).json({ error: "Item không tồn tại." });
      }
      if (!resolved.prompt) {
        return res.status(400).json({ error: "Item không có prompt." });
      }

      // STT
      const { transcript, confidence } = await transcribeFromUrl(
        ai,
        audioUrl,
        mime || "audio/webm"
      );

      // Skip speakAnalyze nếu transcript rỗng (cost saving — Gemini trả tiền/call,
      // và phân tích câu rỗng không có giá trị).
      let analysis: SpeakAnalysisResult;
      if (!transcript || transcript.trim().length === 0) {
        analysis = {
          errors: [],
          overall_score: 0,
          encouragement: "Mình không nghe rõ — bạn thử thu âm lại nhé!",
          raw_text: "",
        };
      } else {
        analysis = await speakAnalyze(ai, transcript, resolved.prompt, resolved.level);
      }

      const recordingId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      const fluencyScore = Math.max(0, Math.min(100, analysis.overall_score * 10));

      // Atomic: 3 INSERT (speak_recording + skill_measurement + engagement_event)
      await withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO speak_recordings
              (id, user_id, transcript, errors_json, analysis_text, audio_url,
               audio_duration_ms, expires_at, prompt, topic, level, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            recordingId,
            user.id,
            transcript,
            JSON.stringify(analysis.errors),
            analysis.encouragement,
            audioUrl,
            durationMs ?? null,
            expiresAt,
            resolved.prompt,
            resolved.topic,
            resolved.level,
          ]
        );
        await conn.execute(
          `INSERT INTO skill_measurements
              (id, user_id, skill, metric, value, context_json, measured_at)
           VALUES (?, ?, 'speak', 'fluency', ?, ?, NOW())`,
          [
            crypto.randomUUID(),
            user.id,
            fluencyScore,
            JSON.stringify({ source: "speaking", itemId, recordingId }),
          ]
        );
        await conn.execute(
          `INSERT INTO engagement_events
              (id, user_id, event, value, context_json, occurred_at)
           VALUES (?, ?, 'task_done', ?, ?, NOW())`,
          [
            crypto.randomUUID(),
            user.id,
            fluencyScore,
            JSON.stringify({ source: "speaking", itemId, recordingId }),
          ]
        );
      });

      const result: SpeakSubmitResult = {
        ok: true,
        recordingId,
        transcript,
        confidence,
        analysis,
      };
      res.json(result);
    } catch (err: any) {
      console.error("Speak submit error:", err);
      res.status(500).json({ error: err.message || "Submit thất bại." });
    }
  });

  return router;
}

// ============================================================
// Helpers
// ============================================================

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,!?;:"'\u2018\u2019\u201c\u201d]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * LCS-based word alignment. Returns [{ word, correct }] where:
 *   - correct: true  → word matched in both expected and user input
 *   - correct: false → expected word missing OR extra word in user input
 */
function computeWordDiff(
  expected: string[],
  got: string[]
): DictationDiffWord[] {
  const m = expected.length;
  const n = got.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (expected[i - 1] === got[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }
  // Backtrack
  type Slot = { expected?: string; got?: string };
  const aligned: Slot[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      expected[i - 1] === got[j - 1]
    ) {
      aligned.push({ expected: expected[i - 1], got: got[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      aligned.push({ got: got[j - 1] });
      j--;
    } else {
      aligned.push({ expected: expected[i - 1] });
      i--;
    }
  }
  aligned.reverse();

  const diff: DictationDiffWord[] = [];
  for (const a of aligned) {
    if (a.expected && a.got) {
      diff.push({ word: a.expected, correct: true });
    } else if (a.expected) {
      diff.push({ word: `(thiếu: ${a.expected})`, correct: false });
    } else if (a.got) {
      diff.push({ word: `(thừa: ${a.got})`, correct: false });
    }
  }
  return diff;
}

/**
 * Resolve 1 practice item (dictation | speaking) từ fallback arrays hoặc question_bank.
 * Trả về { text | prompt, level, topic } hoặc null nếu không tồn tại.
 * Merge của 2 hàm resolveDictationItem + resolveSpeakingItem cũ (Step 9c).
 */
async function resolvePracticeItem(
  itemId: string,
  userId: string,
  type: "dictation" | "speaking",
  fallback: FallbackItem[]
): Promise<
  | { text?: string; prompt?: string; level: string; topic: string | null }
  | null
> {
  // 1. Fallback IDs (hardcoded)
  if (itemId.startsWith(`fallback-${type}-`)) {
    const match = fallback.find((f) => fallbackId(type, f) === itemId);
    if (match) {
      return {
        text: match.content.text,
        prompt: match.content.prompt,
        level: match.level,
        topic: match.topic,
      };
    }
    return null;
  }
  // 2. question_bank (shared + owned by user)
  const row = await queryOne<{
    content_json: string;
    level: string | null;
    topic: string | null;
  }>(
    `SELECT content_json, level, topic
       FROM question_bank
      WHERE id = ? AND template_type = ?
        AND (is_shared = 1 OR owner_id = ?)`,
    [itemId, type, userId]
  );
  if (!row) return null;
  let content: { text?: string; prompt?: string } = {};
  try {
    content = JSON.parse(row.content_json) || {};
  } catch {
    return null;
  }
  if (type === "dictation" && !content.text) return null;
  if (type === "speaking" && !content.prompt) return null;
  return {
    text: content.text,
    prompt: content.prompt,
    level: row.level || "A2",
    topic: row.topic,
  };
}

/**
 * Ghi 1 skill_measurement + 1 engagement_event(task_done) trong cùng transaction.
 * Dùng chung cho cả dictation + speaking (Step 9c) và sẽ dùng lại cho 9d/9e.
 */
async function recordPracticeAttempt(input: {
  userId: string;
  source: "dictation" | "speaking" | string;
  skill: "read" | "write" | "listen" | "speak" | "learn";
  metric: string;
  value: number;
  context: Record<string, unknown>;
}): Promise<void> {
  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO skill_measurements
          (id, user_id, skill, metric, value, context_json, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        crypto.randomUUID(),
        input.userId,
        input.skill,
        input.metric,
        input.value,
        JSON.stringify(input.context),
      ]
    );
    await conn.execute(
      `INSERT INTO engagement_events
          (id, user_id, event, value, context_json, occurred_at)
       VALUES (?, ?, 'task_done', ?, ?, NOW())`,
      [
        crypto.randomUUID(),
        input.userId,
        input.value,
        JSON.stringify(input.context),
      ]
    );
  });
}
