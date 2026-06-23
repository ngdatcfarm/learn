/**
 * server/ai/geminiProvider.ts — Wrap Gemini SDK (@google/genai) qua AiProvider interface.
 *
 * Phase 0 refactor: chuyển logic từ server/ai.ts (cũ) sang đây, đồng thời
 * thêm `transcribe` + `generateJSON` chuẩn interface.
 *
 * Gemini API notes:
 *   - generateText: contents = [{ role, parts: [{ text }] }], systemInstruction via config
 *   - generateJSON: same nhưng config.responseMimeType = "application/json"
 *   - transcribe: inlineData (base64 audio) + text prompt
 *
 * Model: gemini-2.0-flash (mặc định — nhanh, rẻ).
 */

import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";
import {
  AiProvider,
  ChatMessage,
  GenerateJsonOptions,
  GenerateTextOptions,
  TranscribeOptions,
  TranscribeResult,
} from "./provider";

const DEFAULT_MODEL = "gemini-2.0-flash";

export function createGeminiProvider(apiKey: string): AiProvider {
  const client = new GoogleGenAI({ apiKey });

  function toGeminiContents(messages: ChatMessage[]) {
    return messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  }

  async function generateText(opts: GenerateTextOptions): Promise<string> {
    const response = await client.models.generateContent({
      model: opts.model || DEFAULT_MODEL,
      contents: toGeminiContents(opts.messages),
      config: {
        ...(opts.system ? { systemInstruction: opts.system } : {}),
        temperature: opts.temperature ?? 0.7,
      },
    });
    return (response.text || "").trim();
  }

  async function generateJSON<T>(opts: GenerateJsonOptions<T>): Promise<T> {
    const contents = [
      {
        role: "user" as const,
        parts: [{ text: opts.prompt }],
      },
    ];
    const response = await client.models.generateContent({
      model: opts.model || DEFAULT_MODEL,
      contents,
      config: {
        ...(opts.system ? { systemInstruction: opts.system } : {}),
        temperature: opts.temperature ?? 0.3,
        responseMimeType: "application/json",
      },
    });
    const raw = (response.text || "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
    }
    if (opts.validate) {
      const validated = opts.validate(parsed);
      if (validated == null) {
        throw new Error("Gemini JSON failed validation");
      }
      return validated;
    }
    return parsed as T;
  }

  async function transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    if (!fs.existsSync(opts.filePath)) {
      throw new Error("Audio file không tồn tại.");
    }
    const buf = fs.readFileSync(opts.filePath);
    const base64 = buf.toString("base64");
    const response = await client.models.generateContent({
      model: opts.model || DEFAULT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: opts.mimeType, data: base64 } },
            {
              text: "Transcribe the following teen English audio. Return ONLY the literal transcript, no commentary or labels.",
            },
          ],
        },
      ],
      config: { temperature: 0.1 },
    });
    const text = (response.text || "").trim();
    let confidence: TranscribeResult["confidence"] = "medium";
    if (!text) confidence = "low";
    else if (text.length > 20) confidence = "high";
    return { transcript: text, confidence };
  }

  return {
    generateText,
    generateJSON,
    transcribe,
    info: () => ({
      name: "gemini",
      model: DEFAULT_MODEL,
      available: true,
    }),
  };
}
