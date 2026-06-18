/**
 * server/utils/time.ts — Shared time helpers cho cron jobs.
 *
 * Các job trong server/jobs/*.ts đều dùng pattern hourly tick + check NOW()
 * có trong cửa sổ ±15 phút của target hour:minute hay không. Helper này tránh
 * copy-paste giữa 4 job (parentReports / dbBackup / streakFreeze / streakNudge).
 *
 * Timezone: tất cả helper dùng LOCAL TIME của Node process. Match với MySQL
 * `dateStrings: true` (server cùng timezone trên deploy co-located).
 */

const DEFAULT_WINDOW_MIN = 15;

/**
 * Check NOW() có trong cửa sổ ±windowMin phút của target hour:minute hay không.
 * Xử lý wrap-around midnight (vd hour=23, current=00:05 → diff=1435, wrapped=5).
 */
export function isInTimeWindow(
  now: Date,
  hour: number,
  minute: number,
  windowMin: number = DEFAULT_WINDOW_MIN
): boolean {
  const target = hour * 60 + minute;
  const current = now.getHours() * 60 + now.getMinutes();
  const diff = Math.abs(current - target);
  const wrapped = Math.min(diff, 24 * 60 - diff);
  return wrapped <= windowMin;
}

/**
 * Format Date thành "YYYY-MM-DD" theo LOCAL TIME.
 * Dùng để so sánh với dates trả về từ MySQL `dateStrings: true`.
 */
export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Trả về "YYYY-MM-DD" của yesterday theo local time.
 */
export function yesterdayDateLocal(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return formatDateLocal(d);
}