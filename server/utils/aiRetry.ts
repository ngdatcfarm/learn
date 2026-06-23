/**
 * server/utils/aiRetry.ts — Step 13b Phase 5: retry helper for AI calls.
 *
 * `withRetry<T>(fn, attempts=3, baseDelayMs=500)`: exponential backoff
 * cho transient AI failures (rate limit, 5xx).
 *
 * Usage:
 *   const result = await withRetry(
 *     () => provider.generateJSON({ ... }),
 *     3,  // attempts
 *     500 // base delay ms
 *   );
 */

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      // Exponential backoff: 500ms, 1000ms, 2000ms, ...
      const delay = baseDelayMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
