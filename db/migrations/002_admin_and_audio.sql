-- =====================================================================
-- MIGRATION v2: Admin dashboard + Audio retention
-- Step 6 — Admin Dashboard + Audio retention schema
--
-- Thêm:
--   1. speak_recordings   — Speak practice audio + transcript + retention
--   2. parent_report_settings — Zalo config (singleton, id=1)
--   3. audit_log          — Admin action history
--   4. cron_job_runs      — Scheduler observability
--   5. users.deleted_at   — Soft-delete column + index
--
-- Idempotency: CREATE TABLE / INSERT IGNORE đều an toàn nếu chạy 2 lần
-- nhưng migration runner sẽ skip cả v2 nếu version=2 đã apply.
-- ALTER TABLE không cần IF NOT EXISTS wrapper (MySQL 8 không hỗ trợ).
-- =====================================================================

-- 1. speak_recordings: lưu transcript + analysis, cron xóa audio sau expires_at
CREATE TABLE IF NOT EXISTS speak_recordings (
  id                VARCHAR(36)  NOT NULL,
  user_id           VARCHAR(36)  NOT NULL,
  -- Persisted (transcript + analysis — giữ lại cho analytics)
  transcript        TEXT         NULL,
  errors_json       LONGTEXT     NULL,    -- [{type, original, expected, hint}]
  analysis_text     LONGTEXT     NULL,
  -- Transient (cron delete expired rows entirely)
  audio_url         VARCHAR(512) NULL,
  audio_duration_ms INT          NULL,
  expires_at        DATETIME     NULL,    -- hard-delete row khi expires_at < NOW()
  -- Context
  prompt            TEXT         NULL,
  topic             VARCHAR(128) NULL,
  level             VARCHAR(8)   NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_speak_user_created (user_id, created_at),
  KEY idx_speak_expires (expires_at),
  CONSTRAINT fk_speak_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. parent_report_settings: Zalo config singleton (id=1)
CREATE TABLE IF NOT EXISTS parent_report_settings (
  id                       TINYINT     NOT NULL DEFAULT 1,
  frequency                VARCHAR(16) NOT NULL DEFAULT 'weekly',  -- 'daily'|'weekly'|'biweekly'|'monthly'|'off'
  send_time                TIME        NOT NULL DEFAULT '08:00:00',
  send_day_of_week         TINYINT     NULL,                      -- 1-7 (Mon-Sun) for weekly/biweekly
  zalo_oa_id               VARCHAR(64) NULL,
  zalo_access_token        VARCHAR(512) NULL,
  zalo_template_id         VARCHAR(64) NULL,
  zalo_template_data_json  LONGTEXT    NULL,                      -- JSON schema placeholders
  include_skills           TINYINT(1)  NOT NULL DEFAULT 1,
  include_streak           TINYINT(1)  NOT NULL DEFAULT 1,
  include_minutes          TINYINT(1)  NOT NULL DEFAULT 1,
  include_needs_help       TINYINT(1)  NOT NULL DEFAULT 1,
  custom_message           TEXT        NULL,
  updated_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by               VARCHAR(36) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_prs_user FOREIGN KEY (updated_by)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO parent_report_settings (id) VALUES (1);

-- 3. audit_log: append-only history of admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  actor_id     VARCHAR(36)  NULL,                  -- admin (NULL = system/cron)
  action       VARCHAR(64)  NOT NULL,              -- 'user.create','user.reset_password',...
  target_type  VARCHAR(32)  NULL,                  -- 'user','class','class_member','settings'
  target_id    VARCHAR(36)  NULL,
  details_json LONGTEXT     NULL,
  ip_address   VARCHAR(45)  NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_id, created_at),
  KEY idx_audit_target (target_type, target_id, created_at),
  KEY idx_audit_action (action, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. cron_job_runs: scheduler observability (1 row per run)
CREATE TABLE IF NOT EXISTS cron_job_runs (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  job_name      VARCHAR(64)  NOT NULL,
  started_at    DATETIME     NOT NULL,
  finished_at   DATETIME     NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'running',  -- 'running'|'success'|'error'
  rows_affected INT          NULL,
  error_message TEXT         NULL,
  PRIMARY KEY (id),
  KEY idx_cron_job_time (job_name, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Soft-delete column on users
ALTER TABLE users
  ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL,
  ADD KEY idx_users_deleted (deleted_at);
