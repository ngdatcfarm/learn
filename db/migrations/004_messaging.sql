-- =====================================================================
-- MIGRATION v4: Messaging — threads + messages + reads
-- Step 7: inbox nội bộ PH ↔ GV/Admin + broadcast
--
-- Thêm:
--   1. message_threads       — direct 1-1 + broadcast (1-n)
--   2. thread_participants   — direct thread membership
--   3. thread_reads          — last_read_at per (thread, user)
--   4. messages              — message body
--
-- Idempotency: CREATE TABLE IF NOT EXISTS.
-- Migration runner skip cả v4 nếu version=4 đã apply → an toàn.
-- =====================================================================

-- 1. message_threads: thread header (1-1 hoặc broadcast)
--    - type='direct'    → có thread_participants (1 sender + 1 recipient)
--    - type='broadcast' → target_role + target_class_id quyết định ai "xem được"
--                         (không tạo thread_participants)
CREATE TABLE IF NOT EXISTS message_threads (
  id              VARCHAR(36)  NOT NULL,
  type            VARCHAR(16)  NOT NULL,                  -- 'direct' | 'broadcast'
  subject         VARCHAR(255) NULL,                     -- broadcast only
  target_role     VARCHAR(16)  NULL,                     -- broadcast: 'parent'|'teacher'|'all'
  target_class_id VARCHAR(36)  NULL,                     -- broadcast: scope to class
  created_by      VARCHAR(36)  NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME     NULL,
  deleted_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_threads_creator (created_by),
  KEY idx_threads_class (target_class_id),
  KEY idx_threads_last_msg (last_message_at),
  CONSTRAINT fk_threads_creator FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_threads_class FOREIGN KEY (target_class_id)
    REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. thread_participants: chỉ áp dụng cho direct threads
--    Broadcast dùng target_role + target_class_id để tính visibility.
CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id  VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  joined_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id),
  KEY idx_tp_user (user_id),
  CONSTRAINT fk_tp_thread FOREIGN KEY (thread_id)
    REFERENCES message_threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tp_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. thread_reads: per-(thread, user) last_read_at
--    Upsert mỗi khi user mở thread → tính unread_count cho badge.
CREATE TABLE IF NOT EXISTS thread_reads (
  thread_id     VARCHAR(36) NOT NULL,
  user_id       VARCHAR(36) NOT NULL,
  last_read_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id),
  KEY idx_tr_user (user_id),
  CONSTRAINT fk_tr_thread FOREIGN KEY (thread_id)
    REFERENCES message_threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tr_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. messages: message body (1 row mỗi message)
CREATE TABLE IF NOT EXISTS messages (
  id          VARCHAR(36) NOT NULL,
  thread_id   VARCHAR(36) NOT NULL,
  sender_id   VARCHAR(36) NOT NULL,
  body        TEXT        NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME    NULL,
  PRIMARY KEY (id),
  KEY idx_messages_thread (thread_id, created_at),
  KEY idx_messages_sender (sender_id, created_at),
  CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id)
    REFERENCES message_threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id)
    REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
