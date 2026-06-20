-- =====================================================================
-- 010_live_help_observe.sql — Step 12d: Teacher Observation Mode + Whiteboard
--
-- Mở rộng live_help_sessions.trigger thêm 'teacher_observe' (GV-driven).
-- Tạo live_help_whiteboards để persist strokes của GV khi vẽ trên câu hỏi
-- trong observe session.
--
-- Mỗi (live_help_session_id, question_id) = 1 record duy nhất.
-- Strokes lưu dạng JSON array, mỗi stroke có color/size/points.
-- HS có thể xem lại strokes khi reopen session.
-- =====================================================================

ALTER TABLE live_help_sessions
  MODIFY COLUMN `trigger` ENUM('student_request','teacher_proactive','teacher_observe') NOT NULL;

CREATE TABLE live_help_whiteboards (
  id                     VARCHAR(36)  NOT NULL,
  live_help_session_id   VARCHAR(36)  NOT NULL,
  question_id            VARCHAR(36)  NOT NULL,
  teacher_id             VARCHAR(36)  NOT NULL,
  strokes_json           LONGTEXT     NOT NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_whiteboard_session_question (live_help_session_id, question_id),
  KEY idx_lhw_session (live_help_session_id),
  KEY idx_lhw_teacher (teacher_id),
  CONSTRAINT fk_lhw_session FOREIGN KEY (live_help_session_id) REFERENCES live_help_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_lhw_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  CONSTRAINT fk_lhw_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;