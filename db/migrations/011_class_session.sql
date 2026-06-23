-- =====================================================================
-- 011_class_session.sql — Step 13b: "Lớp hôm nay" Class Sessions
--
-- Khái niệm: GV-driven classroom session (1 lớp, 1 buổi, có GV trực tiếp).
-- Mỗi session có:
--   - class_sessions             (1 row / buổi, lifecycle: planned → active → ended)
--   - class_session_handups      (queue table — HS giơ tay xin hỗ trợ)
--   - class_session_reviews      (AI-generated review sau buổi, 1 row / session)
--   - class_session_board_pushes (forced-focus: GV đẩy câu hỏi lên màn HS)
--   - class_session_tab_events   (tab visibility tracking — GV xem HS có tập trung không)
--
-- Mở rộng:
--   - live_help_sessions.class_session_id (FK cho 1-1 voice qua class session trigger)
--   - live_help_sessions.trigger           thêm 'class_session'
--   - engagement_events.event              thêm 8 event mới (class_session_started ... class_board_dismiss_requested)
--
-- LƯU Ý THỨ TỰ (bug fix 2026-06-23):
--   class_sessions phải CREATE trước khi ALTER live_help_sessions thêm FK
--   trỏ vào nó. migrate.ts split theo `;` và chạy tuần tự, nên reorder trong
--   file này là đủ — không cần đổi logic ở migrate.ts.
-- =====================================================================

-- 1. Extend live_help_sessions.trigger enum (additive — giữ old values)
ALTER TABLE live_help_sessions
  MODIFY COLUMN `trigger` ENUM('student_request','teacher_proactive','teacher_observe','class_session') NOT NULL;

-- 2. Extend engagement_events.event enum (additive)
ALTER TABLE engagement_events
  MODIFY COLUMN event ENUM(
    'session_start','session_end','task_done','task_started','task_abandoned',
    'hint_used','error_occurred','help_request','highlight_used',
    'voice_call_started','voice_call_ended',
    'class_session_started','class_session_ended',
    'class_tab_visible','class_tab_hidden',
    'class_hand_up','class_hand_up_claimed',
    'class_board_pushed','class_board_dismiss_requested'
  ) NOT NULL;

-- 3. Main class session table (PHẢI tạo trước khi các bước sau FK vào nó)
CREATE TABLE class_sessions (
  id                       VARCHAR(36)  NOT NULL,
  class_id                 VARCHAR(36)  NOT NULL,
  teacher_id               VARCHAR(36)  NOT NULL,
  planned_question_ids     JSON         NULL,
  started_at               DATETIME     NULL,
  ended_at                 DATETIME     NULL,
  status                   ENUM('planned','active','ended','cancelled') NOT NULL DEFAULT 'planned',
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cs_class (class_id, status),
  KEY idx_cs_teacher (teacher_id, status),
  KEY idx_cs_status_time (status, started_at),
  CONSTRAINT fk_cs_class   FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Add class_session_id column + FK (giờ class_sessions đã tồn tại)
ALTER TABLE live_help_sessions
  ADD COLUMN class_session_id VARCHAR(36) NULL AFTER class_id,
  ADD KEY idx_lhs_class_session (class_session_id),
  ADD CONSTRAINT fk_lhs_class_session FOREIGN KEY (class_session_id) REFERENCES class_sessions(id) ON DELETE SET NULL;

-- 5. Hand-up queue — HS giơ tay xin hỗ trợ trong buổi học
CREATE TABLE class_session_handups (
  id               VARCHAR(36)  NOT NULL,
  class_session_id VARCHAR(36)  NOT NULL,
  student_id       VARCHAR(36)  NOT NULL,
  question_id      VARCHAR(36)  NULL,
  message          TEXT         NULL,
  queue_position   INT          NOT NULL DEFAULT 0,
  status           ENUM('queued','claimed','dismissed','cancelled') NOT NULL DEFAULT 'queued',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at       DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_csh_session (class_session_id, status, queue_position),
  KEY idx_csh_student (student_id, status),
  CONSTRAINT fk_csh_session  FOREIGN KEY (class_session_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_csh_student  FOREIGN KEY (student_id)       REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT fk_csh_question FOREIGN KEY (question_id)      REFERENCES question_bank(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. AI-generated reviews (UNIQUE per class_session — 1 review / buổi)
CREATE TABLE class_session_reviews (
  id               VARCHAR(36)  NOT NULL,
  class_session_id VARCHAR(36)  NOT NULL,
  payload_json     LONGTEXT     NOT NULL,
  model            VARCHAR(32)  NOT NULL,
  generated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_csr_session (class_session_id),
  CONSTRAINT fk_csr_session FOREIGN KEY (class_session_id) REFERENCES class_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Forced-focus board pushes (GV đẩy câu hỏi lên màn HS, không dismiss được)
CREATE TABLE class_session_board_pushes (
  id                      VARCHAR(36)  NOT NULL,
  class_session_id        VARCHAR(36)  NOT NULL,
  teacher_id              VARCHAR(36)  NOT NULL,
  student_id              VARCHAR(36)  NOT NULL,
  question_id             VARCHAR(36)  NULL,
  note                    TEXT         NULL,
  dismissed_requested_at  DATETIME     NULL,
  dismissed_at            DATETIME     NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_csbp_session (class_session_id),
  KEY idx_csbp_student (student_id, created_at),
  CONSTRAINT fk_csbp_session  FOREIGN KEY (class_session_id) REFERENCES class_sessions(id)   ON DELETE CASCADE,
  CONSTRAINT fk_csbp_teacher  FOREIGN KEY (teacher_id)       REFERENCES users(id)           ON DELETE CASCADE,
  CONSTRAINT fk_csbp_student  FOREIGN KEY (student_id)       REFERENCES users(id)           ON DELETE CASCADE,
  CONSTRAINT fk_csbp_question FOREIGN KEY (question_id)      REFERENCES question_bank(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tab visibility events (mobile HS vào/ra nhiều — append-only log)
CREATE TABLE class_session_tab_events (
  id               VARCHAR(36)  NOT NULL,
  class_session_id VARCHAR(36)  NOT NULL,
  student_id       VARCHAR(36)  NOT NULL,
  event            ENUM('visible','hidden') NOT NULL,
  session_visible_ms INT        NOT NULL DEFAULT 0,
  occurred_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cste_session_student (class_session_id, student_id, occurred_at DESC),
  CONSTRAINT fk_cste_session FOREIGN KEY (class_session_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_cste_student FOREIGN KEY (student_id)       REFERENCES users(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
