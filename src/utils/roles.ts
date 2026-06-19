/**
 * src/utils/roles.ts — Single source of truth cho role labels + emojis.
 * Dùng bởi ProfileModal, AdminDashboard, etc.
 *
 * Mirror `server/constants.ts` (server validation). Thay đổi ở đây PHẢI
 * mirror sang server — đã có warning khi drift.
 */

export const ROLE_LABEL: Record<"student" | "parent" | "teacher" | "admin", string> = {
  student: "Học sinh",
  parent: "Phụ huynh",
  teacher: "Giáo viên",
  admin: "Quản trị viên",
};

export const ROLE_EMOJI: Record<"student" | "parent" | "teacher" | "admin", string> = {
  student: "🎓",
  parent: "👨‍👩‍👧",
  teacher: "👩‍🏫",
  admin: "🛡️",
};

/** 3 options cho daily goal minutes (phải khớp với server validation). */
export const DAILY_GOAL_OPTIONS = [5, 15, 30] as const;
export type DailyGoalMinutes = (typeof DAILY_GOAL_OPTIONS)[number];

/** CEFR levels (mirror server VALID_CEFR). */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Skill levels (mirror server VALID_LEVELS). */
export const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** Learning goals (mirror server VALID_GOALS). */
export const GOAL_OPTIONS = [
  { value: "IELTS", label: "IELTS" },
  { value: "Giao tiếp", label: "Giao tiếp" },
  { value: "Học thuật", label: "Học thuật" },
  { value: "Tổng quát", label: "Tổng quát" },
] as const;

/** Relationship PH ↔ HS — fixed options thay cho free-text. */
export const RELATIONSHIP_OPTIONS = [
  { value: "mother", label: "Mẹ", emoji: "👩" },
  { value: "father", label: "Bố", emoji: "👨" },
  { value: "guardian", label: "Người giám hộ", emoji: "🧑‍🦳" },
  { value: "other", label: "Khác", emoji: "👤" },
] as const;
export type RelationshipValue = (typeof RELATIONSHIP_OPTIONS)[number]["value"];

export const RELATIONSHIP_LABEL: Record<string, string> = Object.fromEntries(
  RELATIONSHIP_OPTIONS.map((r) => [r.value, `${r.emoji} ${r.label}`])
);
