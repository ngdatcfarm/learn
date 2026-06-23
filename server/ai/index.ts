/**
 * server/ai/index.ts — Factory chọn AiProvider theo env.
 *
 * Pattern giống server/turn.ts:198-213 — env-driven factory.
 *
 * Priority:
 *   1. MINIMAX_API_KEY set + valid → MiniMax (ưu tiên vì OpenAI-compatible ổn định)
 *   2. GEMINI_API_KEY set → Gemini
 *   3. Còn lại → StubProvider (offline fallback)
 *
 * Logger 1 dòng khi init để debug.
 */

import { AiProvider } from "./provider";
import { createGeminiProvider } from "./geminiProvider";
import { createMinimaxProvider } from "./minimaxProvider";
import { createStubProvider } from "./stubProvider";

export function createAiProvider(): AiProvider {
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (minimaxKey && minimaxKey !== "REPLACE_ME_WITH_YOUR_MINIMAX_KEY") {
    const baseURL = process.env.MINIMAX_BASE_URL || "https://minimax.io";
    const model = process.env.MINIMAX_MODEL || undefined;
    console.log(`✓ AI provider: MiniMax (base=${baseURL}, model=${model || "default"})`);
    return createMinimaxProvider({ apiKey: minimaxKey, baseURL, model });
  }

  if (geminiKey) {
    console.log("✓ AI provider: Gemini");
    return createGeminiProvider(geminiKey);
  }

  console.warn(
    "⚠  No AI provider configured — endpoints chạy chế độ offline fallback (stub). Set MINIMAX_API_KEY or GEMINI_API_KEY in .env."
  );
  return createStubProvider();
}
