-- =====================================================================
-- MIGRATION v7: Streak protection (auto-freeze) + daily nudge
-- Step 11 — giữ streak HS khi quên 1 ngày, nhắc PH + GV khi HS chưa học
--
-- Thêm 2 tables:
--   1. streak_freezes — 1 user chỉ được freeze 1 ngày/tuần (ISO week, Mon-Sun)
--      → UNIQUE (user_id, week_start_date) đảm bảo idempotency
--      → used_for_date = ngày cụ thể bị "đóng băng" streak
--      → streakFreeze job chạy 00:05 hàng ngày, check events HÔM QUA:
--         * Có events → không cần freeze (streak tự extend)
--         * Không có events + chưa freeze tuần này → INSERT
--         * Không có events + đã freeze tuần này → streak tự reset (gap 2 ngày)
--   2. daily_nudges — log 1 row/ngày cho mỗi HS đã gửi reminder, idempotency
--      cho streakNudge job (tránh gửi trùng nếu cron restart, retry)
--      → UNIQUE (user_id, nudge_date)
--      → streakNudge job chạy 19:00 hàng ngày, gửi message in-app cho PH + GV
--         khi HS chưa có events hôm nay
--
-- computeEngagement consult streak_freezes.used_for_date như "had activity"
-- để streak không bị tính là gap khi compute từ events.
--
-- Idempotency: CREATE TABLE IF NOT EXISTS + UNIQUE đảm bảo migrate chạy nhiều
-- lần an toàn. Migration runner skip v7 nếu version=7 đã apply.
-- =====================================================================

CREATE TABLE IF NOT EXISTS streak_freezes (
  id              VARCHAR(36)  NOT NULL,                       -- UUID v4
  user_id         VARCHAR(36)  NOT NULL,                       -- FK → users
  week_start_date DATE         NOT NULL,                       -- Monday của tuần ISO
  used_for_date   DATE         NOT NULL,                       -- Ngày cụ thể bị đóng băng
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_freeze_user_week (user_id, week_start_date),   -- max 1 freeze/tuần
  KEY idx_freeze_user_date (user_id, used_for_date),
  CONSTRAINT fk_freeze_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_nudges (
  id          VARCHAR(36)  NOT NULL,                           -- UUID v4
  user_id     VARCHAR(36)  NOT NULL,                           -- FK → users (HS)
  nudge_date  DATE         NOT NULL,                           -- Ngày gửi reminder
  sent_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_nudge_user_date (user_id, nudge_date),         -- max 1 reminder/HS/ngày
  KEY idx_nudge_date (nudge_date),
  CONSTRAINT fk_nudge_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
