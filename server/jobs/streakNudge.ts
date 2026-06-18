/**
 * server/jobs/streakNudge.ts — Nhắc PH + GV khi HS chưa học trong ngày
 *
 * Cron hourly tick. Mỗi tick:
 *   1. Check NOW() có trong cửa sổ ±15 phút của NUDGE_HOUR (mặc định 19:00) hay không
 *   2. Query HS chưa có events HÔM NAY (và chưa nudge hôm nay) — dùng daily_nudges
 *      với UNIQUE(user_id, nudge_date) làm idempotency guard
 *   3. Với mỗi HS:
 *      - INSERT daily_nudges row (idempotency: nếu conflict → skip)
 *      - Gọi sendDirectMessage cho từng PH (qua parent_links)
 *      - Gọi sendDirectMessage cho từng GV (qua class_members JOIN classes)
 *      - Nếu HS không có PH và không có GV → vẫn INSERT daily_nudges (track
 *        "đã xét HS này") nhưng không gửi ai
 *   4. Audit `notification.reminder_sent` per recipient
 *
 * Sender: admin user (dùng tạm làm system actor). Audit sẽ show actor_name = admin
 * nhưng action prefix "notification.*" để admin dễ lọc.
 *
 * Idempotency: daily_nudges UNIQUE(user_id, nudge_date) → INSERT IGNORE / catch DUP.
 * Cron retry trong cùng ngày sẽ skip hết.
 */

import crypto from "node:crypto";
import { query, queryOne, ResultSetHeader, RowDataPacket } from "../../db/client";
import { logAudit } from "../audit";
import { sendDirectMessage } from "../messaging";
import { isInTimeWindow, formatDateLocal } from "../utils/time";

const NUDGE_HOUR = parseInt(process.env.NUDGE_HOUR || "19", 10);
const NUDGE_MINUTE = parseInt(process.env.NUDGE_MINUTE || "0", 10);

interface InactiveStudentRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
}

interface RecipientRow extends RowDataPacket {
  recipient_id: string;
  recipient_name: string;
  recipient_role: "parent" | "teacher";
}

interface AdminRow extends RowDataPacket {
  id: string;
  name: string;
}

export async function runStreakNudge(): Promise<{ rowsAffected: number }> {
  const now = new Date();
  if (!isInTimeWindow(now, NUDGE_HOUR, NUDGE_MINUTE)) {
    return { rowsAffected: 0 };
  }

  const today = formatDateLocal(now);

  // Find admin user (system sender)
  const admin = await queryOne<AdminRow>(
    `SELECT id, name FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
  );
  if (!admin) {
    console.warn("[streakNudge] Không tìm thấy admin user — skip");
    return { rowsAffected: 0 };
  }

  // HS chưa học hôm nay VÀ chưa nudge hôm nay (idempotent qua daily_nudges LEFT JOIN)
  const candidates = (await query<InactiveStudentRow[]>(
    `SELECT u.id, u.name, u.username
     FROM users u
     LEFT JOIN daily_nudges dn ON dn.user_id = u.id AND dn.nudge_date = ?
     WHERE u.role = 'student'
       AND u.deleted_at IS NULL
       AND dn.id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM engagement_events e
         WHERE e.user_id = u.id AND DATE(e.occurred_at) = ?
       )`,
    [today, today]
  )) as InactiveStudentRow[];

  if (candidates.length === 0) return { rowsAffected: 0 };

  // Pre-fetch recipients cho tất cả candidates (1 query round-trip thay vì N+1)
  const candidateIds = candidates.map((s) => s.id);
  const allRecipients = (await query<RecipientRow[]>(
    `SELECT cm.student_id, pl.parent_id AS recipient_id, up.name AS recipient_name, 'parent' AS recipient_role
     FROM class_members cm
     JOIN parent_links pl ON pl.student_id = cm.student_id
     JOIN users up ON up.id = pl.parent_id
     WHERE cm.student_id IN (?)
       AND up.deleted_at IS NULL
     UNION
     SELECT cm.student_id, c.teacher_id AS recipient_id, ut.name AS recipient_name, 'teacher' AS recipient_role
     FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     JOIN users ut ON ut.id = c.teacher_id
     WHERE cm.student_id IN (?)
       AND ut.deleted_at IS NULL`,
    [candidateIds, candidateIds]
  )) as (RecipientRow & { student_id: string })[];

  // Group recipients by student_id
  const recipientsByStudent = new Map<string, RecipientRow[]>();
  for (const r of allRecipients) {
    const list = recipientsByStudent.get(r.student_id) || [];
    list.push(r);
    recipientsByStudent.set(r.student_id, list);
  }

  const phBody = (name: string) => `🔔 Nhắc nhở: ${name} chưa học hôm nay (${today}). Khích lệ con ôn bài nhé!`;
  const teacherBody = (name: string) => `🔔 HS chưa học hôm nay: ${name} (ngày ${today}). Có thể nhắc nhở thêm.`;

  let nudgesSent = 0;

  for (const student of candidates) {
    // Claim idempotency slot — UNIQUE conflict = race/retry → skip
    try {
      await query<ResultSetHeader>(
        `INSERT INTO daily_nudges (id, user_id, nudge_date) VALUES (?, ?, ?)`,
        [crypto.randomUUID(), student.id, today]
      );
    } catch (err: any) {
      if (err?.code === "ER_DUP_ENTRY") continue;
      throw err;
    }

    const recipients = recipientsByStudent.get(student.id) || [];
    if (recipients.length === 0) {
      // HS không có PH/GV — vẫn track daily_nudges để không re-check
      nudgesSent++;
      continue;
    }

    // Send parallel — 1 student có thể có 1+ PH + 1+ GV
    const results = await Promise.allSettled(
      recipients.map(async (r) => {
        const body =
          r.recipient_role === "parent"
            ? phBody(student.name)
            : teacherBody(student.name);
        const { threadId } = await sendDirectMessage(admin.id, r.recipient_id, body);
        await logAudit({
          actorId: admin.id,
          action: "notification.reminder_sent",
          targetType: "user",
          targetId: r.recipient_id,
          details: {
            recipient_role: r.recipient_role,
            student_id: student.id,
            student_name: student.name,
            thread_id: threadId,
            nudge_date: today,
          },
        });
      })
    );

    // Log per-recipient failures (best-effort; không fail cả job)
    results.forEach((res, i) => {
      if (res.status === "rejected") {
        console.error(
          `[streakNudge] fail for recipient=${recipients[i].recipient_id}:`,
          res.reason?.message || res.reason
        );
      }
    });

    nudgesSent++;
  }

  if (nudgesSent > 0) {
    console.log(`[streakNudge] ${today}: sent for ${nudgesSent} student(s)`);
  }
  return { rowsAffected: nudgesSent };
}