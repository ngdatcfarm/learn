/**
 * src/utils/format.ts — Shared display formatters
 *
 * formatSkillValue: dùng bởi Dashboard, TeacherDashboard, ParentDashboard.
 * Đảm bảo 3 UI hiển thị số liệu kỹ năng giống nhau.
 */

import type { SkillId } from "../types";

/**
 * Format giá trị primary metric của 1 skill theo SKILL_META.
 * - val === 0        → "—" (chưa có data)
 * - write            → "8/10"
 * - speak            → "120 wpm"
 * - learn            → "150 từ"
 * - read/listen      → "85%"
 */
export function formatSkillValue(skill: SkillId, val: number): string {
  if (val === 0) return "—";
  if (skill === "write") return `${val}/10`;
  if (skill === "speak") return `${val} wpm`;
  if (skill === "learn") return `${val} từ`;
  return `${val}%`;
}

/**
 * Tính % tiến bộ (0-100) cho progress bar của 1 skill.
 * Khác nhau theo thang đo của mỗi skill (read/listen 0-100, write 0-10, ...).
 */
export function skillProgressPct(skill: SkillId, val: number, attempts: number): number {
  if (attempts === 0) return 0;
  if (skill === "write") return Math.min(100, val * 10);
  if (skill === "speak") return Math.min(100, val);
  if (skill === "learn") return Math.min(100, val / 2);
  return Math.min(100, val);
}
