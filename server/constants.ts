/**
 * server/constants.ts — Shared validation constants (MySQL)
 *
 * Centralize validation rules dùng bởi nhiều routers (admin, profile, csv import).
 * Source-of-truth phía server. FE mirror ở `src/utils/roles.ts` + `src/utils/validation.ts`.
 *
 * Thay đổi ở đây PHẢI mirror sang FE — đã có warning khi drift.
 */

export const VALID_ROLES = ["student", "parent", "teacher", "admin"] as const;
export type Role = (typeof VALID_ROLES)[number];

export const VALID_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type Level = (typeof VALID_LEVELS)[number];

export const VALID_CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof VALID_CEFR)[number];

export const VALID_GOALS = ["IELTS", "Giao tiếp", "Học thuật", "Tổng quát"] as const;
export type Goal = (typeof VALID_GOALS)[number];

/** Mirror `DAILY_GOAL_OPTIONS` trong `src/utils/roles.ts`. */
export const VALID_DAILY_GOALS = [5, 15, 30] as const;
export type DailyGoalMinutes = (typeof VALID_DAILY_GOALS)[number];

/** Relationship giữa PH ↔ HS — fixed options thay cho free-text (Step polish). */
export const VALID_RELATIONSHIPS = ["mother", "father", "guardian", "other"] as const;
export type Relationship = (typeof VALID_RELATIONSHIPS)[number];

/** Schema VARCHAR(16) cho `parent_links.relationship`. */
export const RELATIONSHIP_MAX_LENGTH = 16;

/** Phone: optional `+` prefix + 9-15 digits. */
export const PHONE_REGEX = /^\+?\d{9,15}$/;

/** Username: 3-64 char, chỉ chứa chữ, số, _, ., - */
export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

/** DB column limits (mirror db/schema.sql). */
export const USERNAME_MAX_LENGTH = 64;
export const NAME_MAX_LENGTH = 128;

/** 5MB CSV cap (~10-20k rows). */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

/** Chunk size cho bulk INSERT — 500 rows ≈ 125 KB, an toàn dưới max_allowed_packet. */
export const BULK_INSERT_CHUNK = 500;

// ============================================================
// Live Help & engagement enums (Step 12 — shared bởi liveHelp, engagement, debug)
// ============================================================

/** Status của `live_help_sessions` (xem `db/schema.sql`). */
export const LIVE_HELP_STATUSES = ["pending", "active", "ended"] as const;
export type LiveHelpStatus = (typeof LIVE_HELP_STATUSES)[number];

/** Trigger nguồn cho `live_help_sessions.trigger`. `teacher_observe` (Step 12d) bypass lock. */
export const LIVE_HELP_TRIGGERS = [
  "student_request",
  "teacher_proactive",
  "teacher_observe",
  "class_session",
] as const;
export type LiveHelpTrigger = (typeof LIVE_HELP_TRIGGERS)[number];

/**
 * Engagement event types (`engagement_events.event`).
 * Union của public track endpoint (engagement.ts) + debug injector (debug.ts).
 * Khi thêm event mới, cả 2 router auto pick up.
 *
 * Step 13b: thêm 8 class session events.
 */
export const VALID_ENGAGEMENT_EVENTS = [
  "session_start",
  "session_end",
  "task_done",
  "task_started",
  "task_abandoned",
  "hint_used",
  "error_occurred",
  "help_request",
  "highlight_used",
  "voice_call_started",
  "voice_call_ended",
  "class_session_started",
  "class_session_ended",
  "class_tab_visible",
  "class_tab_hidden",
  "class_hand_up",
  "class_hand_up_claimed",
  "class_board_pushed",
  "class_board_dismiss_requested",
] as const;
export type EngagementEvent = (typeof VALID_ENGAGEMENT_EVENTS)[number];

// ============================================================
// Step 13b — Class Session enums (mirror db/migrations/011)
// ============================================================

/** Class session lifecycle. */
export const CLASS_SESSION_STATUSES = ["planned", "active", "ended", "cancelled"] as const;
export type ClassSessionStatus = (typeof CLASS_SESSION_STATUSES)[number];

/** Hand-up queue status. */
export const HANDUP_STATUSES = ["queued", "claimed", "dismissed", "cancelled"] as const;
export type HandupStatus = (typeof HANDUP_STATUSES)[number];

/** Tab visibility event. */
export const TAB_EVENT_KINDS = ["visible", "hidden"] as const;
export type TabEventKind = (typeof TAB_EVENT_KINDS)[number];