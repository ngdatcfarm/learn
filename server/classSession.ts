/**
 * server/classSession.ts — Step 13b: "Lớp hôm nay" REST endpoints
 *
 * Class session = buổi học có GV trực tiếp (T3 trong mô hình Flipped Classroom).
 * GV-driven: bấm "Mở lớp" → tạo class_sessions row → broadcast socket → HS tự join.
 *
 * Routes (mounted at /api/class-sessions):
 *   GET  /today                                       — student: today's view, teacher: dashboard
 *   POST /                                            — teacher: start class session
 *   POST /:id/end                                     — teacher: end session
 *   POST /:id/hand-up                                 — student: hand up in queue
 *   GET  /:id/handups                                 — teacher: list pending hand-ups
 *   POST /:id/hand-ups/:huId/claim                    — teacher: claim → create live_help_session w/ trigger='class_session'
 *   POST /:id/board-push                              — teacher: push forced question
 *   POST /:id/board-pushes/:bpId/dismiss-request      — student: ask to dismiss
 *   POST /:id/board-pushes/:bpId/dismiss-approve      — teacher: approve dismissal
 *   POST /:id/tab-visibility                          — student: record visibility change (REST mirror)
 *   GET  /:id/review                                  — student: AI-generated review
 *
 * Reuse: queryOne/query pattern từ liveHelp.ts, audit, socket emit bridge.
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import {
  query,
  queryOne,
  RowDataPacket,
  ResultSetHeader,
  withTransaction,
} from "../db/client";
import { requireRole } from "./auth";
import { logAudit } from "./audit";
import { emitToRoom } from "./socket";

export const classSessionRouter = Router();

// ============================================================
// Helpers
// ============================================================

interface ClassSessionRow extends RowDataPacket {
  id: string;
  class_id: string;
  teacher_id: string;
  planned_question_ids: string | null; // JSON
  started_at: string | null;
  ended_at: string | null;
  status: "planned" | "active" | "ended" | "cancelled";
  created_at: string;
}

interface HandupRow extends RowDataPacket {
  id: string;
  class_session_id: string;
  student_id: string;
  question_id: string | null;
  message: string | null;
  queue_position: number;
  status: "queued" | "claimed" | "dismissed" | "cancelled";
  created_at: string;
  claimed_at: string | null;
}

interface BoardPushRow extends RowDataPacket {
  id: string;
  class_session_id: string;
  teacher_id: string;
  student_id: string;
  question_id: string | null;
  note: string | null;
  dismissed_requested_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

function nowMysql(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function loadSession(sessionId: string): Promise<ClassSessionRow | null> {
  return queryOne<ClassSessionRow>(
    `SELECT * FROM class_sessions WHERE id = ?`,
    [sessionId]
  );
}

async function ensureTeacherOwnsClass(
  teacherId: string,
  classId: string
): Promise<boolean> {
  const row = await queryOne<RowDataPacket & { id: string }>(
    `SELECT id FROM classes WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL`,
    [classId, teacherId]
  );
  return !!row;
}

/** Verify user is a student member of class (for HS-facing endpoints). */
async function ensureStudentInClass(
  studentId: string,
  classId: string
): Promise<boolean> {
  const row = await queryOne<RowDataPacket>(
    `SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ? LIMIT 1`,
    [classId, studentId]
  );
  return !!row;
}

async function loadReviewForSession(sessionId: string): Promise<{
  payload: unknown;
  model: string;
  generated_at: string;
} | null> {
  const row = await queryOne<RowDataPacket & {
    payload_json: string;
    model: string;
    generated_at: string;
  }>(
    `SELECT payload_json, model, generated_at FROM class_session_reviews WHERE class_session_id = ?`,
    [sessionId]
  );
  if (!row) return null;
  try {
    return {
      payload: JSON.parse(row.payload_json),
      model: row.model,
      generated_at: row.generated_at,
    };
  } catch {
    return null;
  }
}

// ============================================================
// GET /api/class-sessions/today
// Student: { session (active|none), countdown, review }
// Teacher: { active_session, upcoming_today, recent_past }
// ============================================================
classSessionRouter.get("/today", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "teacher", "admin"]);
  if (!user) return;

  if (user.role === "student") {
    // Lấy class HS đang học (lớp cũ nhất)
    const cls = await queryOne<RowDataPacket & { class_id: string }>(
      `SELECT cm.class_id FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       WHERE cm.student_id = ? AND c.deleted_at IS NULL
       ORDER BY cm.joined_at ASC LIMIT 1`,
      [user.id]
    );
    if (!cls) {
      return res.json({
        session: null,
        countdown: null,
        review: null,
        class_id: null,
      });
    }

    const active = await queryOne<ClassSessionRow>(
      `SELECT * FROM class_sessions
       WHERE class_id = ? AND status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
      [cls.class_id]
    );

    // Review: ưu tiên session gần nhất ended hôm qua (theo ngày hôm nay của HS)
    // Nếu hôm nay không có active session → tìm ended gần nhất (≤ 36h)
    let review: { payload: unknown; model: string; generated_at: string } | null = null;
    if (!active) {
      const recentEnded = await queryOne<ClassSessionRow>(
        `SELECT id FROM class_sessions
         WHERE class_id = ? AND status = 'ended'
           AND ended_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
         ORDER BY ended_at DESC LIMIT 1`,
        [cls.class_id]
      );
      if (recentEnded) {
        review = await loadReviewForSession(recentEnded.id);
      }
    }

    return res.json({
      session: active
        ? {
            id: active.id,
            class_id: active.class_id,
            teacher_id: active.teacher_id,
            started_at: active.started_at,
            status: active.status,
          }
        : null,
      countdown: !active ? computeCountdownToNextClass(cls.class_id) : null,
      review,
      class_id: cls.class_id,
    });
  }

  // Teacher / admin
  const active = await queryOne<ClassSessionRow>(
    `SELECT * FROM class_sessions
     WHERE teacher_id = ? AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
    [user.id]
  );
  const recent = await query<ClassSessionRow[]>(
    `SELECT * FROM class_sessions
     WHERE teacher_id = ? AND status IN ('ended','cancelled')
     ORDER BY ended_at DESC LIMIT 5`,
    [user.id]
  );
  return res.json({
    active_session: active
      ? {
          id: active.id,
          class_id: active.class_id,
          started_at: active.started_at,
          status: active.status,
        }
      : null,
    recent_past: recent.map((r) => ({
      id: r.id,
      class_id: r.class_id,
      started_at: r.started_at,
      ended_at: r.ended_at,
      status: r.status,
    })),
  });
});

function computeCountdownToNextClass(_classId: string): {
  label: string;
  approx_minutes: number;
} {
  // Placeholder: cron open từ schedule chưa được implement (Step 13b out-of-scope).
  // Trả ước lượng 6h tới buổi kế — chỉ để HS không thấy trống.
  return { label: "GV sẽ mở lớp — review hôm qua đang chờ.", approx_minutes: 360 };
}

// ============================================================
// POST /api/class-sessions
// Body: { class_id, planned_question_ids?: string[] }
// ============================================================
classSessionRouter.post("/", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const { class_id, planned_question_ids } = req.body || {};
  if (!class_id || typeof class_id !== "string") {
    return res.status(400).json({ error: "Thiếu class_id." });
  }

  if (teacher.role === "teacher") {
    const owns = await ensureTeacherOwnsClass(teacher.id, class_id);
    if (!owns) {
      return res.status(403).json({ error: "Bạn không dạy lớp này." });
    }
  }

  // 409 nếu đã có active session cho lớp
  const existing = await queryOne<ClassSessionRow>(
    `SELECT id FROM class_sessions WHERE class_id = ? AND status = 'active' LIMIT 1`,
    [class_id]
  );
  if (existing) {
    return res.status(409).json({
      error: "Lớp này đang có buổi học active.",
      session_id: existing.id,
    });
  }

  const id = crypto.randomUUID();
  const now = nowMysql();
  const plannedJson =
    Array.isArray(planned_question_ids) && planned_question_ids.length > 0
      ? JSON.stringify(planned_question_ids.slice(0, 50))
      : null;

  await query<ResultSetHeader>(
    `INSERT INTO class_sessions
       (id, class_id, teacher_id, planned_question_ids, started_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [id, class_id, teacher.id, plannedJson, now, now]
  );

  // Audit + broadcast
  await logAudit({
    actorId: teacher.id,
    action: "class_session.started",
    targetType: "class_session",
    targetId: id,
    details: { class_id, planned_count: planned_question_ids?.length ?? 0 },
    ip: req.ip,
  });

  // Engagement event
  await query<ResultSetHeader>(
    `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
     VALUES (?, ?, 'class_session_started', NULL, ?, ?)`,
    [
      crypto.randomUUID(),
      teacher.id,
      JSON.stringify({ class_session_id: id, class_id }),
      now,
    ]
  );

  // Broadcast: HS trong lớp tự join (subscribe tới room "class:<id>" qua socket)
  emitToRoom("/live-help", `class:${id}`, "class:state", {
    session_id: id,
    class_id,
    teacher_id: teacher.id,
    started_at: now,
    status: "active",
  });

  res.json({ ok: true, session_id: id, started_at: now });
});

// ============================================================
// POST /api/class-sessions/:id/end (teacher)
// ============================================================
classSessionRouter.post("/:id/end", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const session = await loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session không tồn tại." });
  if (teacher.role === "teacher" && session.teacher_id !== teacher.id) {
    return res.status(403).json({ error: "Bạn không phải GV của buổi này." });
  }
  if (session.status === "ended" || session.status === "cancelled") {
    return res.json({ ok: true, already_ended: true });
  }

  const now = nowMysql();
  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE class_sessions SET status = 'ended', ended_at = ? WHERE id = ?`,
      [now, session.id]
    );
    // Cancel pending hand-ups
    await conn.execute(
      `UPDATE class_session_handups
       SET status = 'cancelled'
       WHERE class_session_id = ? AND status = 'queued'`,
      [session.id]
    );
    // End any active live_help_sessions tied to this class_session
    await conn.execute(
      `UPDATE live_help_sessions
       SET status = 'ended', ended_at = ?, outcome = 'teacher_left'
       WHERE class_session_id = ? AND status IN ('pending','active')`,
      [now, session.id]
    );
  });

  await query<ResultSetHeader>(
    `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
     VALUES (?, ?, 'class_session_ended', NULL, ?, ?)`,
    [
      crypto.randomUUID(),
      teacher.id,
      JSON.stringify({ class_session_id: session.id }),
      now,
    ]
  );

  emitToRoom("/live-help", `class:${session.id}`, "class:state", {
    session_id: session.id,
    status: "ended",
    ended_at: now,
  });

  await logAudit({
    actorId: teacher.id,
    action: "class_session.ended",
    targetType: "class_session",
    targetId: session.id,
    ip: req.ip,
  });

  res.json({ ok: true, ended_at: now });
});

// ============================================================
// POST /api/class-sessions/:id/hand-up (student)
// Body: { question_id?: string, message?: string }
// ============================================================
classSessionRouter.post("/:id/hand-up", async (req: Request, res: Response) => {
  const student = await requireRole(req, res, ["student"]);
  if (!student) return;

  const session = await loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session không tồn tại." });
  if (session.status !== "active") {
    return res.status(409).json({ error: "Buổi học chưa active." });
  }
  if (!(await ensureStudentInClass(student.id, session.class_id))) {
    return res.status(403).json({ error: "Bạn không ở trong lớp này." });
  }

  // Check if student already queued
  const existing = await queryOne<HandupRow>(
    `SELECT id, status FROM class_session_handups
     WHERE class_session_id = ? AND student_id = ? AND status = 'queued' LIMIT 1`,
    [session.id, student.id]
  );
  if (existing) {
    return res.status(409).json({
      error: "Em đã giơ tay rồi — chờ GV vào nhé.",
      handup_id: existing.id,
    });
  }

  const { question_id, message } = req.body || {};
  const safeMessage =
    typeof message === "string" && message.trim() ? message.trim().slice(0, 500) : null;

  // queue_position = MAX + 1
  const posRow = await queryOne<RowDataPacket & { next_pos: number }>(
    `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next_pos
     FROM class_session_handups WHERE class_session_id = ?`,
    [session.id]
  );
  const queuePos = posRow?.next_pos ?? 1;

  const id = crypto.randomUUID();
  const now = nowMysql();
  await query<ResultSetHeader>(
    `INSERT INTO class_session_handups
       (id, class_session_id, student_id, question_id, message, queue_position, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`,
    [id, session.id, student.id, question_id || null, safeMessage, queuePos, now]
  );

  // Audit + engagement event
  await query<ResultSetHeader>(
    `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
     VALUES (?, ?, 'class_hand_up', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      student.id,
      queuePos,
      JSON.stringify({ class_session_id: session.id, handup_id: id }),
      now,
    ]
  );

  // Realtime: GV nhận ngay qua socket
  emitToRoom("/live-help", `class:${session.id}`, "class:hand-up-new", {
    handup_id: id,
    class_session_id: session.id,
    student_id: student.id,
    student_name: student.name,
    question_id: question_id || null,
    message: safeMessage,
    queue_position: queuePos,
    created_at: now,
  });

  await logAudit({
    actorId: student.id,
    action: "class_session.hand_up",
    targetType: "class_session",
    targetId: session.id,
    details: { handup_id: id, queue_position: queuePos, has_question: !!question_id },
    ip: req.ip,
  });

  res.json({ ok: true, handup_id: id, queue_position: queuePos });
});

// ============================================================
// GET /api/class-sessions/:id/handups (teacher)
// ============================================================
classSessionRouter.get("/:id/handups", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const session = await loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session không tồn tại." });
  if (teacher.role === "teacher" && session.teacher_id !== teacher.id) {
    return res.status(403).json({ error: "Bạn không phải GV của buổi này." });
  }

  const rows = await query<Array<HandupRow & { student_name: string }>>(
    `SELECT h.*, u.name AS student_name
     FROM class_session_handups h
     JOIN users u ON u.id = h.student_id
     WHERE h.class_session_id = ?
     ORDER BY h.status = 'queued' DESC, h.queue_position ASC, h.created_at ASC`,
    [session.id]
  );

  res.json({ handups: rows, count: rows.length });
});

// ============================================================
// POST /api/class-sessions/:id/hand-ups/:huId/claim (teacher)
// → auto-create live_help_session với trigger='class_session'
// ============================================================
classSessionRouter.post(
  "/:id/hand-ups/:huId/claim",
  async (req: Request, res: Response) => {
    const teacher = await requireRole(req, res, ["teacher", "admin"]);
    if (!teacher) return;

    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session không tồn tại." });
    if (session.status !== "active") {
      return res.status(409).json({ error: "Buổi học chưa active." });
    }
    if (teacher.role === "teacher" && session.teacher_id !== teacher.id) {
      return res.status(403).json({ error: "Bạn không phải GV của buổi này." });
    }

    const handup = await queryOne<HandupRow>(
      `SELECT * FROM class_session_handups WHERE id = ? AND class_session_id = ?`,
      [req.params.huId, session.id]
    );
    if (!handup) return res.status(404).json({ error: "Hand-up không tồn tại." });
    if (handup.status !== "queued") {
      return res.status(409).json({ error: `Hand-up đã ở trạng thái ${handup.status}.` });
    }

    const now = nowMysql();
    const liveHelpId = crypto.randomUUID();

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE class_session_handups
         SET status = 'claimed', claimed_at = ?
         WHERE id = ?`,
        [now, handup.id]
      );
      await conn.execute(
        `INSERT INTO live_help_sessions
           (id, class_id, student_id, teacher_id, class_session_id, \`trigger\`, \`level\`, status, started_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'class_session', 'voice', 'active', ?, ?)`,
        [liveHelpId, session.class_id, handup.student_id, teacher.id, session.id, now, now]
      );
    });

    // Realtime: cả lớp biết HS này đang được hỗ trợ
    emitToRoom("/live-help", `class:${session.id}`, "class:hand-up-claimed", {
      handup_id: handup.id,
      student_id: handup.student_id,
      live_help_session_id: liveHelpId,
    });

    await query<ResultSetHeader>(
      `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
       VALUES (?, ?, 'class_hand_up_claimed', NULL, ?, ?)`,
      [
        crypto.randomUUID(),
        teacher.id,
        JSON.stringify({
          class_session_id: session.id,
          student_id: handup.student_id,
          live_help_session_id: liveHelpId,
        }),
        now,
      ]
    );

    await logAudit({
      actorId: teacher.id,
      action: "class_session.claim_handup",
      targetType: "class_session_handup",
      targetId: handup.id,
      details: {
        class_session_id: session.id,
        student_id: handup.student_id,
        live_help_session_id: liveHelpId,
      },
      ip: req.ip,
    });

    res.json({
      ok: true,
      live_help_session_id: liveHelpId,
      handup_id: handup.id,
    });
  }
);

// ============================================================
// POST /api/class-sessions/:id/board-push (teacher)
// Body: { student_id, question_id?, note? }
// Rate limit: 1 push / 10s / (session, student)
// ============================================================
classSessionRouter.post("/:id/board-push", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const session = await loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session không tồn tại." });
  if (session.status !== "active") {
    return res.status(409).json({ error: "Buổi học chưa active." });
  }
  if (teacher.role === "teacher" && session.teacher_id !== teacher.id) {
    return res.status(403).json({ error: "Bạn không phải GV của buổi này." });
  }

  const { student_id, question_id, note } = req.body || {};
  if (!student_id) {
    return res.status(400).json({ error: "Thiếu student_id." });
  }
  if (!(await ensureStudentInClass(student_id, session.class_id))) {
    return res.status(404).json({ error: "HS không ở trong lớp này." });
  }

  // Rate limit
  const recent = await queryOne<RowDataPacket>(
    `SELECT created_at FROM class_session_board_pushes
     WHERE class_session_id = ? AND student_id = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
     ORDER BY created_at DESC LIMIT 1`,
    [session.id, student_id]
  );
  if (recent) {
    return res.status(429).json({
      error: "Vừa push cho HS này rồi — chờ 10s.",
    });
  }

  const safeNote =
    typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  const id = crypto.randomUUID();
  const now = nowMysql();
  await query<ResultSetHeader>(
    `INSERT INTO class_session_board_pushes
       (id, class_session_id, teacher_id, student_id, question_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, session.id, teacher.id, student_id, question_id || null, safeNote, now]
  );

  // Realtime: HS nhận forced board
  emitToRoom("/live-help", `class:${session.id}`, "class:board-push", {
    board_id: id,
    class_session_id: session.id,
    student_id,
    question_id: question_id || null,
    note: safeNote,
    created_at: now,
  });

  await query<ResultSetHeader>(
    `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
     VALUES (?, ?, 'class_board_pushed', NULL, ?, ?)`,
    [
      crypto.randomUUID(),
      student_id,
      JSON.stringify({
        class_session_id: session.id,
        board_id: id,
        teacher_id: teacher.id,
      }),
      now,
    ]
  );

  await logAudit({
    actorId: teacher.id,
    action: "class_session.board_push",
    targetType: "class_session_board_push",
    targetId: id,
    details: { class_session_id: session.id, student_id, has_question: !!question_id },
    ip: req.ip,
  });

  res.json({ ok: true, board_id: id, created_at: now });
});

// ============================================================
// POST /api/class-sessions/:id/board-pushes/:bpId/dismiss-request (student)
// ============================================================
classSessionRouter.post(
  "/:id/board-pushes/:bpId/dismiss-request",
  async (req: Request, res: Response) => {
    const student = await requireRole(req, res, ["student"]);
    if (!student) return;

    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session không tồn tại." });

    const bp = await queryOne<BoardPushRow>(
      `SELECT * FROM class_session_board_pushes
       WHERE id = ? AND class_session_id = ? AND student_id = ?`,
      [req.params.bpId, session.id, student.id]
    );
    if (!bp) return res.status(404).json({ error: "Board push không tồn tại." });
    if (bp.dismissed_at) {
      return res.json({ ok: true, already_dismissed: true });
    }

    const now = nowMysql();
    await query<ResultSetHeader>(
      `UPDATE class_session_board_pushes
       SET dismissed_requested_at = ?
       WHERE id = ?`,
      [now, bp.id]
    );

    // Realtime: GV nhận request
    emitToRoom("/live-help", `class:${session.id}`, "class:board-dismiss-request", {
      board_id: bp.id,
      student_id: student.id,
      student_name: student.name,
      requested_at: now,
    });

    await query<ResultSetHeader>(
      `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
       VALUES (?, ?, 'class_board_dismiss_requested', NULL, ?, ?)`,
      [
        crypto.randomUUID(),
        student.id,
        JSON.stringify({ class_session_id: session.id, board_id: bp.id }),
        now,
      ]
    );

    res.json({ ok: true, requested_at: now });
  }
);

// ============================================================
// POST /api/class-sessions/:id/board-pushes/:bpId/dismiss-approve (teacher)
// ============================================================
classSessionRouter.post(
  "/:id/board-pushes/:bpId/dismiss-approve",
  async (req: Request, res: Response) => {
    const teacher = await requireRole(req, res, ["teacher", "admin"]);
    if (!teacher) return;

    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session không tồn tại." });
    if (teacher.role === "teacher" && session.teacher_id !== teacher.id) {
      return res.status(403).json({ error: "Bạn không phải GV của buổi này." });
    }

    const bp = await queryOne<BoardPushRow>(
      `SELECT * FROM class_session_board_pushes
       WHERE id = ? AND class_session_id = ?`,
      [req.params.bpId, session.id]
    );
    if (!bp) return res.status(404).json({ error: "Board push không tồn tại." });
    if (bp.dismissed_at) {
      return res.json({ ok: true, already_dismissed: true });
    }

    const now = nowMysql();
    await query<ResultSetHeader>(
      `UPDATE class_session_board_pushes
       SET dismissed_at = ?
       WHERE id = ?`,
      [now, bp.id]
    );

    // Realtime: HS clear board
    emitToRoom("/live-help", `class:${session.id}`, "class:board-clear", {
      board_id: bp.id,
      student_id: bp.student_id,
      approved_at: now,
    });

    res.json({ ok: true, dismissed_at: now });
  }
);

// ============================================================
// POST /api/class-sessions/:id/tab-visibility (student)
// REST mirror của socket class:tab-visibility event.
// Body: { event: 'visible' | 'hidden' }
// ============================================================
classSessionRouter.post(
  "/:id/tab-visibility",
  async (req: Request, res: Response) => {
    const student = await requireRole(req, res, ["student"]);
    if (!student) return;

    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session không tồn tại." });

    const { event, visible_ms } = req.body || {};
    if (event !== "visible" && event !== "hidden") {
      return res.status(400).json({ error: 'event phải là "visible" hoặc "hidden".' });
    }

    const now = nowMysql();
    await query<ResultSetHeader>(
      `INSERT INTO class_session_tab_events
         (id, class_session_id, student_id, event, session_visible_ms, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        session.id,
        student.id,
        event,
        typeof visible_ms === "number" ? Math.max(0, Math.floor(visible_ms)) : 0,
        now,
      ]
    );

    // Engagement event
    await query<ResultSetHeader>(
      `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      [
        crypto.randomUUID(),
        student.id,
        event === "visible" ? "class_tab_visible" : "class_tab_hidden",
        JSON.stringify({ class_session_id: session.id }),
        now,
      ]
    );

    // Realtime: GV xem tab state changes
    emitToRoom("/live-help", `class:${session.id}`, "class:tab-state-changed", {
      student_id: student.id,
      student_name: student.name,
      event,
      occurred_at: now,
    });

    res.json({ ok: true });
  }
);

// ============================================================
// GET /api/class-sessions/:id/review (student)
// AI-generated review (set bởi cron Phase 5, fallback null)
// ============================================================
classSessionRouter.get("/:id/review", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "teacher", "admin"]);
  if (!user) return;

  const session = await loadSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session không tồn tại." });

  // Student chỉ xem review của class mình
  if (user.role === "student") {
    if (!(await ensureStudentInClass(user.id, session.class_id))) {
      return res.status(403).json({ error: "Bạn không ở trong lớp này." });
    }
  } else if (user.role === "teacher" && session.teacher_id !== user.id) {
    return res.status(403).json({ error: "Bạn không phải GV của buổi này." });
  }

  const review = await loadReviewForSession(session.id);
  res.json({ review, session_id: session.id });
});
