/**
 * server/flashcards.ts — SRS flashcard endpoints (Step 9f)
 *
 * Spaced Repetition System (SM-2 algorithm) cho từ vựng.
 *
 * Endpoints:
 *   - GET  /api/flashcards/due?limit=20
 *       Trả về danh sách thẻ cần ôn:
 *         (a) Thẻ MỚI — chưa có flashcard_reviews row (LEFT JOIN miss)
 *         (b) Thẻ ĐÃ ÔN — có row, next_review_at <= NOW()
 *       Order: new cards first (NULL next_review_at ASC), then due cards oldest first.
 *   - POST /api/flashcards/review
 *       Body: { vocabId: string, quality: 1|3|4|5 }
 *       Upsert flashcard_reviews với SM-2 state mới.
 *       Trả về { ok, nextReviewAt, repetitions, intervalDays, easeFactor }
 *
 * SM-2 algorithm (SuperMemo-2):
 *   - quality < 3 → reset repetitions=0, interval=1 day
 *   - quality >= 3:
 *       - repetitions == 0 → interval = 1 day
 *       - repetitions == 1 → interval = 6 days
 *       - repetitions >  1 → interval = round(interval * easeFactor)
 *       - repetitions += 1
 *   - easeFactor = max(1.3, easeFactor + 0.1 - (5-q) * (0.08 + (5-q) * 0.02))
 *
 * Vocab source: question_bank với template_type='flashcard' (đã có sẵn ở v1).
 * content_json shape: { term, phonetic, explanation, example }
 *
 * Practice flow: xem thẻ → click "Lật" → 4 nút Again/Hard/Good/Easy
 * quality mapping: Again=1, Hard=3, Good=4, Easy=5
 */

import { Router, Request, Response } from "express";
import { requireUser } from "./auth";
import { query } from "../db/client";

// ============================================================
// SM-2 algorithm — pure function, easy to test
// ============================================================

export interface ReviewState {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
}

export interface ReviewResult extends ReviewState {
  /** ISO datetime string for next review. */
  nextReviewAt: string;
}

/**
 * Compute next review state using SM-2.
 * @param quality 1-5 (1=forgot, 3=hard, 4=good, 5=easy)
 * @param current Current state (for first review, use defaults)
 */
export function computeNextReview(quality: number, current: ReviewState): ReviewResult {
  // Clamp quality to [0, 5] for safety (defensive — FE should send 1/3/4/5)
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  let repetitions = current.repetitions;
  let intervalDays = current.intervalDays;
  let easeFactor = current.easeFactor;

  if (q < 3) {
    // Failed — reset streak
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }
    repetitions += 1;
  }

  // Update ease factor (Anki formula). Floor at 1.3 (algorithm minimum).
  const newEase = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  easeFactor = Math.max(1.3, newEase);

  const nextReviewAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    repetitions,
    intervalDays,
    easeFactor,
    nextReviewAt: nextReviewAt.toISOString(),
  };
}

// ============================================================
// Public types
// ============================================================

export interface FlashcardItem {
  vocabId: string;
  topic: string | null;
  level: string | null;
  term: string;
  phonetic: string | null;
  explanation: string | null;
  example: string | null;
  /** True nếu là thẻ mới (chưa review lần nào). */
  isNew: boolean;
  /** Trạng thái SRS nếu đã review trước đó. */
  review: {
    repetitions: number;
    easeFactor: number;
    intervalDays: number;
    nextReviewAt: string;
  } | null;
}

export interface ReviewSubmitResult {
  ok: true;
  vocabId: string;
  quality: number;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: string;
}

// ============================================================
// Router
// ============================================================

export function flashcardsRouter(): Router {
  const router = Router();

  // ============================================================
  // GET /api/flashcards/due?limit=20
  // ============================================================
  router.get("/due", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

    // LEFT JOIN: cards chưa có review row (new) HOẶC đã đến hạn (next_review_at <= NOW).
    // Order: new cards trước (NULL first), sau đó due cards cũ nhất.
    const rows = await query<Array<{
      vocab_id: string;
      topic: string | null;
      level: string | null;
      content_json: string;
      repetitions: number | null;
      ease_factor: number | null;
      interval_days: number | null;
      next_review_at: Date | null;
      review_count: number | null;
    }>>(
      `SELECT qb.id              AS vocab_id,
              qb.topic           AS topic,
              qb.level           AS level,
              qb.content_json    AS content_json,
              fr.repetitions     AS repetitions,
              fr.ease_factor     AS ease_factor,
              fr.interval_days   AS interval_days,
              fr.next_review_at  AS next_review_at,
              fr.review_count    AS review_count
         FROM question_bank qb
         LEFT JOIN flashcard_reviews fr
           ON fr.vocab_id = qb.id AND fr.user_id = ?
        WHERE qb.template_type = 'flashcard'
          AND (qb.is_shared = 1 OR qb.owner_id = ?)
          AND (fr.next_review_at IS NULL OR fr.next_review_at <= NOW())
        ORDER BY fr.next_review_at IS NULL DESC,
                 fr.next_review_at ASC,
                 qb.created_at ASC
        LIMIT ?`,
      [user.id, user.id, limit]
    );

    const items: FlashcardItem[] = [];
    for (const r of rows) {
      let content: {
        term?: string;
        phonetic?: string;
        explanation?: string;
        example?: string;
      } = {};
      try {
        content = JSON.parse(r.content_json) || {};
      } catch {
        // skip malformed
        continue;
      }
      if (!content.term) continue;
      const isNew = r.review_count === null;
      items.push({
        vocabId: r.vocab_id,
        topic: r.topic,
        level: r.level,
        term: content.term,
        phonetic: content.phonetic || null,
        explanation: content.explanation || null,
        example: content.example || null,
        isNew,
        review: isNew
          ? null
          : {
              repetitions: r.repetitions || 0,
              easeFactor: r.ease_factor || 2.5,
              intervalDays: r.interval_days || 0,
              nextReviewAt:
                r.next_review_at instanceof Date
                  ? r.next_review_at.toISOString()
                  : String(r.next_review_at),
            },
      });
    }

    res.json({ items, count: items.length });
  });

  // ============================================================
  // POST /api/flashcards/review
  // ============================================================
  router.post("/review", async (req: Request, res: Response) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { vocabId, quality } = (req.body || {}) as {
        vocabId?: string;
        quality?: number;
      };
      if (!vocabId || typeof quality !== "number") {
        return res.status(400).json({ error: "Thiếu vocabId hoặc quality." });
      }
      if (![1, 3, 4, 5].includes(quality)) {
        return res.status(400).json({ error: "quality phải là 1, 3, 4 hoặc 5." });
      }

      // Verify vocab exists + accessible (shared hoặc owned by user)
      const rows = await query<Array<{ id: string }>>(
        `SELECT id FROM question_bank
          WHERE id = ? AND template_type = 'flashcard'
            AND (is_shared = 1 OR owner_id = ?)
          LIMIT 1`,
        [vocabId, user.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Vocab không tồn tại." });
      }

      // Read current review state (or defaults for new card)
      const currentRows = await query<Array<{
        repetitions: number;
        ease_factor: number;
        interval_days: number;
      }>>(
        `SELECT repetitions, ease_factor, interval_days
           FROM flashcard_reviews
          WHERE user_id = ? AND vocab_id = ?
          LIMIT 1`,
        [user.id, vocabId]
      );
      const current: ReviewState =
        currentRows.length > 0
          ? {
              repetitions: currentRows[0].repetitions,
              easeFactor: currentRows[0].ease_factor,
              intervalDays: currentRows[0].interval_days,
            }
          : { repetitions: 0, easeFactor: 2.5, intervalDays: 0 };

      const next = computeNextReview(quality, current);

      // Upsert: INSERT for new card, UPDATE for existing. ON DUPLICATE KEY UPDATE
      // tăng review_count + 1 và update SRS fields.
      await query(
        `INSERT INTO flashcard_reviews
            (user_id, vocab_id, repetitions, ease_factor, interval_days,
             last_reviewed_at, next_review_at, review_count, created_at)
         VALUES (?, ?, ?, ?, ?, NOW(), ?, 1, NOW())
         ON DUPLICATE KEY UPDATE
            repetitions      = VALUES(repetitions),
            ease_factor      = VALUES(ease_factor),
            interval_days    = VALUES(interval_days),
            last_reviewed_at = NOW(),
            next_review_at   = VALUES(next_review_at),
            review_count     = review_count + 1`,
        [
          user.id,
          vocabId,
          next.repetitions,
          next.easeFactor,
          next.intervalDays,
          new Date(next.nextReviewAt),
        ]
      );

      const result: ReviewSubmitResult = {
        ok: true,
        vocabId,
        quality,
        repetitions: next.repetitions,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        nextReviewAt: next.nextReviewAt,
      };
      res.json(result);
    } catch (err: any) {
      console.error("Flashcard review error:", err);
      res.status(500).json({ error: err.message || "Review thất bại." });
    }
  });

  return router;
}
