/**
 * server/jobs/classSessionDetector.ts — Step 13b Phase 6
 *
 * Pure function: detect "suspicious" task_done (HS submit quá nhanh).
 *
 * Threshold:
 *   - Short questions (text < 200 chars OR tags include "short") → 30s
 *   - Normal/long questions → 90s
 *
 * HS bị flag khi time_ms < threshold cho 1 câu cụ thể.
 *
 * Called từ server/engagement.ts khi nhận task_done event:
 *   - Lookup latest task_started (same context.question_id)
 *   - Lookup question_bank.text + tags
 *   - Compute time_ms
 *   - If suspicious + HS in active class_session → emit socket event
 *
 * Helper thuần (no I/O) để testable. Engagement handler đọc threshold,
 * apply context, emit.
 */

export interface DetectInput {
  /** Time (ms) từ task_started → task_done. */
  time_ms: number;
  /** Question text (để check "short"). */
  question_text?: string | null;
  /** Question tags (comma-separated string từ DB). */
  question_tags?: string | null;
}

export interface DetectResult {
  suspicious: boolean;
  time_ms: number;
  /** "short" (≤ 200 chars hoặc có tag short) → 30s threshold; ngược lại 90s. */
  threshold_ms: number;
  reason?: "short_below_30s" | "normal_below_90s";
}

/** Threshold cho short questions (≤ 200 chars hoặc tagged "short"). */
export const SHORT_THRESHOLD_MS = 30_000;
/** Threshold cho normal/long questions. */
export const NORMAL_THRESHOLD_MS = 90_000;

export function isShortQuestion(
  text?: string | null,
  tagsCsv?: string | null
): boolean {
  if (text != null && text.length > 0 && text.length < 200) return true;
  if (tagsCsv && typeof tagsCsv === "string") {
    const tags = tagsCsv.toLowerCase().split(",").map((t) => t.trim());
    if (tags.includes("short")) return true;
  }
  return false;
}

export function detectSuspicious(input: DetectInput): DetectResult {
  const short = isShortQuestion(input.question_text, input.question_tags);
  const threshold = short ? SHORT_THRESHOLD_MS : NORMAL_THRESHOLD_MS;
  const suspicious = input.time_ms < threshold && input.time_ms >= 0;
  return {
    suspicious,
    time_ms: input.time_ms,
    threshold_ms: threshold,
    reason: suspicious
      ? short
        ? "short_below_30s"
        : "normal_below_90s"
      : undefined,
  };
}
