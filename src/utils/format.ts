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

/**
 * Format thời gian cho chat message / thread list.
 *  - Hôm nay:  HH:MM
 *  - Hôm qua: "Hôm qua"
 *  - Tuần này: "T2".."CN"
 *  - Cũ hơn:  "YYYY-MM-DD"
 *
 * MySQL DATETIME trả về "YYYY-MM-DD HH:MM:SS" → convert sang ISO trước.
 */
export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) {
    return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getDay()];
  }
  return iso.slice(0, 10);
}

/**
 * Format label cho day-separator trong chat (Hôm nay / Hôm qua / T2..CN / YYYY-MM-DD).
 * Dùng kèm formatMessageTime để có nhóm ngày + thời gian.
 */
export function formatDaySeparator(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hôm nay";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) {
    return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getDay()];
  }
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Lấy key ngày (YYYY-MM-DD) cho 1 ISO string — dùng để group messages theo ngày.
 */
export function dateKey(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ============================================================
// Score tier — dùng cho Dictation / Speaking result UI (Step 9c)
// ============================================================

export type ScoreTier = "good" | "warn" | "bad";

/**
 * Bucket 1 số điểm thành 3 tier theo threshold tuỳ ý.
 * - score >= goodMin → "good"
 * - score >= warnMin → "warn"
 * - else             → "bad"
 *
 * Ví dụ:
 *   scoreTier(85, 80, 50)  // → "good"  (dictation 0-100)
 *   scoreTier(7, 7, 5)     // → "good"  (speaking 0-10, threshold 7)
 */
export function scoreTier(score: number, goodMin: number, warnMin: number): ScoreTier {
  if (score >= goodMin) return "good";
  if (score >= warnMin) return "warn";
  return "bad";
}

/**
 * CSS color triplet cho mỗi tier. CSS variables fallback với `var(--warning-soft)`
 * cho --danger-soft (một số theme chưa define danger).
 */
export const SCORE_COLORS: Record<ScoreTier, { bg: string; border: string; fg: string }> = {
  good: { bg: "var(--success-soft)", border: "var(--success)", fg: "var(--success)" },
  warn: { bg: "var(--warning-soft)", border: "var(--warning)", fg: "var(--warning)" },
  bad:  { bg: "var(--danger-soft, var(--warning-soft))", border: "var(--danger, var(--warning))", fg: "var(--danger, var(--warning))" },
};
