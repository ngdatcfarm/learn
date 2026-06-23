/**
 * server/practice.ts — Dictation + Speaking + Shadowing endpoints (Step 9c + 9d)
 *
 * Endpoints:
 *   - GET  /api/practice/items?type=dictation|speaking|shadowing
 *       Trả về list practice items từ question_bank (template_type tương ứng).
 *   - POST /api/practice/dictation/check
 *       Body: { itemId, userInput }
 *       Server-side word diff (LCS) → score 0-100 → ghi skill_measurement (write.accuracy).
 *   - POST /api/practice/speak/submit
 *       Body: { itemId, audioUrl, durationMs?, mime? }
 *       Reuse transcribeFromUrl + speakAnalyze từ server/ai.ts (Step 9b).
 *       INSERT speak_recordings (audio + transcript + analysis + expires_at=24h).
 *       Ghi skill_measurement (speak.fluency 0-100).
 *       Skip speakAnalyze nếu transcript rỗng (cost saving — Gemini trả tiền/call).
 *   - POST /api/practice/shadowing/check (Step 9d)
 *       Body: { itemId, audioUrl, durationMs?, mime? }
 *       STT transcript, word-diff vs reference (cùng LCS như dictation).
 *       INSERT speak_recordings (audio + transcript + expires_at=24h) — không cần analysis.
 *       Ghi skill_measurement (listen.accuracy 0-100).
 *
 * Practice items:
 *   - Đọc từ question_bank (template_type='dictation'|'speaking'|'shadowing').
 *   - Dictation content_json shape:   { text: string }
 *   - Speaking content_json shape:    { prompt: string }
 *   - Shadowing content_json shape:   { reference: string }  (câu mẫu để HS nghe + lặp lại)
 *   - 9g seed 12 items mỗi loại vào DB; resolve từ question_bank.
 *
 * Transactions: mỗi endpoint wrap INSERTs trong withTransaction() để atomicity
 * (speak_recording + skill_measurement + engagement_event hoặc cùng commit hoặc rollback).
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { requireUser } from "./auth";
import { query, queryOne, withTransaction } from "../db/client";
import { transcribeFromUrl, speakAnalyze, SpeakAnalysisResult } from "./ai";
import { assertSafeUploadUrl } from "./audio";
import { AiProvider } from "./ai/provider";

// ============================================================
// Public types
// ============================================================

export interface PracticeItem {
  id: string;
  template_type: "dictation" | "speaking" | "shadowing";
  topic: string | null;
  level: string | null;
  text?: string;       // for dictation
  prompt?: string;     // for speaking
  reference?: string;  // for shadowing (câu mẫu để nghe + lặp lại)
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

export interface ShadowingCheckResult {
  ok: true;
  recordingId: string;
  transcript: string;
  confidence: "low" | "medium" | "high";
  reference: string;
  diff: DictationDiffWord[];
  correctCount: number;
  totalCount: number;
  score: number;       // 0-100, % từ đúng
}

// ============================================================
// Router factory
// ============================================================

export function practiceRouter(provider: AiProvider): Router {
  const router = Router();

  // ============================================================
  // GET /api/practice/items?type=dictation|speaking|shadowing
  // ============================================================
  router.get("/items", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const type = String(req.query.type || "");
    if (type !== "dictation" && type !== "speaking" && type !== "shadowing") {
      return res.status(400).json({ error: 'type phải là "dictation", "speaking" hoặc "shadowing".' });
    }

    const items: PracticeItem[] = [];

    // Read from question_bank (shared + owned by this user)
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
      let content: { text?: string; prompt?: string; reference?: string } = {};
      try {
        content = JSON.parse(r.content_json) || {};
      } catch {
        // skip malformed
        continue;
      }
      if (type === "dictation" && !content.text) continue;
      if (type === "speaking" && !content.prompt) continue;
      if (type === "shadowing" && !content.reference) continue;
      items.push({
        id: r.id,
        template_type: type,
        topic: r.topic,
        level: r.level,
        text: content.text,
        prompt: content.prompt,
        reference: content.reference,
      });
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

      const resolved = await resolvePracticeItem(itemId, user.id, "dictation");
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

      const resolved = await resolvePracticeItem(itemId, user.id, "speaking");
      if (!resolved) {
        return res.status(404).json({ error: "Item không tồn tại." });
      }
      if (!resolved.prompt) {
        return res.status(400).json({ error: "Item không có prompt." });
      }

      // STT
      const { transcript, confidence } = await transcribeFromUrl(
        provider,
        audioUrl,
        mime || "audio/webm"
      );

      // Skip speakAnalyze nếu transcript rỗng (cost saving — provider trả tiền/call,
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
        analysis = await speakAnalyze(provider, transcript, resolved.prompt, resolved.level);
      }

      const recordingId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      const fluencyScore = Math.max(0, Math.min(100, analysis.overall_score * 10));

      // Atomic: 3 INSERT (speak_recordings + skill_measurements + engagement_events)
      await recordPracticeAttempt({
        userId: user.id,
        source: "speaking",
        skill: "speak",
        metric: "fluency",
        value: fluencyScore,
        context: { source: "speaking", itemId, recordingId },
        recording: {
          recordingId,
          transcript,
          errorsJson: JSON.stringify(analysis.errors),
          analysisText: analysis.encouragement,
          audioUrl,
          durationMs: durationMs ?? null,
          expiresAt,
          prompt: resolved.prompt,
          topic: resolved.topic,
          level: resolved.level,
        },
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

  // ============================================================
  // POST /api/practice/shadowing/check (Step 9d)
  // ============================================================
  router.post("/shadowing/check", async (req: Request, res: Response) => {
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
      assertSafeUploadUrl(audioUrl);

      const resolved = await resolvePracticeItem(itemId, user.id, "shadowing");
      if (!resolved) {
        return res.status(404).json({ error: "Item không tồn tại." });
      }
      if (!resolved.reference) {
        return res.status(400).json({ error: "Item không có reference." });
      }

      // STT (reuse 9b). Nếu transcript rỗng → score=0, diff empty.
      const { transcript, confidence } = await transcribeFromUrl(
        provider,
        audioUrl,
        mime || "audio/webm"
      );

      const expectedWords = normalizeWords(resolved.reference);
      const gotWords = normalizeWords(transcript || "");
      const diff = computeWordDiff(expectedWords, gotWords);
      const correctCount = diff.filter((d) => d.correct).length;
      const score =
        expectedWords.length > 0
          ? Math.round((correctCount / expectedWords.length) * 100)
          : 0;

      const recordingId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      // Atomic: 3 INSERT (speak_recordings + skill_measurements + engagement_events).
      // listen.accuracy vì shadowing = nghe TTS rồi lặp lại → luyện listen.
      // errors_json + analysis_text = null vì shadowing chỉ word-diff, không cần Gemini analyze.
      await recordPracticeAttempt({
        userId: user.id,
        source: "shadowing",
        skill: "listen",
        metric: "accuracy",
        value: score,
        context: { source: "shadowing", itemId, recordingId },
        recording: {
          recordingId,
          transcript,
          errorsJson: null,
          analysisText: null,
          audioUrl,
          durationMs: durationMs ?? null,
          expiresAt,
          prompt: resolved.reference,
          topic: resolved.topic,
          level: resolved.level,
        },
      });

      const result: ShadowingCheckResult = {
        ok: true,
        recordingId,
        transcript,
        confidence,
        reference: resolved.reference,
        diff,
        correctCount,
        totalCount: expectedWords.length,
        score,
      };
      res.json(result);
    } catch (err: any) {
      console.error("Shadowing check error:", err);
      res.status(500).json({ error: err.message || "Shadowing check thất bại." });
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
 * Resolve 1 practice item (dictation | speaking | shadowing) từ question_bank.
 * Trả về { text | prompt | reference, level, topic } hoặc null.
 */
async function resolvePracticeItem(
  itemId: string,
  userId: string,
  type: "dictation" | "speaking" | "shadowing"
): Promise<
  | {
      text?: string;
      prompt?: string;
      reference?: string;
      level: string;
      topic: string | null;
    }
  | null
> {
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
  let content: { text?: string; prompt?: string; reference?: string } = {};
  try {
    content = JSON.parse(row.content_json) || {};
  } catch {
    return null;
  }
  if (type === "dictation" && !content.text) return null;
  if (type === "speaking" && !content.prompt) return null;
  if (type === "shadowing" && !content.reference) return null;
  return {
    text: content.text,
    prompt: content.prompt,
    reference: content.reference,
    level: row.level || "A2",
    topic: row.topic,
  };
}

/**
 * Ghi 1 practice attempt trong cùng transaction.
 * - Luôn INSERT skill_measurements + engagement_events(task_done)
 * - Nếu `recording` được truyền, cũng INSERT speak_recordings (cho speaking + shadowing)
 *
 * Dùng chung cho dictation (9c, không có recording), speaking (9c), shadowing (9d).
 * Một helper duy nhất đảm bảo 3 INSERTs (khi có recording) luôn atomic — không
 * thể insert recording mà quên insert skill_measurement hoặc ngược lại.
 */
async function recordPracticeAttempt(input: {
  userId: string;
  source: "dictation" | "speaking" | "shadowing" | string;
  skill: "read" | "write" | "listen" | "speak" | "learn";
  metric: string;
  value: number;
  context: Record<string, unknown>;
  /** Optional: nếu có, INSERT vào speak_recordings (audio + transcript + expires_at). */
  recording?: {
    recordingId: string;
    transcript: string;
    errorsJson?: string | null;
    analysisText?: string | null;
    audioUrl: string;
    durationMs?: number | null;
    expiresAt: Date;
    prompt: string | null;
    topic: string | null;
    level: string | null;
  };
}): Promise<void> {
  await withTransaction(async (conn) => {
    if (input.recording) {
      const r = input.recording;
      await conn.execute(
        `INSERT INTO speak_recordings
            (id, user_id, transcript, errors_json, analysis_text, audio_url,
             audio_duration_ms, expires_at, prompt, topic, level, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          r.recordingId,
          input.userId,
          r.transcript,
          r.errorsJson ?? null,
          r.analysisText ?? null,
          r.audioUrl,
          r.durationMs ?? null,
          r.expiresAt,
          r.prompt,
          r.topic,
          r.level,
        ]
      );
    }
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

