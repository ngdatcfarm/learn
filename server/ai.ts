/**
 * server/ai.ts — AI Tutor endpoints (Step 13b Phase 0: provider-agnostic)
 *
 * Endpoints (Step 9b + Step 13b):
 *   - POST /api/tutor/chat          — text chat
 *   - POST /api/tutor/analyze       — fix/suggest/translate
 *   - POST /api/tutor/transcribe    — audio_url → transcript
 *   - POST /api/tutor/speak-analyze — transcript + prompt → error JSON
 *
 * Step 13b refactor:
 *   - Inject AiProvider (factory in server/ai/index.ts) thay vì GoogleGenAI trực tiếp.
 *   - Helpers `transcribeFromUrl` + `speakAnalyze` vẫn export để practice.ts dùng,
 *     nhưng giờ wrap provider (không còn GoogleGenAI cụ thể).
 *   - StubProvider fallback khi không có key nào.
 */

import { Router, Request, Response } from "express";
import path from "node:path";
import { UPLOAD_DIR, assertSafeUploadUrl } from "./audio";
import { requireUser } from "./auth";
import { AiProvider } from "./ai/provider";

// ============================================================
// Public types — exposed cho practice endpoints
// ============================================================

export interface SpeakError {
  type: string;
  original: string;
  expected: string;
  hint: string;
}

export interface SpeakAnalysisResult {
  errors: SpeakError[];
  overall_score: number; // 0-10
  encouragement: string;
  raw_text: string;
}

export function aiRouter(provider: AiProvider): Router {
  const router = Router();

  // ============================================================
  // /chat — text chat
  // ============================================================
  router.post("/chat", async (req: Request, res: Response) => {
    try {
      const { messages, userProfile } = req.body || {};
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Thiếu messages." });
      }

      const sysInstruction = `You are Apex AI Tutor, an advanced, highly engaging, and modern English conversation partner for Vietnamese high schoolers aged 14-18 (Level: ${userProfile?.level || "Intermediate"}).
Rules:
1. Conduct discussion naturally in English about standard high schooler topics.
2. Maintain an encouraging, intellectual tone. Avoid childish expressions.
3. Keep answers concise (2-3 sentences).
4. Periodically ask back a relevant question.
5. Do not output Vietnamese unless explicitly asked, but use clear structured English.`;

      const text = await provider.generateText({
        system: sysInstruction,
        messages: messages.map((m: any) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || ""),
        })),
        temperature: 0.7,
      });

      res.json({ text });
    } catch (err: any) {
      console.error("AI chat error:", err);
      res.status(500).json({ error: err.message || "AI error" });
    }
  });

  // ============================================================
  // /analyze — fix / suggest / translate
  // ============================================================
  router.post("/analyze", async (req: Request, res: Response) => {
    try {
      const { action, text } = req.body || {};
      if (!action || !text) {
        return res.status(400).json({ error: "Thiếu action hoặc text." });
      }

      let prompt = "";
      if (action === "fix") {
        prompt = `Review this English sentence: "${text}". 1) Grammar mistakes? 2) Polished version. 3) Advanced alternative (IELTS 6.5-7.5). Use bullet points.`;
      } else if (action === "suggest") {
        prompt = `For: "${text}", suggest 3 natural responses (academic, personal, curious). Brief 1-line explanations each.`;
      } else if (action === "translate") {
        prompt = `Translate to natural Vietnamese: "${text}". Only the translation.`;
      } else {
        return res.status(400).json({ error: "Action không hỗ trợ." });
      }

      const analysis = await provider.generateText({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });

      res.json({ analysis });
    } catch (err: any) {
      console.error("AI analyze error:", err);
      res.status(500).json({ error: err.message || "AI error" });
    }
  });

  // ============================================================
  // /transcribe — audio_url → text
  // ============================================================
  router.post("/transcribe", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { audio_url, mime } = req.body || {};
      if (!audio_url) {
        return res.status(400).json({ error: "Thiếu audio_url." });
      }
      const result = await transcribeFromUrl(provider, audio_url, mime || "audio/webm");
      res.json(result);
    } catch (err: any) {
      console.error("Transcribe error:", err);
      res.status(500).json({ error: err.message || "Transcribe thất bại" });
    }
  });

  // ============================================================
  // /speak-analyze — transcript + prompt → error JSON
  // ============================================================
  router.post("/speak-analyze", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { transcript, prompt, level } = req.body || {};
      if (!transcript || !prompt) {
        return res.status(400).json({ error: "Thiếu transcript hoặc prompt." });
      }
      const capped =
        typeof transcript === "string" && transcript.length > 1500
          ? transcript.slice(0, 1500)
          : transcript;
      const result = await speakAnalyze(provider, capped, prompt, level || "A2");
      res.json(result);
    } catch (err: any) {
      console.error("Speak-analyze error:", err);
      res.status(500).json({ error: err.message || "Speak-analyze thất bại" });
    }
  });

  return router;
}

// ============================================================
// Internal helpers — exported để practice.ts dùng mà không cần HTTP
// ============================================================

/**
 * Read audio file from disk + transcribe qua provider.
 * Throws on missing file / read error.
 */
export async function transcribeFromUrl(
  provider: AiProvider,
  audioUrl: string,
  mime: string
): Promise<{ transcript: string; confidence: "low" | "medium" | "high" }> {
  // Resolve file path (centralized validation)
  assertSafeUploadUrl(audioUrl);
  const rel = audioUrl.replace(/^\//, "");
  const abs = path.join(UPLOAD_DIR, rel);
  return provider.transcribe({ filePath: abs, mimeType: mime });
}

/**
 * Send (transcript, prompt, level) → AI → parse JSON { errors, overall_score, encouragement }.
 * Falls back to text wrap if AI returns non-JSON.
 */
export async function speakAnalyze(
  provider: AiProvider,
  transcript: string,
  prompt: string,
  level: string
): Promise<SpeakAnalysisResult> {
  const sysPrompt = `You are an encouraging English tutor for Vietnamese high schoolers (CEFR ${level}).
Given a learner prompt and the teen's spoken response, return STRICT JSON with this shape:
{
  "errors": [{"type": "grammar|vocab|pronunciation|fluency", "original": "...", "expected": "...", "hint": "..."}],
  "overall_score": 0-10,
  "encouragement": "1 short encouraging sentence in Vietnamese"
}
Max 5 errors. Be encouraging, age-appropriate. If the response is perfect, return empty errors array.
Return ONLY the JSON object — no markdown, no commentary.`;

  const raw = await provider.generateText({
    system: sysPrompt,
    messages: [
      {
        role: "user",
        content: `Prompt: ${prompt}\n\nLearner response (CEFR ${level}): ${transcript}`,
      },
    ],
    temperature: 0.3,
  });

  const trimmed = raw.trim();

  // Try parse JSON; if fail, wrap into safe defaults
  try {
    const parsed = JSON.parse(trimmed);
    const errors: SpeakError[] = Array.isArray(parsed.errors)
      ? parsed.errors.slice(0, 5).map((e: any) => ({
          type: typeof e.type === "string" ? e.type : "other",
          original: typeof e.original === "string" ? e.original : "",
          expected: typeof e.expected === "string" ? e.expected : "",
          hint: typeof e.hint === "string" ? e.hint : "",
        }))
      : [];
    const score =
      typeof parsed.overall_score === "number"
        ? Math.max(0, Math.min(10, parsed.overall_score))
        : 5;
    const encouragement =
      typeof parsed.encouragement === "string"
        ? parsed.encouragement
        : "Bạn đang tiến bộ từng ngày, cố lên nhé!";
    return {
      errors,
      overall_score: score,
      encouragement,
      raw_text: trimmed,
    };
  } catch {
    return {
      errors: [],
      overall_score: 5,
      encouragement: "Mình đã nghe bạn — hãy tiếp tục luyện tập nhé!",
      raw_text: trimmed,
    };
  }
}
