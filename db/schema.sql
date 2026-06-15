-- =====================================================================
-- SCHEMA: Tiếng Anh của mình — Learner Model + Hybrid Classroom
-- Engine: MySQL 8.0+ (InnoDB, utf8mb4)
-- Nguyên tắc: skill_measurements + engagement_events là APPEND-ONLY
--            (event log), mọi state khác DERIVE từ log.
--
-- Charset: utf8mb4 hỗ trợ full Unicode (emoji, tiếng Việt có dấu)
-- Engine: InnoDB bắt buộc để hỗ trợ FOREIGN KEY + transactions
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 1. USERS — Hồ sơ đăng nhập (HS + PH + GV + Admin)
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
  id                  VARCHAR(36)  NOT NULL,                     -- UUID v4
  username            VARCHAR(64)  NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,                     -- scrypt hash hex
  password_salt       VARCHAR(64)  NOT NULL,                     -- scrypt salt hex
  role                VARCHAR(16)  NOT NULL,                     -- 'student'|'parent'|'teacher'|'admin'
  name                VARCHAR(128) NOT NULL,
  -- Student-specific (NULL với PH/GV/Admin)
  level               VARCHAR(20)  NULL,                         -- 'Beginner'|'Intermediate'|'Advanced'
  cefr_level          VARCHAR(4)   NULL,                         -- 'A1'..'C2'
  goal                VARCHAR(32)  NULL,                         -- 'IELTS'|'Giao tiếp'|'Học thuật'|'Tổng quát'
  daily_goal_minutes  TINYINT      NULL DEFAULT 15,              -- 5|15|30
  -- Audit
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at       DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 2. CLASSES — Lớp học (mỗi GV tạo lớp, gán HS vào)
-- =====================================================================
CREATE TABLE IF NOT EXISTS classes (
  id          VARCHAR(36)  NOT NULL,
  name        VARCHAR(128) NOT NULL,                             -- "Lớp 7A - T3/T6"
  teacher_id  VARCHAR(36)  NOT NULL,
  schedule    VARCHAR(64)  NULL,                                -- "T3,T6" hoặc "CN"
  description TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_classes_teacher (teacher_id),
  CONSTRAINT fk_classes_teacher FOREIGN KEY (teacher_id)
    REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 3. CLASS_MEMBERS — Quan hệ HS ↔ Lớp (n-n)
-- =====================================================================
CREATE TABLE IF NOT EXISTS class_members (
  class_id    VARCHAR(36) NOT NULL,
  student_id  VARCHAR(36) NOT NULL,
  joined_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, student_id),
  KEY idx_class_members_student (student_id),
  CONSTRAINT fk_cm_class FOREIGN KEY (class_id)
    REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cm_student FOREIGN KEY (student_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 4. PARENT_LINKS — Quan hệ PH ↔ HS (1 PH có thể có nhiều con)
-- =====================================================================
CREATE TABLE IF NOT EXISTS parent_links (
  parent_id     VARCHAR(36) NOT NULL,
  student_id    VARCHAR(36) NOT NULL,
  relationship  VARCHAR(16) NULL,                              -- 'mother'|'father'|'guardian'|'other'
  linked_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_id, student_id),
  KEY idx_parent_links_student (student_id),
  CONSTRAINT fk_pl_parent FOREIGN KEY (parent_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pl_student FOREIGN KEY (student_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 5. SKILL_MEASUREMENTS — Append-only event log (Nguồn sự thật #1)
-- Mỗi measurement = 1 lần đo. KHÔNG BAO GIỜ update/delete.
-- Server tính running average, trend từ bảng này.
-- =====================================================================
CREATE TABLE IF NOT EXISTS skill_measurements (
  id            VARCHAR(36)  NOT NULL,
  user_id       VARCHAR(36)  NOT NULL,
  skill         VARCHAR(16)  NOT NULL,                          -- 'read'|'write'|'listen'|'speak'|'learn'
  metric        VARCHAR(64)  NOT NULL,                          -- 'readComprehension', 'vocabKnown', ...
  value         DOUBLE       NOT NULL,
  context_json  TEXT         NULL,                              -- {exerciseId, isCorrect, durationMs, hintCount, ...}
  measured_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_skill_measurements_user_skill (user_id, skill, metric, measured_at),
  CONSTRAINT fk_sm_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 6. ENGAGEMENT_EVENTS — Append-only event log (Nguồn sự thật #2)
-- Session start/end, hint used, task done/abandoned, streak updates
-- =====================================================================
CREATE TABLE IF NOT EXISTS engagement_events (
  id            VARCHAR(36)  NOT NULL,
  user_id       VARCHAR(36)  NOT NULL,
  event         VARCHAR(32)  NOT NULL,                          -- 'session_start','session_end','hint_used','task_done','task_abandoned','login'
  value         DOUBLE       NULL,                              -- duration_minutes, hint_count, score_pct
  context_json  TEXT         NULL,
  occurred_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_engagement_user_time (user_id, occurred_at),
  CONSTRAINT fk_ee_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 7. AUTH_SESSIONS — Token-based session (sau khi login)
-- =====================================================================
CREATE TABLE IF NOT EXISTS auth_sessions (
  token       VARCHAR(128) NOT NULL,                            -- random 256-bit hex
  user_id     VARCHAR(36)  NOT NULL,
  expires_at  DATETIME     NOT NULL,                            -- ISO datetime
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_as_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 8. QUESTION_BANK — Kho câu hỏi (Template + Content Engine)
-- GV soạn → auto-archive. is_shared = 1 → hiển thị trong kho chung
-- =====================================================================
CREATE TABLE IF NOT EXISTS question_bank (
  id              VARCHAR(36)  NOT NULL,
  owner_id        VARCHAR(36)  NOT NULL,                        -- GV tạo
  is_shared       TINYINT(1)   NOT NULL DEFAULT 0,              -- 0=riêng, 1=chung
  template_type   VARCHAR(32)  NOT NULL,                         -- 'reading'|'flashcard'|'dictation'|...
  topic           VARCHAR(128) NULL,                            -- "Travel", "Past Simple"
  level           VARCHAR(8)   NULL,                            -- 'A1'..'C2'
  content_json    LONGTEXT     NOT NULL,                        -- JSON: passage, questions, vocab, ...
  quality_score   DOUBLE       NOT NULL DEFAULT 0,              -- 0-5
  usage_count     INT          NOT NULL DEFAULT 0,              -- số lượt dùng
  success_rate    DOUBLE       NULL,                            -- % HS làm đúng
  avg_duration_ms INT          NULL,                            -- thời gian trung bình
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qb_owner (owner_id),
  KEY idx_qb_shared (is_shared),
  KEY idx_qb_type (template_type),
  KEY idx_qb_quality (quality_score),
  CONSTRAINT fk_qb_owner FOREIGN KEY (owner_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 9. SUBMISSIONS — Bài làm của HS (audit trail cho grader + analytics)
-- =====================================================================
CREATE TABLE IF NOT EXISTS submissions (
  id              VARCHAR(36)  NOT NULL,
  user_id         VARCHAR(36)  NOT NULL,
  question_id     VARCHAR(36)  NULL,
  template_type   VARCHAR(32)  NOT NULL,
  answers_json    LONGTEXT     NOT NULL,
  score_pct       DOUBLE       NULL,                            -- 0-100
  duration_ms     INT          NULL,
  graded_at       DATETIME     NULL,                            -- NULL = pending review (writing)
  needs_help      TINYINT(1)   NOT NULL DEFAULT 0,              -- 0/1: HS bấm "Cần hỗ trợ"
  teacher_id      VARCHAR(36)  NULL,                            -- GV đang hỗ trợ (nếu có)
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_submissions_user (user_id, created_at),
  KEY idx_submissions_question (question_id),
  KEY idx_submissions_help (needs_help, created_at),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sub_question FOREIGN KEY (question_id)
    REFERENCES question_bank(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sub_teacher FOREIGN KEY (teacher_id)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 10. PREVIEWS — T6-T7 Preview tracking (Flipped Classroom)
-- HS xem phần nào → track để GV biết CN tới cần bổ sung gì
-- =====================================================================
CREATE TABLE IF NOT EXISTS previews (
  id            VARCHAR(36)  NOT NULL,
  user_id       VARCHAR(36)  NOT NULL,
  topic         VARCHAR(128) NOT NULL,                          -- "Travel", "Past Simple"
  section       VARCHAR(32)  NOT NULL,                          -- 'hook'|'why'|'curious'|'check'
  completed     TINYINT(1)   NOT NULL DEFAULT 0,
  time_spent_ms INT          NULL,
  viewed_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_previews_user_topic (user_id, topic, viewed_at),
  CONSTRAINT fk_pv_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 11. ASSIGNMENTS — Bài tập GV giao (cho ngày T3)
-- =====================================================================
CREATE TABLE IF NOT EXISTS assignments (
  id              VARCHAR(36)  NOT NULL,
  class_id        VARCHAR(36)  NOT NULL,
  teacher_id      VARCHAR(36)  NOT NULL,
  title           VARCHAR(255) NOT NULL,
  question_ids    LONGTEXT     NOT NULL,                        -- JSON array of question_bank.id
  due_at          DATETIME     NULL,
  instructions    TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_assignments_class (class_id, due_at),
  CONSTRAINT fk_asg_class FOREIGN KEY (class_id)
    REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_asg_teacher FOREIGN KEY (teacher_id)
    REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
