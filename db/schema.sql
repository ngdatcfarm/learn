-- =====================================================================
-- SCHEMA: Tiếng Anh của mình — Learner Model + Hybrid Classroom
-- Engine: SQLite 3 (better-sqlite3)
-- Nguyên tắc: skill_measurements + engagement_events là APPEND-ONLY
--            (event log), mọi state khác DERIVE từ log.
-- =====================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;        -- Concurrent read + write, an toàn hơn

-- =====================================================================
-- 1. USERS — Hồ sơ đăng nhập (HS + PH + GV + Admin)
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,        -- UUID v4
  username            TEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,           -- scrypt: salt$hash
  password_salt       TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('student','parent','teacher','admin')),
  name                TEXT NOT NULL,
  -- Student-specific (NULL với PH/GV/Admin)
  level               TEXT CHECK (level IN ('Beginner','Intermediate','Advanced')),
  cefr_level          TEXT CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  goal                TEXT CHECK (goal IN ('IELTS','Giao tiếp','Học thuật','Tổng quát')),
  daily_goal_minutes  INTEGER DEFAULT 15 CHECK (daily_goal_minutes IN (5,15,30)),
  -- Audit
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- =====================================================================
-- 2. CLASSES — Lớp học (mỗi GV tạo lớp, gán HS vào)
-- =====================================================================
CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,                    -- "Lớp 7A - T3/T6", "IELTS Foundation"
  teacher_id  TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  schedule    TEXT,                             -- "T3,T6" hoặc "CN" — JSON array string
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

-- =====================================================================
-- 3. CLASS_MEMBERS — Quan hệ HS ↔ Lớp (n-n)
-- =====================================================================
CREATE TABLE IF NOT EXISTS class_members (
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_members_student ON class_members(student_id);

-- =====================================================================
-- 4. PARENT_LINKS — Quan hệ PH ↔ HS (1 PH có thể có nhiều con)
-- =====================================================================
CREATE TABLE IF NOT EXISTS parent_links (
  parent_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship  TEXT CHECK (relationship IN ('mother','father','guardian','other')),
  linked_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_links_student ON parent_links(student_id);

-- =====================================================================
-- 5. SKILL_MEASUREMENTS — Append-only event log (Nguồn sự thật #1)
-- Mỗi measurement = 1 lần đo. KHÔNG BAO GIỜ update/delete.
-- Server tính running average, trend từ bảng này.
-- =====================================================================
CREATE TABLE IF NOT EXISTS skill_measurements (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill         TEXT NOT NULL CHECK (skill IN ('read','write','listen','speak','learn')),
  metric        TEXT NOT NULL,                -- 'readComprehension','speakFluency','vocabKnown',...
  value         REAL NOT NULL,
  context_json  TEXT,                         -- {exerciseId, isCorrect, durationMs, hintCount, ...}
  measured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skill_measurements_user_skill
  ON skill_measurements(user_id, skill, metric, measured_at DESC);

-- =====================================================================
-- 6. ENGAGEMENT_EVENTS — Append-only event log (Nguồn sự thật #2)
-- Session start/end, hint used, task done/abandoned, streak updates
-- =====================================================================
CREATE TABLE IF NOT EXISTS engagement_events (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,                -- 'session_start','session_end','hint_used','task_done','task_abandoned','login'
  value         REAL,                         -- duration_minutes, hint_count, score_pct
  context_json  TEXT,                         -- {exerciseId, skill, ...}
  occurred_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_engagement_user_time
  ON engagement_events(user_id, occurred_at DESC);

-- =====================================================================
-- 7. AUTH_SESSIONS — Token-based session (sau khi login)
-- =====================================================================
CREATE TABLE IF NOT EXISTS auth_sessions (
  token       TEXT PRIMARY KEY,                -- random 256-bit hex
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,                   -- ISO datetime
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions(expires_at);

-- =====================================================================
-- 8. QUESTION_BANK — Kho câu hỏi (Template + Content Engine)
-- GV soạn → auto-archive. is_shared = true → hiển thị trong kho chung
-- =====================================================================
CREATE TABLE IF NOT EXISTS question_bank (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- GV tạo
  is_shared       INTEGER NOT NULL DEFAULT 0,          -- 0=riêng, 1=chung (sau duyệt)
  template_type   TEXT NOT NULL,                       -- 'reading' | 'flashcard' | 'dictation' | ...
  topic           TEXT,                                -- "Travel", "Past Simple", ...
  level           TEXT,                                -- 'A1'..'C2'
  content_json    TEXT NOT NULL,                       -- JSON: passage, questions, vocab, ...
  -- Tag chất lượng (auto-computed từ stats):
  quality_score   REAL DEFAULT 0,                      -- 0-5⭐
  usage_count     INTEGER NOT NULL DEFAULT 0,          -- bao nhiêu lượt dùng
  success_rate    REAL,                                -- % HS làm đúng
  avg_duration_ms INTEGER,                             -- thời gian TB
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qb_owner ON question_bank(owner_id);
CREATE INDEX IF NOT EXISTS idx_qb_shared ON question_bank(is_shared);
CREATE INDEX IF NOT EXISTS idx_qb_type ON question_bank(template_type);
CREATE INDEX IF NOT EXISTS idx_qb_quality ON question_bank(quality_score DESC);

-- =====================================================================
-- 9. SUBMISSIONS — Bài làm của HS (audit trail cho grader + analytics)
-- =====================================================================
CREATE TABLE IF NOT EXISTS submissions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id     TEXT REFERENCES question_bank(id) ON DELETE SET NULL,
  template_type   TEXT NOT NULL,
  answers_json    TEXT NOT NULL,                       -- câu trả lời của HS
  score_pct       REAL,                                -- 0-100
  duration_ms     INTEGER,
  graded_at       TEXT,                                -- NULL = pending review (writing)
  needs_help      INTEGER NOT NULL DEFAULT 0,          -- 0/1: HS bấm "Cần hỗ trợ"
  teacher_id      TEXT REFERENCES users(id) ON DELETE SET NULL,  -- GV đang hỗ trợ (nếu có)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_question ON submissions(question_id);
CREATE INDEX IF NOT EXISTS idx_submissions_help ON submissions(needs_help, created_at DESC);

-- =====================================================================
-- 10. PREVIEWS — T6-T7 Preview tracking (Flipped Classroom)
-- HS xem phần nào → track để GV biết CN tới cần bổ sung gì
-- =====================================================================
CREATE TABLE IF NOT EXISTS previews (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,                         -- "Travel", "Past Simple"
  section       TEXT NOT NULL,                         -- 'hook' | 'why' | 'curious' | 'check'
  completed     INTEGER NOT NULL DEFAULT 0,            -- 0/1
  time_spent_ms INTEGER,
  viewed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_previews_user_topic ON previews(user_id, topic, viewed_at DESC);

-- =====================================================================
-- 11. ASSIGNMENTS — Bài tập GV giao (cho ngày T3)
-- =====================================================================
CREATE TABLE IF NOT EXISTS assignments (
  id              TEXT PRIMARY KEY,
  class_id        TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title           TEXT NOT NULL,
  question_ids    TEXT NOT NULL,                       -- JSON array of question_bank.id
  due_at          TEXT,
  instructions    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, due_at);

-- =====================================================================
-- 12. MIGRATIONS — Track schema version (cho db/migrate.ts)
-- =====================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
