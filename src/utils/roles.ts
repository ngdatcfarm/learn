/**
 * src/utils/roles.ts — Single source of truth cho role labels + emojis.
 * Dùng bởi ProfileModal, AdminDashboard, etc.
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
