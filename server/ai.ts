/**
 * server/ai.ts — AI Tutor endpoints (Gemini proxy)
 *
 * Endpoints (Step 9b):
 *   - POST /api/tutor/chat          — text chat (existing)
 *   - POST /api/tutor/analyze       — fix/suggest/translate (existing)
 *   - POST /api/tutor/transcribe    — audio_url → transcript (NEW Step 9b)
 *   - POST /api/tutor/speak-analyze — transcript + prompt → error JSON (NEW Step 9b)
 *
 * Step 9b: thêm 2 endpoints cho multimodal (audio → text → error analysis).
 * Internal helpers `transcribeFromUrl` + `speakAnalyze` được export để 9c/9d
 * (dictation/speaking/shadowing practice endpoints) dùng mà không cần HTTP self-call.
 *
 * Offline fallback: nếu !GEMINI_API_KEY → trả stub message (giống /chat).
 */

import { Router, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { UPLOAD_DIR, assertSafeUploadUrl } from "./audio";
import { requireUser } from "./auth";

// ============================================================
// Public types — exposed cho 9c/9d practice endpoints
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

export function aiRouter(ai: GoogleGenAI | null): Router {
  const router = Router();

  // ============================================================
  // Existing /chat (kept)
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

      const contents = messages.map((msg: any) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      if (!ai) {
        const lastMsg = messages[messages.length - 1]?.content || "";
        const backupReplies = [
          `That's highly engaging! Let me suggest focusing on active recall. (Setup GEMINI_API_KEY for real chat)`,
          `Fascinating point! In academic English, we'd structure this using sub-clauses.`,
          `That makes complete sense. Try to incorporate more academic vocabularies.`,
          `Excellent response! Tell me more about what you intend to accomplish.`,
        ];
        return res.json({ text: backupReplies[Math.floor(Math.random() * backupReplies.length)] });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents,
        config: { systemInstruction: sysInstruction, temperature: 0.7 },
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("AI chat error:", err);
      res.status(500).json({ error: err.message || "AI error" });
    }
  });

  // ============================================================
  // Existing /analyze (kept)
  // ============================================================
  router.post("/analyze", async (req: Request, res: Response) => {
    try {
      const { action, text } = req.body || {};
      if (!action || !text) {
        return res.status(400).json({ error: "Thiếu action hoặc text." });
      }

      if (!ai) {
        if (action === "fix") {
          return res.json({ analysis: `✨ **Offline**: Configure GEMINI_API_KEY for real corrections.` });
        } else if (action === "suggest") {
          return res.json({
            analysis: `💡 **3 gợi ý (Offline)**:\n1. "I understand your perspective..."\n2. "That sounds fascinating..."\n3. "From my point of view..."`,
          });
        } else {
          return res.json({ analysis: `🇻🇳 **Dịch (Offline)**: ${text}` });
        }
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

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { temperature: 0.3 },
      });

      res.json({ analysis: response.text });
    } catch (err: any) {
      console.error("AI analyze error:", err);
      res.status(500).json({ error: err.message || "AI error" });
    }
  });

  // ============================================================
  // NEW Step 9b: /transcribe — audio → text
  // ============================================================
  router.post("/transcribe", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { audio_url, mime } = req.body || {};
      if (!audio_url) {
        return res.status(400).json({ error: "Thiếu audio_url." });
      }
      const result = await transcribeFromUrl(ai, audio_url, mime || "audio/webm");
      res.json(result);
    } catch (err: any) {
      console.error("Transcribe error:", err);
      res.status(500).json({ error: err.message || "Transcribe thất bại" });
    }
  });

  // ============================================================
  // NEW Step 9b: /speak-analyze — transcript + prompt → error JSON
  // ============================================================
  router.post("/speak-analyze", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { transcript, prompt, level } = req.body || {};
      if (!transcript || !prompt) {
        return res.status(400).json({ error: "Thiếu transcript hoặc prompt." });
      }
      // Cap transcript length before sending to Gemini
      const capped =
        typeof transcript === "string" && transcript.length > 1500
          ? transcript.slice(0, 1500)
          : transcript;
      const result = await speakAnalyze(ai, capped, prompt, level || "A2");
      res.json(result);
    } catch (err: any) {
      console.error("Speak-analyze error:", err);
      res.status(500).json({ error: err.message || "Speak-analyze thất bại" });
    }
  });

  return router;
}

// ============================================================
// Internal helpers — exported để 9c/9d dùng mà không cần HTTP
// ============================================================

/**
 * Read audio file from disk + send to Gemini as inlineData → return transcript.
 * Throws on missing file / read error.
 */
export async function transcribeFromUrl(
  ai: GoogleGenAI | null,
  audioUrl: string,
  mime: string
): Promise<{ transcript: string; confidence: "low" | "medium" | "high" }> {
  // Resolve file path (centralized validation)
  assertSafeUploadUrl(audioUrl);
  const rel = audioUrl.replace(/^\//, "");
  const abs = path.join(UPLOAD_DIR, rel);
  if (!fs.existsSync(abs)) {
    throw new Error("File không tồn tại.");
  }
  const buf = fs.readFileSync(abs);
  const base64 = buf.toString("base64");

  if (!ai) {
    return { transcript: "(Offline: cấu hình GEMINI_API_KEY để transcribe thật)", confidence: "low" };
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: { mimeType: mime, data: base64 },
          },
          {
            text: "Transcribe the following teen English audio. Return ONLY the literal transcript, no commentary or labels.",
          },
        ],
      },
    ],
    config: { temperature: 0.1 },
  });

  const text = (response.text || "").trim();
  // Confidence heuristic: short/empty = low; otherwise medium
  let confidence: "low" | "medium" | "high" = "medium";
  if (!text) confidence = "low";
  else if (text.length > 20) confidence = "high";
  return { transcript: text, confidence };
}

/**
 * Send (transcript, prompt, level) → Gemini → parse JSON { errors, overall_score, encouragement }.
 * Falls back to text wrap if Gemini returns non-JSON.
 */
export async function speakAnalyze(
  ai: GoogleGenAI | null,
  transcript: string,
  prompt: string,
  level: string
): Promise<SpeakAnalysisResult> {
  if (!ai) {
    return {
      errors: [],
      overall_score: 5,
      encouragement: "Cấu hình GEMINI_API_KEY để nhận phân tích chi tiết nhé!",
      raw_text: "",
    };
  }

  const sysPrompt = `You are an encouraging English tutor for Vietnamese high schoolers (CEFR ${level}).
Given a learner prompt and the teen's spoken response, return STRICT JSON with this shape:
{
  "errors": [{"type": "grammar|vocab|pronunciation|fluency", "original": "...", "expected": "...", "hint": "..."}],
  "overall_score": 0-10,
  "encouragement": "1 short encouraging sentence in Vietnamese"
}
Max 5 errors. Be encouraging, age-appropriate. If the response is perfect, return empty errors array.
Return ONLY the JSON object — no markdown, no commentary.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: `Prompt: ${prompt}\n\nLearner response (CEFR ${level}): ${transcript}` },
        ],
      },
    ],
    config: {
      systemInstruction: sysPrompt,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });

  const raw = (response.text || "").trim();

  // Try parse JSON; if fail, wrap into safe defaults
  try {
    const parsed = JSON.parse(raw);
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
      raw_text: raw,
    };
  } catch {
    // Fallback — wrap as non-JSON
    return {
      errors: [],
      overall_score: 5,
      encouragement: "Mình đã nghe bạn — hãy tiếp tục luyện tập nhé!",
      raw_text: raw,
    };
  }
}
