/**
 * server/queries/engagement.ts — Shared engagement event queries
 *
 * Tách các query về engagement_events ra khỏi skills.ts + dashboard.ts để
 * tránh SQL duplication (cùng pattern SUM/COUNT theo CURDATE() window).
 *
 * Cả 2 helper đều trả về giá trị đã ROUND về phút nguyên — consistent cho
 * cả HS dashboard (HS xem daily goal bar) và parent dashboard (PH xem
 * minutes_today của con). Trước đây 2 endpoint trả về giá trị khác nhau
 * (1 round, 1 raw) — confusing.
 */

import { queryOne, RowDataPacket } from "../../db/client";

/**
 * Tổng phút HS đã học trong ngày hôm nay (tính từ session_end events).
 * Dùng cho daily goal progress bar + parent dashboard.
 *
 * Tách riêng (không reuse computeEngagement) vì computeEngagement có
 * LIMIT 500 → có thể miss events hôm nay nếu user có quá nhiều lịch sử.
 */
export async function getTodayMinutes(userId: string): Promise<number> {
  const row = (await queryOne<RowDataPacket & { total_min: number | null }>(
    `SELECT COALESCE(SUM(value), 0) AS total_min FROM engagement_events
     WHERE user_id = ? AND event = 'session_end' AND value IS NOT NULL
       AND occurred_at >= CURDATE() AND occurred_at < CURDATE() + INTERVAL 1 DAY`,
    [userId]
  )) as { total_min: number | null } | undefined;
  return Math.round(row?.total_min ?? 0);
}

export interface TodayActivity {
  task_done_today: number;
  minutes_today: number;
  measurements_today: number;
}

/**
 * Hoạt động trong ngày của 1 HS — dùng cho Teacher matrix + Parent dashboard.
 * Parallel 3 queries (Promise.all) thay vì sequential như trước.
 */
export async function getTodayActivity(userId: string): Promise<TodayActivity> {
  const [taskDoneRow, minutes, measRow] = await Promise.all([
    queryOne<RowDataPacket & { cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM engagement_events
       WHERE user_id = ? AND event = 'task_done'
         AND occurred_at >= CURDATE() AND occurred_at < CURDATE() + INTERVAL 1 DAY`,
      [userId]
    ),
    getTodayMinutes(userId),
    queryOne<RowDataPacket & { cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM skill_measurements
       WHERE user_id = ?
         AND measured_at >= CURDATE() AND measured_at < CURDATE() + INTERVAL 1 DAY`,
      [userId]
    ),
  ]);
  return {
    task_done_today: (taskDoneRow as { cnt: number } | undefined)?.cnt ?? 0,
    minutes_today: minutes,
    measurements_today: (measRow as { cnt: number } | undefined)?.cnt ?? 0,
  };
}
