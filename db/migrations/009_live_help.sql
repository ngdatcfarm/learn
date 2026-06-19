-- =====================================================================
-- 009_live_help.sql — Live Help T3 (GV ↔ HS, 1-1 realtime support)
--
-- Step 12a — Cấp 1 (Text hint). Schema anticipate cho Cấp 3 (highlight)
-- + Cấp 2 (voice) sẽ dùng cùng session table, thêm event/level sau.
--
-- Tables:
--   - live_help_sessions: 1 row / episode, track trigger + status + outcome
--   - live_help_hints: text messages giữa HS ↔ GV trong session
--   - live_help_highlights: events cho Cấp 3 (CSS selector + color + note)
--
-- Trigger types:
--   - student_request: HS bấm "🆘 Cần hỗ trợ"
--   - teacher_proactive: GV chủ động vào hỏi HS
--
-- Level (mở rộng sau):
--   - text: Cấp 1 (default, ship ở commit này)
--   - highlight: Cấp 3 (Slice B)
--   - voice: Cấp 2 (Slice C)
--   - mixed: nhiều cấp trong 1 session
-- =====================================================================

CREATE TABLE live_help_sessions (
  id            VARCHAR(36)  NOT NULL,
  class_id      VARCHAR(36)  NULL,
  student_id    VARCHAR(36)  NOT NULL,
  teacher_id    VARCHAR(36)  NOT NULL,
  assignment_id VARCHAR(36)  NULL,
  trigger       ENUM('student_request','teacher_proactive') NOT NULL,
  level         ENUM('text','voice','highlight','mixed') NOT NULL DEFAULT 'text',
  status        ENUM('pending','active','ended') NOT NULL DEFAULT 'pending',
  started_at    DATETIME     NULL,
  ended_at      DATETIME     NULL,
  outcome       ENUM('understood','gave_up','timeout','teacher_left') NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lhs_student (student_id, status),
  KEY idx_lhs_teacher (teacher_id, status),
  KEY idx_lhs_class   (class_id, status),
  CONSTRAINT fk_lhs_student FOREIGN KEY (student_id) REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_lhs_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_lhs_class   FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE live_help_hints (
  id          VARCHAR(36)  NOT NULL,
  session_id  VARCHAR(36)  NOT NULL,
  sender_id   VARCHAR(36)  NOT NULL,
  message     TEXT         NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lhh_session (session_id, created_at),
  CONSTRAINT fk_lhh_session FOREIGN KEY (session_id) REFERENCES live_help_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_lhh_sender  FOREIGN KEY (sender_id)  REFERENCES users(id)             ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anticipate cho Slice B (highlight) — table rỗng cho tới khi implement.
CREATE TABLE live_help_highlights (
  id          VARCHAR(36)  NOT NULL,
  session_id  VARCHAR(36)  NOT NULL,
  teacher_id  VARCHAR(36)  NOT NULL,
  selector    VARCHAR(255) NOT NULL,
  color       VARCHAR(16)  NOT NULL DEFAULT 'yellow',
  note        TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lhhl_session (session_id, created_at),
  CONSTRAINT fk_lhhl_session FOREIGN KEY (session_id) REFERENCES live_help_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_lhhl_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)             ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;