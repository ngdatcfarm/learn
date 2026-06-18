-- =====================================================================
-- MIGRATION v5: Flashcard reviews (SRS — Spaced Repetition System)
-- Step 9f: track per-user per-vocab state for SM-2 algorithm.
--
-- Schema:
--   flashcard_reviews
--     - PK: (user_id, vocab_id)
--     - vocab_id references question_bank.id where template_type='flashcard'
--     - SM-2 fields: repetitions, ease_factor, interval_days
--     - next_review_at: due date (NOW() for new cards = due immediately)
--     - last_reviewed_at, review_count, created_at for analytics
--
-- Idempotency: CREATE TABLE IF NOT EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  user_id          VARCHAR(36)  NOT NULL,
  vocab_id         VARCHAR(36)  NOT NULL,
  repetitions      INT          NOT NULL DEFAULT 0,
  ease_factor      DOUBLE       NOT NULL DEFAULT 2.5,
  interval_days    INT          NOT NULL DEFAULT 0,
  last_reviewed_at DATETIME     NULL,
  next_review_at   DATETIME     NOT NULL,
  review_count     INT          NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, vocab_id),
  KEY idx_fr_user_due (user_id, next_review_at),
  CONSTRAINT fk_fr_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_fr_vocab FOREIGN KEY (vocab_id)
    REFERENCES question_bank(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
