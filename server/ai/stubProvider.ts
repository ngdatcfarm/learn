/**
 * server/ai/stubProvider.ts — Offline fallback provider.
 *
 * Trả safe defaults khi không có GEMINI_API_KEY / MINIMAX_API_KEY.
 * Goal: app vẫn chạy được dev/local mà không cần API key.
 *
 * - generateText: random encouraging message
 * - generateJSON: trả shape rỗng phù hợp (caller validate sẽ fail → caller dùng placeholder)
 * - transcribe: placeholder text "(offline)"
 */

import {
  AiProvider,
  GenerateJsonOptions,
  GenerateTextOptions,
  TranscribeOptions,
  TranscribeResult,
} from "./provider";

const BACKUP_REPLIES = [
  "That's highly engaging! Let me suggest focusing on active recall. (Configure AI provider for real chat)",
  "Fascinating point! In academic English, we'd structure this using sub-clauses.",
  "That makes complete sense. Try to incorporate more academic vocabularies.",
  "Excellent response! Tell me more about what you intend to accomplish.",
];

export function createStubProvider(): AiProvider {
  return {
    async generateText(_opts: GenerateTextOptions): Promise<string> {
      return BACKUP_REPLIES[Math.floor(Math.random() * BACKUP_REPLIES.length)];
    },

    async generateJSON<T>(_opts: GenerateJsonOptions<T>): Promise<T> {
      // Trả object rỗng — caller validate sẽ fail và dùng placeholder riêng.
      return {} as T;
    },

    async transcribe(_opts: TranscribeOptions): Promise<TranscribeResult> {
      return {
        transcript: "(Offline: cấu hình AI provider để transcribe thật)",
        confidence: "low",
      };
    },

    info: () => ({
      name: "stub",
      model: "offline",
      available: false,
    }),
  };
}
