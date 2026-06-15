/**
 * server/ai.ts — AI Tutor endpoints (Gemini proxy)
 *
 * Giữ nguyên logic từ server.ts gốc, tách ra để code sạch hơn.
 */

import { Router, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";

export function aiRouter(ai: GoogleGenAI | null): Router {
  const router = Router();

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

  return router;
}
