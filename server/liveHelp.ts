/**
 * server/liveHelp.ts — Live Help T3 (Cấp 1: Text hint)
 *
 * Routes (mounted at /api/live/help):
 *   POST /request                  — Student tạo session (trigger='student_request')
 *   POST /teacher-proactive        — Teacher tạo session cho 1 HS (trigger='teacher_proactive')
 *   POST /:id/hint                 — Gửi text hint (cả HS + GV, push vào Inbox cho HS)
 *   POST /:id/end                  — Kết thúc session (HS bấm "Tôi hiểu rồi" hoặc GV rời)
 *   GET  /queue                    — Teacher: list pending + active sessions mình phụ trách
 *   GET  /mine                     — Student: list session của mình (pending + active + recent ended)
 *   GET  /:id/messages             — Hint log của 1 session
 *
 * Auth: cả student và teacher đều có thể gửi hint / end. Mỗi endpoint verify role +
 *       ownership (student chỉ truy cập session của mình, teacher chỉ của mình).
 *
 * Auto-teacher assignment:
 *   Khi HS request → tìm GV của lớp HS đang học (lớp cũ nhất trước).
 *   Nếu HS không trong lớp nào → 400.
 *
 * Inbox fallback:
 *   Mỗi hint từ GV → push vào Inbox (sendDirectMessage) để HS nhận notification
 *   kể cả khi không mở LiveHelpModal.
 *
 * Audit (PII-safe):
 *   - live_help.request         → details: { session_id, assignment_id }
 *   - live_help.teacher_proactive → details: { session_id, student_id }
 *   - live_help.hint            → details: { session_id, message_length }  (KHÔNG log raw body)
 *   - live_help.end             → details: { session_id, outcome, ended_by }
 *
 * Slice B (Socket.io + Highlight) sẽ reuse `live_help_sessions` + `live_help_highlights`.
 * Slice C (Voice + WebRTC) sẽ thêm signaling events, không cần schema mới.
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import {
  query,
  queryOne,
  RowDataPacket,
  ResultSetHeader,
} from "../db/client";
import { requireRole, AuthUser } from "./auth";
import { logAudit } from "./audit";
import { sendDirectMessage } from "./messaging";
import { emitToRoom } from "./socket";

export const liveHelpRouter = Router();

// ============================================================
// Helpers
// ============================================================

interface SessionRow extends RowDataPacket {
  id: string;
  class_id: string | null;
  student_id: string;
  teacher_id: string;
  assignment_id: string | null;
  trigger: "student_request" | "teacher_proactive";
  level: "text" | "voice" | "highlight" | "mixed";
  status: "pending" | "active" | "ended";
  started_at: string | null;
  ended_at: string | null;
  outcome: "understood" | "gave_up" | "timeout" | "teacher_left" | null;
  created_at: string;
}

interface SessionWithNamesRow extends SessionRow {
  student_name: string;
  student_username: string;
  teacher_name: string;
  teacher_username: string;
  class_name: string | null;
}

interface HintRow extends RowDataPacket {
  id: string;
  session_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender_name: string;
  sender_role: "student" | "parent" | "teacher" | "admin";
}

/**
 * Verify user là student hoặc teacher của session. Trả user nếu OK, null nếu 403.
 */
async function verifySessionAccess(
  sessionId: string,
  user: AuthUser
): Promise<{ session: SessionRow; ok: true } | { ok: false; status: number; error: string }> {
  const session = await queryOne<SessionRow>(
    `SELECT * FROM live_help_sessions WHERE id = ?`,
    [sessionId]
  );
  if (!session) return { ok: false, status: 404, error: "Session không tồn tại." };

  if (user.role === "student" && session.student_id !== user.id) {
    return { ok: false, status: 403, error: "Bạn không phải HS của session này." };
  }
  if (user.role === "teacher" && session.teacher_id !== user.id) {
    return { ok: false, status: 403, error: "Bạn không phải GV phụ trách session này." };
  }
  if (user.role !== "student" && user.role !== "teacher") {
    return { ok: false, status: 403, error: "Role không được phép." };
  }
  return { session, ok: true };
}

/**
 * Auto-assign teacher = GV của lớp HS đang học (lớp cũ nhất trước).
 * Trả null nếu HS không trong lớp nào.
 */
async function autoAssignTeacher(studentId: string): Promise<string | null> {
  const row = await queryOne<RowDataPacket & { teacher_id: string | null }>(
    `SELECT c.teacher_id
     FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     WHERE cm.student_id = ? AND c.deleted_at IS NULL AND c.teacher_id IS NOT NULL
     ORDER BY cm.joined_at ASC
     LIMIT 1`,
    [studentId]
  );
  return row?.teacher_id ?? null;
}

/**
 * Format session row thành response shape (có names).
 */
async function listWithNames(sessions: SessionRow[]): Promise<SessionWithNamesRow[]> {
  if (sessions.length === 0) return [];
  const ids = Array.from(new Set(sessions.flatMap((s) => [s.student_id, s.teacher_id])));
  const classIds = Array.from(new Set(sessions.map((s) => s.class_id).filter(Boolean) as string[]));

  const placeholders = ids.map(() => "?").join(",");
  const users = await query<RowDataPacket[]>(
    `SELECT id, name, username, role FROM users WHERE id IN (${placeholders})`,
    ids
  );
  const userMap = new Map(users.map((u: any) => [u.id, u]));

  let classMap = new Map<string, string>();
  if (classIds.length > 0) {
    const cp = classIds.map(() => "?").join(",");
    const classes = await query<RowDataPacket[]>(
      `SELECT id, name FROM classes WHERE id IN (${cp})`,
      classIds
    );
    classMap = new Map(classes.map((c: any) => [c.id, c.name]));
  }

  return sessions.map((s) => ({
    ...s,
    student_name: (userMap.get(s.student_id) as any)?.name ?? "",
    student_username: (userMap.get(s.student_id) as any)?.username ?? "",
    teacher_name: (userMap.get(s.teacher_id) as any)?.name ?? "",
    teacher_username: (userMap.get(s.teacher_id) as any)?.username ?? "",
    class_name: s.class_id ? classMap.get(s.class_id) ?? null : null,
  }));
}

// ============================================================
// Routes
// ============================================================

/**
 * POST /api/live/help/request
 * Body: { assignment_id?: string, message?: string }
 * Student tạo session. Auto-assign teacher. Status = 'pending'.
 * Nếu HS đã có session pending/active → 409.
 */
liveHelpRouter.post("/request", async (req: Request, res: Response) => {
  const student = await requireRole(req, res, ["student"]);
  if (!student) return;

  const teacherId = await autoAssignTeacher(student.id);
  if (!teacherId) {
    return res.status(400).json({
      error: "Em chưa được xếp lớp — không có GV để hỗ trợ.",
    });
  }

  // Check existing pending/active session (idempotent duplicate guard)
  const existing = await queryOne<SessionRow>(
    `SELECT * FROM live_help_sessions
     WHERE student_id = ? AND status IN ('pending','active')
     ORDER BY created_at DESC LIMIT 1`,
    [student.id]
  );
  if (existing) {
    return res.status(409).json({
      error: "Em đã có yêu cầu hỗ trợ đang chờ. Vui lòng đợi GV phản hồi.",
      session_id: existing.id,
    });
  }

  const { assignment_id, message } = req.body || {};
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  await query<ResultSetHeader>(
    `INSERT INTO live_help_sessions
       (id, student_id, teacher_id, assignment_id, trigger, level, status, created_at)
     VALUES (?, ?, ?, ?, 'student_request', 'text', 'pending', ?)`,
    [sessionId, student.id, teacherId, assignment_id ?? null, now]
  );

  // Nếu HS có message kèm theo → tạo hint đầu tiên luôn
  if (message && String(message).trim()) {
    const hintId = crypto.randomUUID();
    await query<ResultSetHeader>(
      `INSERT INTO live_help_hints (id, session_id, sender_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [hintId, sessionId, student.id, String(message).trim(), now]
    );
  }

  // Push notification cho GV (inbox)
  const previewMsg = message && String(message).trim()
    ? `: "${String(message).trim().slice(0, 100)}"`
    : "";
  await sendDirectMessage(
    student.id,
    teacherId,
    `🆘 ${student.name} cần hỗ trợ${previewMsg}`
  ).catch((err) => {
    // Inbox failure không block session creation
    console.warn("[liveHelp] inbox notify failed:", err?.message);
  });

  await logAudit({
    actorId: student.id,
    action: "live_help.request",
    targetType: "live_help_session",
    targetId: sessionId,
    details: { assignment_id: assignment_id ?? null, has_message: !!message },
    ip: req.ip,
  });

  res.json({ ok: true, session_id: sessionId });
});

/**
 * POST /api/live/help/teacher-proactive
 * Body: { student_id: string, message?: string }
 * Teacher chủ động vào hỏi 1 HS. Status = 'active' luôn.
 * Verify teacher phụ trách lớp có HS này (hoặc admin bypass).
 */
liveHelpRouter.post("/teacher-proactive", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const { student_id, message } = req.body || {};
  if (!student_id) {
    return res.status(400).json({ error: "Thiếu student_id." });
  }

  // Verify HS tồn tại + active
  const studentRow = await queryOne<RowDataPacket & { id: string; role: string }>(
    `SELECT id, role FROM users WHERE id = ? AND role = 'student' AND deleted_at IS NULL`,
    [student_id]
  );
  if (!studentRow) {
    return res.status(404).json({ error: "HS không tồn tại." });
  }

  // Nếu teacher (không phải admin) → verify HS ở trong lớp mình dạy
  if (teacher.role === "teacher") {
    const inClass = await queryOne<RowDataPacket>(
      `SELECT 1 FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       WHERE cm.student_id = ? AND c.teacher_id = ? AND c.deleted_at IS NULL
       LIMIT 1`,
      [student_id, teacher.id]
    );
    if (!inClass) {
      return res.status(403).json({
        error: "HS này không ở trong lớp bạn dạy.",
      });
    }
  }

  // Check existing pending/active session của HS
  const existing = await queryOne<SessionRow>(
    `SELECT * FROM live_help_sessions
     WHERE student_id = ? AND status IN ('pending','active')
     ORDER BY created_at DESC LIMIT 1`,
    [student_id]
  );
  if (existing) {
    return res.status(409).json({
      error: "HS này đang có session khác. Kết thúc trước khi tạo mới.",
      session_id: existing.id,
    });
  }

  // Lấy class_id (lớp đầu tiên mà HS học với GV này)
  const classRow = await queryOne<RowDataPacket & { class_id: string }>(
    `SELECT cm.class_id FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     WHERE cm.student_id = ? AND c.teacher_id = ? AND c.deleted_at IS NULL
     ORDER BY cm.joined_at ASC LIMIT 1`,
    [student_id, teacher.id]
  );

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  await query<ResultSetHeader>(
    `INSERT INTO live_help_sessions
       (id, class_id, student_id, teacher_id, trigger, level, status, started_at, created_at)
     VALUES (?, ?, ?, ?, 'teacher_proactive', 'text', 'active', ?, ?)`,
    [sessionId, classRow?.class_id ?? null, student_id, teacher.id, now, now]
  );

  // Optional message
  if (message && String(message).trim()) {
    const hintId = crypto.randomUUID();
    await query<ResultSetHeader>(
      `INSERT INTO live_help_hints (id, session_id, sender_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [hintId, sessionId, teacher.id, String(message).trim(), now]
    );
  }

  // Push notification cho HS
  await sendDirectMessage(
    teacher.id,
    student_id,
    `🆘 GV ${teacher.name} muốn hỏi thăm em — vào xem nhé!`
  ).catch((err) => {
    console.warn("[liveHelp] inbox notify failed:", err?.message);
  });

  await logAudit({
    actorId: teacher.id,
    action: "live_help.teacher_proactive",
    targetType: "live_help_session",
    targetId: sessionId,
    details: { student_id },
    ip: req.ip,
  });

  res.json({ ok: true, session_id: sessionId });
});

/**
 * POST /api/live/help/:id/hint
 * Body: { message: string }
 * Cả HS và GV đều gửi được. Persist + push Inbox cho đầu bên kia (nếu GV gửi).
 * Auto-set status: pending → active + set started_at nếu là hint đầu tiên.
 */
liveHelpRouter.post("/:id/hint", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "teacher"]);
  if (!user) return;

  const message = String(req.body?.message ?? "").trim();
  if (!message) {
    return res.status(400).json({ error: "Tin nhắn trống." });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: "Tin nhắn quá dài (tối đa 2000 ký tự)." });
  }

  const access = await verifySessionAccess(req.params.id, user);
  if (access.ok === false) {
    return res.status(access.status).json({ error: access.error });
  }
  const session = access.session;

  if (session.status === "ended") {
    return res.status(409).json({ error: "Session đã kết thúc — không thể gửi thêm." });
  }

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const hintId = crypto.randomUUID();

  await query<ResultSetHeader>(
    `INSERT INTO live_help_hints (id, session_id, sender_id, message, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [hintId, session.id, user.id, message, now]
  );

  // Nếu là hint đầu tiên → activate session
  if (session.status === "pending") {
    await query<ResultSetHeader>(
      `UPDATE live_help_sessions SET status = 'active', started_at = ? WHERE id = ?`,
      [now, session.id]
    );
  }

  // Push Inbox cho đầu bên kia (luôn — giúp HS nhận hint kể cả khi không mở modal)
  const recipientId = user.role === "teacher" ? session.student_id : session.teacher_id;
  const prefix = user.role === "teacher" ? "💡 GV" : "✋";
  await sendDirectMessage(
    user.id,
    recipientId,
    `${prefix} ${user.name}: ${message.slice(0, 100)}`
  ).catch((err) => {
    console.warn("[liveHelp] inbox notify failed:", err?.message);
  });

  await logAudit({
    actorId: user.id,
    action: "live_help.hint",
    targetType: "live_help_session",
    targetId: session.id,
    details: { message_length: message.length, sender_role: user.role },
    ip: req.ip,
  });

  // Realtime: broadcast hint tới socket room (HS/teacher nhận ngay, không đợi poll 3s)
  emitToRoom("/live-help", `session:${session.id}`, "hint:new", {
    id: hintId,
    session_id: session.id,
    sender_id: user.id,
    sender_name: user.name,
    sender_role: user.role,
    message,
    created_at: now,
  });

  res.json({ ok: true, hint_id: hintId });
});

/**
 * POST /api/live/help/:id/end
 * Body: { outcome?: 'understood' | 'gave_up' | 'timeout' | 'teacher_left' }
 * Cả HS và GV đều end được.
 */
liveHelpRouter.post("/:id/end", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "teacher"]);
  if (!user) return;

  const access = await verifySessionAccess(req.params.id, user);
  if (access.ok === false) {
    return res.status(access.status).json({ error: access.error });
  }
  const session = access.session;

  if (session.status === "ended") {
    return res.json({ ok: true, already_ended: true });
  }

  // Default outcome: HS end → 'understood', GV end → 'teacher_left'
  let outcome = req.body?.outcome as string | undefined;
  if (!outcome) {
    outcome = user.role === "student" ? "understood" : "teacher_left";
  }
  const allowed = ["understood", "gave_up", "timeout", "teacher_left"];
  if (!allowed.includes(outcome)) {
    return res.status(400).json({ error: `Outcome không hợp lệ: ${outcome}` });
  }

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  await query<ResultSetHeader>(
    `UPDATE live_help_sessions SET status = 'ended', ended_at = ?, outcome = ? WHERE id = ?`,
    [now, outcome, session.id]
  );

  // Push Inbox cho đầu bên kia
  const recipientId = user.role === "teacher" ? session.student_id : session.teacher_id;
  const outcomeVi: Record<string, string> = {
    understood: "đã hiểu bài",
    gave_up: "tạm dừng",
    timeout: "hết giờ",
    teacher_left: "GV đã rời",
  };
  await sendDirectMessage(
    user.id,
    recipientId,
    `✓ Phiên hỗ trợ kết thúc — ${outcomeVi[outcome] || outcome}`
  ).catch((err) => {
    console.warn("[liveHelp] inbox notify failed:", err?.message);
  });

  await logAudit({
    actorId: user.id,
    action: "live_help.end",
    targetType: "live_help_session",
    targetId: session.id,
    details: { outcome, ended_by_role: user.role },
    ip: req.ip,
  });

  // Realtime: broadcast session end → clients tự đóng UI (không đợi poll 3s)
  emitToRoom("/live-help", `session:${session.id}`, "session:ended", {
    session_id: session.id,
    outcome,
    ended_by_role: user.role,
  });

  res.json({ ok: true });
});

/**
 * GET /api/live/help/queue
 * Teacher: list pending + active sessions mình phụ trách.
 * Admin dùng audit_log để oversight — không expose queue ở Slice A.
 */
liveHelpRouter.get("/queue", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher"]);
  if (!teacher) return;

  const rows = await query<SessionRow[]>(
    `SELECT * FROM live_help_sessions
     WHERE teacher_id = ? AND status IN ('pending','active')
     ORDER BY
       CASE status WHEN 'pending' THEN 0 ELSE 1 END,
       created_at ASC`,
    [teacher.id]
  );

  const sessions = await listWithNames(rows);
  res.json({ sessions, count: sessions.length });
});

/**
 * GET /api/live/help/mine
 * Student: list session của mình (pending + active + recent ended 24h).
 */
liveHelpRouter.get("/mine", async (req: Request, res: Response) => {
  const student = await requireRole(req, res, ["student"]);
  if (!student) return;

  const rows = await query<SessionRow[]>(
    `SELECT * FROM live_help_sessions
     WHERE student_id = ?
       AND (
         status IN ('pending','active')
         OR (status = 'ended' AND ended_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR))
       )
     ORDER BY created_at DESC
     LIMIT 20`,
    [student.id]
  );

  const sessions = await listWithNames(rows);
  res.json({ sessions, count: sessions.length });
});

/**
 * GET /api/live/help/:id/messages
 * Hint log của 1 session. Cả HS và GV của session đều xem được.
 */
liveHelpRouter.get("/:id/messages", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["student", "teacher"]);
  if (!user) return;

  const access = await verifySessionAccess(req.params.id, user);
  if (access.ok === false) {
    return res.status(access.status).json({ error: access.error });
  }

  const messages = await query<HintRow[]>(
    `SELECT h.id, h.session_id, h.sender_id, h.message, h.created_at,
            u.name AS sender_name, u.role AS sender_role
     FROM live_help_hints h
     JOIN users u ON u.id = h.sender_id
     WHERE h.session_id = ?
     ORDER BY h.created_at ASC`,
    [req.params.id]
  );

  res.json({ messages, count: messages.length });
});

/**
 * POST /api/live/help/:id/highlight
 * Teacher tạo 1 highlight cho HS trong session.
 * Body: { selector: string, note?: string|null, color?: string }
 * Persists to live_help_highlights + emit `highlight:show` cho HS.
 *
 * Slice B: thay thế highlight qua socket — REST để persist reliably.
 */
liveHelpRouter.post("/:id/highlight", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher"]);
  if (!teacher) return;

  const access = await verifySessionAccess(req.params.id, teacher);
  if (access.ok === false) {
    return res.status(access.status).json({ error: access.error });
  }

  const { selector, note, color } = req.body ?? {};
  if (typeof selector !== "string" || selector.trim().length === 0) {
    return res.status(400).json({ error: "selector là bắt buộc." });
  }
  if (selector.length > 255) {
    return res.status(400).json({ error: "selector tối đa 255 ký tự." });
  }
  const safeColor = typeof color === "string" && color.length > 0 && color.length <= 16
    ? color
    : "yellow";
  const safeNote = typeof note === "string" && note.trim().length > 0
    ? note.trim().slice(0, 500)
    : null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  await query<ResultSetHeader>(
    `INSERT INTO live_help_highlights
       (id, session_id, teacher_id, selector, color, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, teacher.id, selector.trim(), safeColor, safeNote, now]
  );

  const eventPayload = {
    id,
    session_id: req.params.id,
    teacher_id: teacher.id,
    selector: selector.trim(),
    color: safeColor,
    note: safeNote,
    created_at: new Date().toISOString(),
  };

  // Realtime: broadcast highlight cho HS
  emitToRoom("/live-help", `session:${req.params.id}`, "highlight:show", eventPayload);

  await logAudit({
    actorId: teacher.id,
    action: "live_help.highlight",
    targetType: "live_help_session",
    targetId: req.params.id,
    details: { highlight_id: id, selector_length: selector.length, has_note: safeNote !== null },
    ip: req.ip,
  });

  res.json({ ok: true, highlight: eventPayload });
});

/**
 * POST /api/live/help/:id/highlight/clear
 * Teacher xoá highlight hiện tại trong session.
 * Emit `highlight:clear` cho HS.
 */
liveHelpRouter.post("/:id/highlight/clear", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher"]);
  if (!teacher) return;

  const access = await verifySessionAccess(req.params.id, teacher);
  if (access.ok === false) {
    return res.status(access.status).json({ error: access.error });
  }

  emitToRoom("/live-help", `session:${req.params.id}`, "highlight:clear", {
    session_id: req.params.id,
  });

  res.json({ ok: true });
});