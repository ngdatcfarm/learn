/**
 * server/jobs/streakFreeze.ts — Auto-apply streak freeze cho HS bỏ lỡ 1 ngày
 *
 * Cron hourly tick. Mỗi tick:
 *   1. Check NOW() có trong cửa sổ ±15 phút của FREEZE_HOUR (mặc định 00:05) hay không
 *   2. Query tất cả HS (role=student, deleted_at IS NULL) có totalEvents > 0
 *      nhưng KHÔNG có events vào YESTERDAY
 *   3. Với mỗi HS, INSERT streak_freezes (user_id, week_start, used_for_date=YESTERDAY).
 *      Nếu UNIQUE conflict (đã dùng freeze tuần này rồi) → skip;
 *      streak sẽ tự reset (gap 2 ngày)
 *   4. Audit `streak.freeze_apply` cho mỗi freeze mới
 *
 * Idempotency: 2 lớp
 *   - daily cron (1 lần/ngày) + UNIQUE(user_id, week_start) → 1 HS chỉ freeze 1 lần/tuần
 *   - Nếu cron restart/retry: INSERT lại cùng user sẽ conflict → silent skip
 */

import crypto from "node:crypto";
import { query, queryOne, ResultSetHeader, RowDataPacket } from "../../db/client";
import { logAudit } from "../audit";
import { isInTimeWindow, yesterdayDateLocal } from "../utils/time";

const FREEZE_HOUR = parseInt(process.env.FREEZE_HOUR || "0", 10);
const FREEZE_MINUTE = parseInt(process.env.FREEZE_MINUTE || "5", 10);

interface InactiveStudentRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
}

export async function runStreakFreeze(): Promise<{ rowsAffected: number }> {
  const now = new Date();
  if (!isInTimeWindow(now, FREEZE_HOUR, FREEZE_MINUTE)) {
    return { rowsAffected: 0 };
  }

  const yesterday = yesterdayDateLocal(now);

  // Compute week_start (Monday) cho YESTERDAY trong MySQL — 1 query, dùng cho mọi HS
  // WEEKDAY(YESTERDAY) trả 0=Mon..6=Sun → trừ đi ra Monday.
  const weekStartRow = await queryOne<RowDataPacket & { week_start: string }>(
    `SELECT DATE_SUB(?, INTERVAL WEEKDAY(?) DAY) AS week_start`,
    [yesterday, yesterday]
  );
  const weekStart = weekStartRow?.week_start;
  if (!weekStart) {
    return { rowsAffected: 0 };
  }

  // HS có events trước đó (từng học) nhưng không có events HÔM QUA
  const candidates = (await query<InactiveStudentRow[]>(
    `SELECT u.id, u.name, u.username
     FROM users u
     WHERE u.role = 'student'
       AND u.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM engagement_events e WHERE e.user_id = u.id)
       AND NOT EXISTS (
         SELECT 1 FROM engagement_events e
         WHERE e.user_id = u.id
           AND DATE(e.occurred_at) = ?
       )`,
    [yesterday]
  )) as InactiveStudentRow[];

  if (candidates.length === 0) return { rowsAffected: 0 };

  let applied = 0;
  let alreadyUsed = 0;

  for (const student of candidates) {
    try {
      await query<ResultSetHeader>(
        `INSERT INTO streak_freezes (id, user_id, week_start_date, used_for_date)
         VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), student.id, weekStart, yesterday]
      );
      applied++;
      await logAudit({
        actorId: null, // system/cron
        action: "streak.freeze_apply",
        targetType: "user",
        targetId: student.id,
        details: {
          username: student.username,
          student_name: student.name,
          used_for_date: yesterday,
          week_start: weekStart,
        },
      });
    } catch (err: any) {
      // UNIQUE conflict → đã dùng freeze tuần này, streak tự reset (gap 2 ngày)
      if (err?.code === "ER_DUP_ENTRY") {
        alreadyUsed++;
      } else {
        throw err;
      }
    }
  }

  if (applied > 0 || alreadyUsed > 0) {
    console.log(
      `[streakFreeze] ${yesterday}: applied=${applied}, already_used=${alreadyUsed}/${candidates.length}`
    );
  }
  return { rowsAffected: applied };
}