/**
 * server/ai/provider.ts — AiProvider interface (Step 13b Phase 0)
 *
 * Abstraction cho AI providers (Gemini, MiniMax, Stub). Tất cả AI calls
 * trong server đều qua interface này để dễ swap / A/B test.
 *
 * Methods:
 *   - generateText: free-form chat (system + messages)
 *   - generateJSON: structured output (cho reviews, suspicious detection, etc.)
 *   - transcribe:  audio → text (cho speak practice / speak error analysis)
 *
 * Implementations:
 *   - geminiProvider.ts (wrap hiện tại của @google/genai)
 *   - minimaxProvider.ts (OpenAI SDK với MINIMAX_BASE_URL)
 *   - stubProvider (fallback khi không có key nào — return safe defaults)
 */

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GenerateTextOptions {
  /** System prompt / instruction. */
  system?: string;
  /** Recent messages. Last message = user turn mới nhất. */
  messages: ChatMessage[];
  /** Sampling temperature (0 = deterministic, 1 = creative). Default 0.7. */
  temperature?: number;
  /** Model override (optional, dùng model mặc định của provider nếu không set). */
  model?: string;
}

export interface GenerateJsonOptions<T> {
  /** System prompt / instruction (should describe schema). */
  system?: string;
  /** User prompt (single string). */
  prompt: string;
  /** Sampling temperature. Default 0.3 (more deterministic cho JSON). */
  temperature?: number;
  /** Model override. */
  model?: string;
  /**
   * Optional validator. Nếu trả null/undefined → throw "Invalid shape".
   * Provider sẽ dùng JSON mode nhưng vẫn cần app-side guard cho production.
   */
  validate?: (parsed: unknown) => T | null | undefined;
}

export interface TranscribeOptions {
  /** Absolute path tới file audio (server-side). */
  filePath: string;
  /** MIME type (audio/webm, audio/mp3, audio/wav, ...). */
  mimeType: string;
  /** Optional model override. */
  model?: string;
}

export interface TranscribeResult {
  transcript: string;
  confidence: "low" | "medium" | "high";
}

export interface AiProviderInfo {
  /** Provider name: "minimax" | "gemini" | "stub". */
  name: string;
  /** Model mặc định đang dùng. */
  model: string;
  /** True nếu có key + sẵn sàng gọi API thật. */
  available: boolean;
}

export interface AiProvider {
  /** Generate free-form text response. */
  generateText(opts: GenerateTextOptions): Promise<string>;
  /** Generate structured JSON. Provider cố gắng đảm bảo parse được. */
  generateJSON<T = unknown>(opts: GenerateJsonOptions<T>): Promise<T>;
  /** Transcribe audio → text. */
  transcribe(opts: TranscribeOptions): Promise<TranscribeResult>;
  /** Info về provider (cho /api/health + debug). */
  info(): AiProviderInfo;
}
