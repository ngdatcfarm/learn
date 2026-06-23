/**
 * server/ai/minimaxProvider.ts — Wrap OpenAI SDK (compatible với MiniMax API).
 *
 * MiniMax cung cấp OpenAI-compatible REST API:
 *   - baseURL: https://minimax.io  (configurable qua MINIMAX_BASE_URL)
 *   - chat.completions: tương thích OpenAI messages format
 *   - audio.transcriptions: dùng model "whisper-1"
 *
 * Sử dụng official `openai` npm package — không cần wrapper riêng.
 *
 * Env:
 *   - MINIMAX_API_KEY    (required)
 *   - MINIMAX_BASE_URL   (default: https://minimax.io)
 *   - MINIMAX_MODEL      (model name từ MiniMax dashboard)
 *
 * Response format JSON: dùng response_format: { type: 'json_object' } + parse.
 * Whisper: file → audio.transcriptions.create.
 */

import fs from "node:fs";
import OpenAI from "openai";
import {
  AiProvider,
  ChatMessage,
  GenerateJsonOptions,
  GenerateTextOptions,
  TranscribeOptions,
  TranscribeResult,
} from "./provider";

export function createMinimaxProvider(opts: {
  apiKey: string;
  baseURL?: string;
  model?: string;
}): AiProvider {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL || "https://minimax.io",
  });
  const model = opts.model || "minimax/minimax-m2";

  async function generateText(o: GenerateTextOptions): Promise<string> {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
    if (o.system) messages.push({ role: "system", content: o.system });
    for (const m of o.messages) {
      messages.push({
        role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
        content: m.content,
      });
    }
    const completion = await client.chat.completions.create({
      model: o.model || model,
      messages,
      temperature: o.temperature ?? 0.7,
    });
    const choice = completion.choices?.[0];
    return (choice?.message?.content || "").trim();
  }

  async function generateJSON<T>(o: GenerateJsonOptions<T>): Promise<T> {
    const messages: { role: "system" | "user"; content: string }[] = [];
    if (o.system) messages.push({ role: "system", content: o.system });
    messages.push({ role: "user", content: o.prompt });

    const completion = await client.chat.completions.create({
      model: o.model || model,
      messages,
      temperature: o.temperature ?? 0.3,
      response_format: { type: "json_object" },
    });
    const raw = (completion.choices?.[0]?.message?.content || "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`MiniMax returned non-JSON: ${raw.slice(0, 200)}`);
    }
    if (o.validate) {
      const validated = o.validate(parsed);
      if (validated == null) {
        throw new Error("MiniMax JSON failed validation");
      }
      return validated;
    }
    return parsed as T;
  }

  async function transcribe(o: TranscribeOptions): Promise<TranscribeResult> {
    if (!fs.existsSync(o.filePath)) {
      throw new Error("Audio file không tồn tại.");
    }
    // OpenAI SDK cần file stream + filename để detect mime.
    const stream = fs.createReadStream(o.filePath);
    const ext = o.mimeType.split("/")[1] || "webm";
    const transcription = await client.audio.transcriptions.create({
      file: stream as any,
      model: o.model || "whisper-1",
    });
    const text = (transcription.text || "").trim();
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
      name: "minimax",
      model,
      available: true,
    }),
  };
}
