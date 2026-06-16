/**
 * server/messaging.ts — Inbox nội bộ (HS/PH ↔ GV/Admin + broadcast)
 * Step 7
 *
 * Routes (mounted at /api/messages):
 *   GET    /threads                            — List threads (HS: direct + matching broadcasts; PH: direct + matching broadcasts; GV: direct + matching broadcasts; Admin: all)
 *   POST   /threads                            — Tạo direct thread (body: { recipient_id, body }) hoặc broadcast (body: { type:'broadcast', subject, target_role, target_class_id, body })
 *   GET    /threads/:id                        — Thread + messages + participants; auto-mark read
 *   POST   /threads/:id/messages               — Gửi message (direct: any participant; broadcast: chỉ creator hoặc admin)
 *   POST   /threads/:id/read                   — Idempotent upsert last_read_at
 *   GET    /unread-count                       — Số message chưa đọc (badge)
 *   GET    /eligible-recipients                — User có thể nhắn (HS: GV+admin+PH của mình; PH: GV+admin của con; GV: HS+PH+admin; Admin: any)
 *
 * Auth: requireRole ["student","parent","teacher","admin"]. Admin bypasses scoping checks.
 *
 * Pair rules (caller ↔ recipient):
 *   - Admin ↔ any (pass)
 *   - Student ↔ Admin / Teacher-of-my-class / My-parent
 *   - PH ↔ Admin / Teacher-of-my-kid's-class
 *   - Teacher ↔ Admin / PH-of-my-class / Student-in-my-class
 *   - Same role (except admin): 403
 *
 * Broadcast:
 *   - Only admin/teacher can create broadcast (student/parent → 403)
 *   - target_role: "student" | "parent" | "teacher" | "all"
 *   - Teacher restricted: target_role ∈ {parent, all, student} (not teacher) + must own target_class_id
 *   - Admin unrestricted
 *
 * Audit (PII-safe):
 *   - thread.create      → details: { recipient_id, recipient_name, body_length }
 *   - message.send       → details: { thread_id, thread_type, body_length }  (KHÔNG log raw body)
 *   - broadcast.send     → details: { subject, target_role, target_class_id, recipient_count }
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import {
  query,
  queryOne,
  withTransaction,
  RowDataPacket,
  ResultSetHeader,
} from "../db/client";
import { requireRole, AuthUser } from "./auth";
import { logAudit } from "./audit";

export const messagingRouter = Router();

// ============================================================
// Row types
// ============================================================

interface ThreadRow extends RowDataPacket {
  id: string;
  type: "direct" | "broadcast";
  subject: string | null;
  target_role: string | null;
  target_class_id: string | null;
  target_class_name: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_sender_name: string | null;
  last_message_created_at: string | null;
}

interface MessageRow extends RowDataPacket {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "student" | "parent" | "teacher" | "admin";
  body: string;
  created_at: string;
}

interface ParticipantRow extends RowDataPacket {
  user_id: string;
  name: string;
  username: string;
  role: "student" | "parent" | "teacher" | "admin";
}

// ============================================================
// Helpers
// ============================================================

/**
 * Lấy target_class_name nếu có — dùng để hiển thị broadcast scoped tới 1 lớp.
 */
async function attachClassName(
  threads: ThreadRow[]
): Promise<ThreadRow[]> {
  const classIds = Array.from(
    new Set(
      threads
        .map((t) => t.target_class_id)
        .filter((id): id is string => !!id)
    )
  );
  if (classIds.length === 0) return threads;
  const rows = (await query<RowDataPacket[]>(
    `SELECT id, name FROM classes WHERE id IN (?)`,
    [classIds]
  )) as RowDataPacket[];
  const map = new Map(rows.map((r) => [r.id as string, r.name as string]));
  for (const t of threads) {
    if (t.target_class_id) {
      t.target_class_name = map.get(t.target_class_id) ?? null;
    }
  }
  return threads;
}

/**
 * Tính unread_count cho 1 thread từ phía user.
 */
async function countUnread(
  threadId: string,
  userId: string
): Promise<number> {
  const row = (await queryOne<RowDataPacket & { c: number }>(
    `SELECT COUNT(*) AS c FROM messages m
     WHERE m.thread_id = ?
       AND m.deleted_at IS NULL
       AND m.sender_id != ?
       AND m.created_at > COALESCE(
         (SELECT last_read_at FROM thread_reads
          WHERE thread_id = ? AND user_id = ?),
        '1970-01-01 00:00:00'
       )`,
    [threadId, userId, threadId, userId]
  )) as { c: number } | undefined;
  return row?.c ?? 0;
}

/**
 * Lấy participants của 1 direct thread.
 */
async function getParticipants(
  threadId: string
): Promise<Array<{ id: string; name: string; role: "student" | "parent" | "teacher" | "admin" }>> {
  const rows = (await query<ParticipantRow[]>(
    `SELECT tp.user_id, u.name, u.username, u.role
     FROM thread_participants tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.thread_id = ?
     ORDER BY u.name`,
    [threadId]
  )) as ParticipantRow[];
  return rows.map((r) => ({
    id: r.user_id,
    name: r.name,
    role: r.role,
  }));
}

/**
 * Lấy tất cả class_id mà user có quan hệ (student: trong lớp; PH: của con; GV: dạy).
 */
async function getUserScopeClassIds(user: AuthUser): Promise<string[]> {
  if (user.role === "student") {
    const rows = (await query<RowDataPacket[]>(
      `SELECT DISTINCT class_id FROM class_members WHERE student_id = ?`,
      [user.id]
    )) as RowDataPacket[];
    return rows.map((r) => r.class_id as string);
  }
  if (user.role === "parent") {
    const rows = (await query<RowDataPacket[]>(
      `SELECT DISTINCT cm.class_id
       FROM parent_links pl
       JOIN class_members cm ON cm.student_id = pl.student_id
       WHERE pl.parent_id = ?`,
      [user.id]
    )) as RowDataPacket[];
    return rows.map((r) => r.class_id as string);
  }
  if (user.role === "teacher") {
    const rows = (await query<RowDataPacket[]>(
      `SELECT id AS class_id FROM classes WHERE teacher_id = ?`,
      [user.id]
    )) as RowDataPacket[];
    return rows.map((r) => r.class_id as string);
  }
  return []; // admin: no scope restriction
}

/**
 * Check xem broadcast thread có "match" với user không (PH/GV chỉ thấy broadcast phù hợp).
 */
function broadcastMatchesUser(
  thread: ThreadRow,
  user: AuthUser,
  userClassIds: string[]
): boolean {
  if (thread.type !== "broadcast") return true;
  // target_role = 'all' → ai cũng xem được
  if (thread.target_role === "all" || thread.target_role === null) return true;
  // target_role = 'parent' → PH xem
  if (thread.target_role === "parent" && user.role === "parent") return true;
  if (thread.target_role === "teacher" && user.role === "teacher") return true;
  if (thread.target_role === "student" && user.role === "student") return true;
  // target_class_id (optional) → thêm scope: user phải thuộc class đó
  if (thread.target_class_id) {
    return userClassIds.includes(thread.target_class_id);
  }
  return false;
}

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/messages/threads
 */
messagingRouter.get("/threads", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "parent", "teacher", "admin"]);
  if (!user) return;

  // 1. Fetch direct threads (caller là participant)
  const directThreads = (await query<ThreadRow[]>(
    `SELECT t.id, t.type, t.subject, t.target_role, t.target_class_id,
            NULL AS target_class_name,
            t.created_by, u.name AS created_by_name,
            t.created_at, t.last_message_at,
            lm.body AS last_message_body,
            lm.sender_id AS last_message_sender_id,
            su.name AS last_message_sender_name,
            lm.created_at AS last_message_created_at
     FROM message_threads t
     JOIN thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
     JOIN users u ON u.id = t.created_by
     LEFT JOIN messages lm ON lm.id = (
       SELECT id FROM messages
       WHERE thread_id = t.id AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1
     )
     LEFT JOIN users su ON su.id = lm.sender_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.last_message_at DESC, t.created_at DESC`,
    [user.id]
  )) as ThreadRow[];

  // 2. Fetch broadcast threads (admin thấy all; PH/GV filter theo scope)
  let broadcastThreads: ThreadRow[] = [];
  if (user.role === "admin") {
    broadcastThreads = (await query<ThreadRow[]>(
      `SELECT t.id, t.type, t.subject, t.target_role, t.target_class_id,
              NULL AS target_class_name,
              t.created_by, u.name AS created_by_name,
              t.created_at, t.last_message_at,
              lm.body AS last_message_body,
              lm.sender_id AS last_message_sender_id,
              su.name AS last_message_sender_name,
              lm.created_at AS last_message_created_at
       FROM message_threads t
       JOIN users u ON u.id = t.created_by
       LEFT JOIN messages lm ON lm.id = (
         SELECT id FROM messages
         WHERE thread_id = t.id AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN users su ON su.id = lm.sender_id
       WHERE t.type = 'broadcast' AND t.deleted_at IS NULL
       ORDER BY t.last_message_at DESC, t.created_at DESC`
    )) as ThreadRow[];
  } else {
    // PH/GV: filter theo target_role và target_class_id
    const classIds = await getUserScopeClassIds(user);
    // Build IN clause cho target_role match
    // (HS: target_role in ('student','all'); PH: ('parent','all'); GV: ('teacher','all'))
    const allowedRoles =
      user.role === "parent" ? ["parent", "all"]
      : user.role === "teacher" ? ["teacher", "all"]
      : user.role === "student" ? ["student", "all"]
      : [];
    if (classIds.length === 0) {
      // No class scope → only role-based broadcasts
      broadcastThreads = (await query<ThreadRow[]>(
        `SELECT t.id, t.type, t.subject, t.target_role, t.target_class_id,
                NULL AS target_class_name,
                t.created_by, u.name AS created_by_name,
                t.created_at, t.last_message_at,
                lm.body AS last_message_body,
                lm.sender_id AS last_message_sender_id,
                su.name AS last_message_sender_name,
                lm.created_at AS last_message_created_at
         FROM message_threads t
         JOIN users u ON u.id = t.created_by
         LEFT JOIN messages lm ON lm.id = (
           SELECT id FROM messages
           WHERE thread_id = t.id AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1
         )
         LEFT JOIN users su ON su.id = lm.sender_id
         WHERE t.type = 'broadcast' AND t.deleted_at IS NULL
           AND (t.target_role IN (?) OR t.target_role IS NULL)
         ORDER BY t.last_message_at DESC, t.created_at DESC`,
        [allowedRoles]
      )) as ThreadRow[];
    } else {
      broadcastThreads = (await query<ThreadRow[]>(
        `SELECT t.id, t.type, t.subject, t.target_role, t.target_class_id,
                NULL AS target_class_name,
                t.created_by, u.name AS created_by_name,
                t.created_at, t.last_message_at,
                lm.body AS last_message_body,
                lm.sender_id AS last_message_sender_id,
                su.name AS last_message_sender_name,
                lm.created_at AS last_message_created_at
         FROM message_threads t
         JOIN users u ON u.id = t.created_by
         LEFT JOIN messages lm ON lm.id = (
           SELECT id FROM messages
           WHERE thread_id = t.id AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1
         )
         LEFT JOIN users su ON su.id = lm.sender_id
         WHERE t.type = 'broadcast' AND t.deleted_at IS NULL
           AND ((t.target_role IN (?) OR t.target_role IS NULL)
                OR t.target_class_id IN (?))
         ORDER BY t.last_message_at DESC, t.created_at DESC`,
        [allowedRoles, classIds]
      )) as ThreadRow[];
    }
  }

  await attachClassName(directThreads);
  await attachClassName(broadcastThreads);

  const all = [...directThreads, ...broadcastThreads];

  // 3. Per-thread: participants (direct) + unread_count
  const result = await Promise.all(
    all.map(async (t) => {
      const unread = await countUnread(t.id, user.id);
      let participants: Array<{ id: string; name: string; role: "student" | "parent" | "teacher" | "admin" }> = [];
      if (t.type === "direct") {
        participants = await getParticipants(t.id);
      }
      return {
        id: t.id,
        type: t.type,
        subject: t.subject,
        target_class_id: t.target_class_id,
        target_class_name: t.target_class_name,
        created_by: t.created_by,
        created_by_name: t.created_by_name,
        created_at: t.created_at,
        last_message_at: t.last_message_at,
        last_message:
          t.last_message_id_is_fake_unused && t.last_message_body
            ? null
            : t.last_message_body
            ? {
                id: "preview", // preview only; full thread sẽ load lại
                body: t.last_message_body,
                sender_id: t.last_message_sender_id ?? "",
                sender_name: t.last_message_sender_name ?? "",
                created_at: t.last_message_created_at ?? "",
              }
            : null,
        unread_count: unread,
        participants,
      };
    })
  );

  // Sort: last_message_at DESC, NULLS LAST; created_at DESC fallback
  result.sort((a, b) => {
    const aT = a.last_message_at || a.created_at;
    const bT = b.last_message_at || b.created_at;
    return bT.localeCompare(aT);
  });

  res.json({ threads: result });
});

/**
 * POST /api/messages/threads
 * Direct: body = { recipient_id, body }
 * Broadcast: body = { type:'broadcast', subject, target_role, target_class_id?, body }
 *   - subject: required
 *   - target_role: required ('parent'|'teacher'|'all')
 *   - target_class_id: optional
 *   - body: required
 */
messagingRouter.post("/threads", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "parent", "teacher", "admin"]);
  if (!user) return;

  const body = req.body || {};
  const isBroadcast = body.type === "broadcast";

  if (isBroadcast) {
    // Only admin/teacher can broadcast
    if (user.role === "parent" || user.role === "student") {
      return res.status(403).json({ error: "Chỉ giáo viên hoặc admin mới có thể gửi broadcast." });
    }
    const subject = String(body.subject || "").trim();
    const targetRole = body.target_role;
    const targetClassId = body.target_class_id || null;
    const text = String(body.body || "").trim();
    if (!subject) return res.status(400).json({ error: "Thiếu subject." });
    if (!text) return res.status(400).json({ error: "Thiếu body." });
    if (!["student", "parent", "teacher", "all"].includes(targetRole)) {
      return res.status(400).json({ error: "target_role phải là student | parent | teacher | all." });
    }
    // Teacher chỉ được broadcast về PH/HS của lớp mình, không broadcast tới GV khác
    if (user.role === "teacher" && targetRole === "teacher") {
      return res.status(403).json({ error: "GV không thể broadcast tới GV khác." });
    }
    if (targetClassId) {
      // Verify teacher owns class (admin pass)
      if (user.role === "teacher") {
        const owns = await queryOne(
          "SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?",
          [targetClassId, user.id]
        );
        if (!owns) {
          return res.status(403).json({ error: "Bạn không dạy lớp này." });
        }
      }
    }
    // Count recipients for audit
    let recipientCount = 0;
    if (user.role === "admin") {
      // Count by target_role + class scope
      if (targetClassId) {
        if (targetRole === "parent") {
          const row = await queryOne<RowDataPacket & { c: number }>(
            `SELECT COUNT(DISTINCT pl.parent_id) AS c
             FROM class_members cm
             JOIN parent_links pl ON pl.student_id = cm.student_id
             JOIN users u ON u.id = pl.parent_id
             WHERE cm.class_id = ? AND u.deleted_at IS NULL`,
            [targetClassId]
          );
          recipientCount = row?.c ?? 0;
        } else if (targetRole === "student") {
          const row = await queryOne<RowDataPacket & { c: number }>(
            `SELECT COUNT(*) AS c FROM class_members cm
             JOIN users u ON u.id = cm.student_id
             WHERE cm.class_id = ? AND u.deleted_at IS NULL`,
            [targetClassId]
          );
          recipientCount = row?.c ?? 0;
        } else {
          const row = await queryOne<RowDataPacket & { c: number }>(
            `SELECT COUNT(*) AS c FROM users WHERE role=? AND deleted_at IS NULL`,
            [targetRole]
          );
          recipientCount = row?.c ?? 0;
        }
      } else if (targetRole === "all") {
        const row = await queryOne<RowDataPacket & { c: number }>(
          `SELECT COUNT(*) AS c FROM users WHERE role IN ('student','parent','teacher') AND deleted_at IS NULL`
        );
        recipientCount = row?.c ?? 0;
      } else {
        const row = await queryOne<RowDataPacket & { c: number }>(
          `SELECT COUNT(*) AS c FROM users WHERE role=? AND deleted_at IS NULL`,
          [targetRole]
        );
        recipientCount = row?.c ?? 0;
      }
    } else {
      // Teacher: count parents + students of own classes
      if (targetRole === "parent") {
        const row = await queryOne<RowDataPacket & { c: number }>(
          `SELECT COUNT(DISTINCT pl.parent_id) AS c
           FROM parent_links pl
           JOIN class_members cm ON cm.student_id = pl.student_id
           JOIN classes c ON c.id = cm.class_id
           JOIN users u ON u.id = pl.parent_id
           WHERE c.teacher_id = ? AND u.deleted_at IS NULL
             ${targetClassId ? "AND c.id = ?" : ""}`,
          targetClassId ? [user.id, targetClassId] : [user.id]
        );
        recipientCount = row?.c ?? 0;
      } else if (targetRole === "student") {
        const row = await queryOne<RowDataPacket & { c: number }>(
          `SELECT COUNT(*) AS c FROM class_members cm
           JOIN classes c ON c.id = cm.class_id
           JOIN users u ON u.id = cm.student_id
           WHERE c.teacher_id = ? AND u.deleted_at IS NULL
             ${targetClassId ? "AND c.id = ?" : ""}`,
          targetClassId ? [user.id, targetClassId] : [user.id]
        );
        recipientCount = row?.c ?? 0;
      } else if (targetRole === "all") {
        // Teacher: all parents + students of own classes
        const row = await queryOne<RowDataPacket & { c: number }>(
          `SELECT (
             (SELECT COUNT(DISTINCT pl.parent_id)
              FROM parent_links pl
              JOIN class_members cm ON cm.student_id = pl.student_id
              JOIN classes c ON c.id = cm.class_id
              JOIN users u ON u.id = pl.parent_id
              WHERE c.teacher_id = ? AND u.deleted_at IS NULL)
             +
             (SELECT COUNT(*)
              FROM class_members cm
              JOIN classes c ON c.id = cm.class_id
              JOIN users u ON u.id = cm.student_id
              WHERE c.teacher_id = ? AND u.deleted_at IS NULL)
           ) AS c`,
          [user.id, user.id]
        );
        recipientCount = row?.c ?? 0;
      }
    }

    const threadId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO message_threads (id, type, subject, target_role, target_class_id, created_by, last_message_at)
         VALUES (?, 'broadcast', ?, ?, ?, ?, ?)`,
        [threadId, subject, targetRole, targetClassId, user.id, now]
      );
      await conn.execute(
        `INSERT INTO messages (id, thread_id, sender_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [messageId, threadId, user.id, text, now]
      );
    });

    await logAudit({
      actorId: user.id,
      action: "broadcast.send",
      targetType: "thread",
      targetId: threadId,
      details: {
        subject,
        target_role: targetRole,
        target_class_id: targetClassId,
        recipient_count: recipientCount,
        body_length: text.length,
      },
      ip: req.ip,
    });

    return res.json({
      thread: {
        id: threadId,
        type: "broadcast",
        subject,
        target_class_id: targetClassId,
        target_class_name: null,
        created_by: user.id,
        created_at: now,
        last_message_at: now,
        unread_count: 0,
        participants: [],
      },
      message: {
        id: messageId,
        thread_id: threadId,
        sender_id: user.id,
        sender_name: user.name,
        sender_role: user.role,
        body: text,
        created_at: now,
      },
    });
  }

  // Direct thread
  const recipientId = body.recipient_id;
  const text = String(body.body || "").trim();
  if (!recipientId) return res.status(400).json({ error: "Thiếu recipient_id." });
  if (!text) return res.status(400).json({ error: "Thiếu body." });

  // Validate recipient
  const recipient = await queryOne<RowDataPacket & { name: string; role: string }>(
    "SELECT id, name, role FROM users WHERE id = ? AND deleted_at IS NULL",
    [recipientId]
  );
  if (!recipient) {
    return res.status(400).json({ error: "recipient_id không tồn tại hoặc đã xóa." });
  }
  if (recipient.id === user.id) {
    return res.status(400).json({ error: "Không thể tự nhắn cho chính mình." });
  }

  // Validate recipient role theo pair rules
  // PH ↔ GV (transitive: PH của HS → GV lớp HS), PH ↔ Admin, GV ↔ Admin
  const isValidPair = await checkRecipientPair(user, recipient.id, recipient.role as any);
  if (!isValidPair) {
    return res.status(403).json({
      error: "Bạn không thể nhắn tin cho người này (không có quan hệ trực tiếp).",
    });
  }

  // Check existing direct thread giữa 2 user
  const existing = await queryOne<RowDataPacket & { id: string }>(
    `SELECT t.id
     FROM message_threads t
     JOIN thread_participants a ON a.thread_id = t.id AND a.user_id = ?
     JOIN thread_participants b ON b.thread_id = t.id AND b.user_id = ?
     WHERE t.type = 'direct' AND t.deleted_at IS NULL
     LIMIT 1`,
    [user.id, recipientId]
  );

  const now = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  let threadId: string;
  let messageId: string;
  let created = false;
  if (existing) {
    threadId = existing.id;
    created = false;
  } else {
    threadId = crypto.randomUUID();
    created = true;
  }
  messageId = crypto.randomUUID();

  await withTransaction(async (conn) => {
    if (created) {
      await conn.execute(
        `INSERT INTO message_threads (id, type, created_by, last_message_at)
         VALUES (?, 'direct', ?, ?)`,
        [threadId, user.id, now]
      );
      await conn.execute(
        `INSERT INTO thread_participants (thread_id, user_id) VALUES (?, ?), (?, ?)`,
        [threadId, user.id, threadId, recipientId]
      );
    } else {
      // Bump last_message_at
      await conn.execute(
        `UPDATE message_threads SET last_message_at = ? WHERE id = ?`,
        [now, threadId]
      );
    }
    await conn.execute(
      `INSERT INTO messages (id, thread_id, sender_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, threadId, user.id, text, now]
    );
  });

  if (created) {
    await logAudit({
      actorId: user.id,
      action: "thread.create",
      targetType: "thread",
      targetId: threadId,
      details: {
        recipient_id: recipientId,
        recipient_name: recipient.name,
        body_length: text.length,
      },
      ip: req.ip,
    });
  }
  await logAudit({
    actorId: user.id,
    action: "message.send",
    targetType: "message",
    targetId: messageId,
    details: {
      thread_id: threadId,
      thread_type: "direct",
      body_length: text.length,
    },
    ip: req.ip,
  });

  res.json({
    thread: {
      id: threadId,
      type: "direct",
      subject: null,
      target_class_id: null,
      target_class_name: null,
      created_by: user.id,
      created_at: now,
      last_message_at: now,
      unread_count: 0,
      participants: [
        { id: user.id, name: user.name, role: user.role },
        { id: recipient.id, name: recipient.name, role: recipient.role as any },
      ],
    },
    message: {
      id: messageId,
      thread_id: threadId,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      body: text,
      created_at: now,
    },
  });
});

/**
 * Helper: check pair rule giữa caller và recipient.
 * - Admin ↔ any (pass)
 * - Student ↔ Admin (pass)
 * - Student ↔ Teacher: HS phải trong lớp GV dạy
 * - Student ↔ Parent: PH phải là PH của HS
 * - PH ↔ Admin / Teacher-of-my-kid's-class / My-child
 * - Teacher ↔ Admin / PH-of-my-class / Student-in-my-class
 * - Same role (except admin): 403
 */
async function checkRecipientPair(
  user: AuthUser,
  recipientId: string,
  recipientRole: "student" | "parent" | "teacher" | "admin"
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (recipientRole === "admin") return true;

  // Same-role chỉ admin được (đã check ở trên)
  if (user.role === recipientRole) return false;

  // Student → Teacher
  if (user.role === "student" && recipientRole === "teacher") {
    const row = await queryOne(
      `SELECT 1 FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       WHERE cm.student_id = ? AND c.teacher_id = ?
       LIMIT 1`,
      [user.id, recipientId]
    );
    return !!row;
  }

  // Student → Parent
  if (user.role === "student" && recipientRole === "parent") {
    const row = await queryOne(
      `SELECT 1 FROM parent_links WHERE student_id = ? AND parent_id = ?
       LIMIT 1`,
      [user.id, recipientId]
    );
    return !!row;
  }

  // Teacher → Student
  if (user.role === "teacher" && recipientRole === "student") {
    const row = await queryOne(
      `SELECT 1 FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       WHERE cm.student_id = ? AND c.teacher_id = ?
       LIMIT 1`,
      [recipientId, user.id]
    );
    return !!row;
  }

  // Parent → Student (own child)
  if (user.role === "parent" && recipientRole === "student") {
    const row = await queryOne(
      `SELECT 1 FROM parent_links WHERE student_id = ? AND parent_id = ?
       LIMIT 1`,
      [recipientId, user.id]
    );
    return !!row;
  }

  // PH → Teacher: PH phải có con trong lớp của GV
  if (user.role === "parent" && recipientRole === "teacher") {
    const row = await queryOne(
      `SELECT 1
       FROM parent_links pl
       JOIN class_members cm ON cm.student_id = pl.student_id
       JOIN classes c ON c.id = cm.class_id
       WHERE pl.parent_id = ? AND c.teacher_id = ?
       LIMIT 1`,
      [user.id, recipientId]
    );
    return !!row;
  }

  // Teacher → Parent: GV phải dạy lớp có con của PH
  if (user.role === "teacher" && recipientRole === "parent") {
    const row = await queryOne(
      `SELECT 1
       FROM classes c
       JOIN class_members cm ON cm.class_id = c.id
       JOIN parent_links pl ON pl.student_id = cm.student_id
       WHERE c.teacher_id = ? AND pl.parent_id = ?
       LIMIT 1`,
      [user.id, recipientId]
    );
    return !!row;
  }

  return false;
}

/**
 * GET /api/messages/threads/:id
 */
messagingRouter.get("/threads/:id", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "parent", "teacher", "admin"]);
  if (!user) return;

  const threadId = req.params.id;
  const thread = await queryOne<ThreadRow>(
    `SELECT t.id, t.type, t.subject, t.target_role, t.target_class_id,
            NULL AS target_class_name,
            t.created_by, u.name AS created_by_name,
            t.created_at, t.last_message_at,
            NULL AS last_message_body, NULL AS last_message_sender_id,
            NULL AS last_message_sender_name, NULL AS last_message_created_at
     FROM message_threads t
     JOIN users u ON u.id = t.created_by
     WHERE t.id = ? AND t.deleted_at IS NULL`,
    [threadId]
  );
  if (!thread) return res.status(404).json({ error: "Thread không tồn tại." });

  // Authorize
  if (thread.type === "direct") {
    const isParticipant = await queryOne(
      "SELECT 1 FROM thread_participants WHERE thread_id = ? AND user_id = ?",
      [threadId, user.id]
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Bạn không phải người tham gia thread này." });
    }
  } else {
    // Broadcast: check scope
    if (user.role !== "admin") {
      const classIds = await getUserScopeClassIds(user);
      if (!broadcastMatchesUser(thread, user, classIds)) {
        return res.status(403).json({ error: "Bạn không có quyền xem broadcast này." });
      }
    }
  }

  await attachClassName([thread]);

  // Messages
  const messages = (await query<MessageRow[]>(
    `SELECT m.id, m.thread_id, m.sender_id, m.body, m.created_at,
            u.name AS sender_name, u.role AS sender_role
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.thread_id = ? AND m.deleted_at IS NULL
     ORDER BY m.created_at ASC
     LIMIT 200`,
    [threadId]
  )) as MessageRow[];

  // Auto-mark read
  const now = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  await query<ResultSetHeader>(
    `INSERT INTO thread_reads (thread_id, user_id, last_read_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
    [threadId, user.id, now]
  );

  // Participants (direct)
  const participants = thread.type === "direct" ? await getParticipants(threadId) : [];

  res.json({
    thread: {
      id: thread.id,
      type: thread.type,
      subject: thread.subject,
      target_class_id: thread.target_class_id,
      target_class_name: thread.target_class_name,
      created_by: thread.created_by,
      created_by_name: thread.created_by_name,
      created_at: thread.created_at,
      last_message_at: thread.last_message_at,
      unread_count: 0, // marked read
      participants,
    },
    messages: messages.map((m) => ({
      id: m.id,
      thread_id: m.thread_id,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      sender_role: m.sender_role,
      body: m.body,
      created_at: m.created_at,
    })),
    participants,
  });
});

/**
 * POST /api/messages/threads/:id/messages
 * body: { body }
 */
messagingRouter.post("/threads/:id/messages", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "parent", "teacher", "admin"]);
  if (!user) return;

  const threadId = req.params.id;
  const text = String(req.body?.body || "").trim();
  if (!text) return res.status(400).json({ error: "Thiếu body." });

  const thread = await queryOne<RowDataPacket & { type: string; created_by: string }>(
    "SELECT type, created_by FROM message_threads WHERE id = ? AND deleted_at IS NULL",
    [threadId]
  );
  if (!thread) return res.status(404).json({ error: "Thread không tồn tại." });

  // Authorize
  if (thread.type === "direct") {
    const isParticipant = await queryOne(
      "SELECT 1 FROM thread_participants WHERE thread_id = ? AND user_id = ?",
      [threadId, user.id]
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Bạn không phải người tham gia thread này." });
    }
  } else {
    // Broadcast: chỉ creator hoặc admin được reply
    if (user.role !== "admin" && thread.created_by !== user.id) {
      return res.status(403).json({
        error: "Chỉ người tạo broadcast hoặc admin mới có thể gửi thêm message.",
      });
    }
  }

  const messageId = crypto.randomUUID();
  const now = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO messages (id, thread_id, sender_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, threadId, user.id, text, now]
    );
    await conn.execute(
      `UPDATE message_threads SET last_message_at = ? WHERE id = ?`,
      [now, threadId]
    );
    // Auto-mark read for sender
    await conn.execute(
      `INSERT INTO thread_reads (thread_id, user_id, last_read_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
      [threadId, user.id, now]
    );
  });

  await logAudit({
    actorId: user.id,
    action: "message.send",
    targetType: "message",
    targetId: messageId,
    details: {
      thread_id: threadId,
      thread_type: thread.type,
      body_length: text.length,
    },
    ip: req.ip,
  });

  res.json({
    message: {
      id: messageId,
      thread_id: threadId,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      body: text,
      created_at: now,
    },
  });
});

/**
 * POST /api/messages/threads/:id/read
 * Idempotent upsert
 */
messagingRouter.post("/threads/:id/read", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "parent", "teacher", "admin"]);
  if (!user) return;

  const threadId = req.params.id;
  // Authorize (must be participant OR broadcast match)
  const thread = await queryOne<RowDataPacket & { type: string; target_role: string | null; target_class_id: string | null }>(
    "SELECT type, target_role, target_class_id FROM message_threads WHERE id = ? AND deleted_at IS NULL",
    [threadId]
  );
  if (!thread) return res.status(404).json({ error: "Thread không tồn tại." });

  if (thread.type === "direct") {
    const isParticipant = await queryOne(
      "SELECT 1 FROM thread_participants WHERE thread_id = ? AND user_id = ?",
      [threadId, user.id]
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Bạn không phải người tham gia thread này." });
    }
  } else {
    if (user.role !== "admin") {
      const classIds = await getUserScopeClassIds(user);
      const t = { ...thread } as ThreadRow;
      t.target_role = thread.target_role;
      t.target_class_id = thread.target_class_id;
      if (!broadcastMatchesUser(t, user, classIds)) {
        return res.status(403).json({ error: "Bạn không có quyền." });
      }
    }
  }

  const now = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  await query<ResultSetHeader>(
    `INSERT INTO thread_reads (thread_id, user_id, last_read_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
    [threadId, user.id, now]
  );

  res.json({ ok: true, last_read_at: now });
});

/**
 * GET /api/messages/unread-count
 * Đếm tổng số message chưa đọc (direct + broadcast match)
 */
messagingRouter.get("/unread-count", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "parent", "teacher", "admin"]);
  if (!user) return;

  // Direct: đếm messages trong thread mà user là participant, chưa đọc
  const directRow = (await queryOne<RowDataPacket & { c: number }>(
    `SELECT COUNT(*) AS c
     FROM messages m
     JOIN thread_participants tp ON tp.thread_id = m.thread_id AND tp.user_id = ?
     LEFT JOIN thread_reads tr ON tr.thread_id = m.thread_id AND tr.user_id = ?
     JOIN message_threads t ON t.id = m.thread_id
     WHERE t.type = 'direct' AND t.deleted_at IS NULL
       AND m.deleted_at IS NULL
       AND m.sender_id != ?
       AND m.created_at > COALESCE(tr.last_read_at, '1970-01-01 00:00:00')`,
    [user.id, user.id, user.id]
  )) as { c: number } | undefined;

  // Broadcast: đếm messages trong broadcast thread match, chưa đọc
  let broadcastCount = 0;
  if (user.role === "admin") {
    const r = (await queryOne<RowDataPacket & { c: number }>(
      `SELECT COUNT(*) AS c
       FROM messages m
       JOIN message_threads t ON t.id = m.thread_id
       LEFT JOIN thread_reads tr ON tr.thread_id = m.thread_id AND tr.user_id = ?
       WHERE t.type = 'broadcast' AND t.deleted_at IS NULL
         AND m.deleted_at IS NULL
         AND m.created_at > COALESCE(tr.last_read_at, '1970-01-01 00:00:00')`,
      [user.id]
    )) as { c: number } | undefined;
    broadcastCount = r?.c ?? 0;
  } else {
    const classIds = await getUserScopeClassIds(user);
    const allowedRoles =
      user.role === "parent" ? ["parent", "all"]
      : user.role === "teacher" ? ["teacher", "all"]
      : user.role === "student" ? ["student", "all"]
      : [];
    if (classIds.length === 0) {
      const r = (await queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(*) AS c
         FROM messages m
         JOIN message_threads t ON t.id = m.thread_id
         LEFT JOIN thread_reads tr ON tr.thread_id = m.thread_id AND tr.user_id = ?
         WHERE t.type = 'broadcast' AND t.deleted_at IS NULL
           AND m.deleted_at IS NULL
           AND m.created_at > COALESCE(tr.last_read_at, '1970-01-01 00:00:00')
           AND (t.target_role IN (?) OR t.target_role IS NULL)`,
        [user.id, allowedRoles]
      )) as { c: number } | undefined;
      broadcastCount = r?.c ?? 0;
    } else {
      const r = (await queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(*) AS c
         FROM messages m
         JOIN message_threads t ON t.id = m.thread_id
         LEFT JOIN thread_reads tr ON tr.thread_id = m.thread_id AND tr.user_id = ?
         WHERE t.type = 'broadcast' AND t.deleted_at IS NULL
           AND m.deleted_at IS NULL
           AND m.created_at > COALESCE(tr.last_read_at, '1970-01-01 00:00:00')
           AND ((t.target_role IN (?) OR t.target_role IS NULL) OR t.target_class_id IN (?))`,
        [user.id, allowedRoles, classIds]
      )) as { c: number } | undefined;
      broadcastCount = r?.c ?? 0;
    }
  }

  res.json({ count: (directRow?.c ?? 0) + broadcastCount });
});

/**
 * GET /api/messages/eligible-recipients
 * HS: admin + teachers of HS's class + parents of HS
 * PH: admin + teachers of PH's kids' classes
 * GV: admin + parents of GV's classes + students in GV's classes
 * Admin: all non-deleted users (except self)
 */
messagingRouter.get("/eligible-recipients", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "parent", "teacher", "admin"]);
  if (!user) return;

  let recipients: Array<{
    id: string;
    name: string;
    username: string;
    role: "student" | "parent" | "teacher" | "admin";
  }> = [];

  if (user.role === "admin") {
    const rows = (await query<RowDataPacket[]>(
      `SELECT id, name, username, role FROM users
       WHERE deleted_at IS NULL AND id != ?
       ORDER BY role, name`,
      [user.id]
    )) as RowDataPacket[];
    recipients = rows.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      role: r.role as any,
    }));
  } else if (user.role === "student") {
    // Admin + teachers of HS's class + parents of HS
    const rows = (await query<RowDataPacket[]>(
      `SELECT DISTINCT u.id, u.name, u.username, u.role
       FROM users u
       WHERE u.deleted_at IS NULL
         AND (
           u.role = 'admin'
           OR (u.role = 'teacher' AND u.id IN (
             SELECT DISTINCT c.teacher_id
             FROM classes c
             JOIN class_members cm ON cm.class_id = c.id
             WHERE cm.student_id = ?
           ))
           OR (u.role = 'parent' AND u.id IN (
             SELECT parent_id FROM parent_links WHERE student_id = ?
           ))
         )
       ORDER BY u.role, u.name`,
      [user.id, user.id]
    )) as RowDataPacket[];
    recipients = rows.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      role: r.role as any,
    }));
  } else if (user.role === "parent") {
    // Admin + teachers of PH's kids' classes
    const rows = (await query<RowDataPacket[]>(
      `SELECT DISTINCT u.id, u.name, u.username, u.role
       FROM users u
       WHERE u.deleted_at IS NULL
         AND (
           u.role = 'admin'
           OR (u.role = 'teacher' AND u.id IN (
             SELECT DISTINCT c.teacher_id
             FROM classes c
             JOIN class_members cm ON cm.class_id = c.id
             JOIN parent_links pl ON pl.student_id = cm.student_id
             WHERE pl.parent_id = ?
           ))
         )
       ORDER BY u.role, u.name`,
      [user.id]
    )) as RowDataPacket[];
    recipients = rows.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      role: r.role as any,
    }));
  } else if (user.role === "teacher") {
    // Admin + parents of GV's classes + students in GV's classes
    const rows = (await query<RowDataPacket[]>(
      `SELECT DISTINCT u.id, u.name, u.username, u.role
       FROM users u
       WHERE u.deleted_at IS NULL
         AND (
           u.role = 'admin'
           OR (u.role = 'parent' AND u.id IN (
             SELECT DISTINCT pl.parent_id
             FROM parent_links pl
             JOIN class_members cm ON cm.student_id = pl.student_id
             JOIN classes c ON c.id = cm.class_id
             WHERE c.teacher_id = ?
           ))
           OR (u.role = 'student' AND u.id IN (
             SELECT DISTINCT cm.student_id
             FROM class_members cm
             JOIN classes c ON c.id = cm.class_id
             WHERE c.teacher_id = ?
           ))
         )
       ORDER BY u.role, u.name`,
      [user.id, user.id]
    )) as RowDataPacket[];
    recipients = rows.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      role: r.role as any,
    }));
  }

  res.json({ recipients });
});
