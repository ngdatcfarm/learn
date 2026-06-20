/**
 * server/debug.ts — Admin-only debug endpoints for Live Help testing
 *
 * Mount: /api/debug (in server.ts)
 * Auth: requireRole(["admin"]) — debug endpoints chỉ admin truy cập
 *
 * Endpoints:
 *   GET  /api/debug/live-help/sessions
 *     → List live_help_sessions (filter: ?status=&trigger=&limit=)
 *   POST /api/debug/live-help/sessions/:id/end
 *     → Force end session (UPDATE status='ended', ended_at=NOW(), outcome='teacher_left')
 *   GET  /api/debug/live-help/whiteboards
 *     → List live_help_whiteboards (filter: ?session_id=&question_id=&limit=)
 *   GET  /api/debug/engagement/events?user_id=&limit=
 *     → List recent engagement_events cho 1 user
 *   POST /api/debug/engagement/inject
 *     → Body: { user_id, event, value?, minutes_ago? }
 *     → INSERT engagement_event với occurred_at = NOW() - INTERVAL minutes_ago MINUTE
 *     → Dùng để test status logic (offline → idle → doing_today)
 *   POST /api/debug/observe/force-create
 *     → Body: { student_id, teacher_id }
 *     → INSERT live_help_session trigger='teacher_observe' (force, bypass lock)
 *     → Dùng để test currently_observed_by badge UI
 *
 * Audit: Tất cả mutations log `debug.<action>` vào audit_log.
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { query, queryOne, RowDataPacket, ResultSetHeader } from "../db/client";
import { requireRole } from "./auth";
import { logAudit } from "./audit";
import {
  LIVE_HELP_STATUSES,
  LIVE_HELP_TRIGGERS,
  VALID_ENGAGEMENT_EVENTS,
  type LiveHelpStatus,
  type LiveHelpTrigger,
  type EngagementEvent,
} from "./constants";

export const debugRouter = Router();

/**
 * Parse `?limit=N` query param với default + cap. Negative/zero → default.
 */
function parseLimit(raw: unknown, def: number, max: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

// ============================================================
// Live Help Sessions
// ============================================================

interface SessionDebugRow extends RowDataPacket {
  id: string;
  student_id: string;
  teacher_id: string;
  trigger: string;
  level: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  student_name: string;
  student_username: string;
  teacher_name: string;
}

/**
 * GET /api/debug/live-help/sessions
 *
 * Query params:
 *   - status: pending|active|ended (optional)
 *   - trigger: student_request|teacher_proactive|teacher_observe (optional)
 *   - limit: max rows (default 50, max 200)
 */
debugRouter.get("/live-help/sessions", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const statusRaw = req.query.status as string | undefined;
  const triggerRaw = req.query.trigger as string | undefined;
  // Reject unknown enum values early — returns empty result instead of obscure SQL
  const status =
    statusRaw && (LIVE_HELP_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as LiveHelpStatus)
      : undefined;
  const trigger =
    triggerRaw && (LIVE_HELP_TRIGGERS as readonly string[]).includes(triggerRaw)
      ? (triggerRaw as LiveHelpTrigger)
      : undefined;
  const limit = parseLimit(req.query.limit, 50, 200);

  const filters: string[] = [];
  const params: any[] = [];
  if (status) {
    filters.push("s.status = ?");
    params.push(status);
  }
  if (trigger) {
    filters.push("s.`trigger` = ?");
    params.push(trigger);
  }
  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

  const rows = await query<SessionDebugRow[]>(
    `SELECT s.id, s.student_id, s.teacher_id, s.\`trigger\`, s.level, s.status,
            s.started_at, s.ended_at, s.outcome,
            st.name AS student_name, st.username AS student_username,
            t.name AS teacher_name
     FROM live_help_sessions s
     JOIN users st ON st.id = s.student_id
     JOIN users t ON t.id = s.teacher_id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT ${limit}`,
    params
  );

  res.json({
    count: rows.length,
    sessions: rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: r.student_name,
      student_username: r.student_username,
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name,
      trigger: r.trigger,
      level: r.level,
      status: r.status,
      started_at: r.started_at,
      ended_at: r.ended_at,
      outcome: r.outcome,
      duration_sec: r.ended_at
        ? Math.round(
            (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000
          )
        : null,
    })),
  });
});

/**
 * POST /api/debug/live-help/sessions/:id/end
 *
 * Force end a session (sets status='ended', ended_at=NOW(), outcome='teacher_left').
 * Dùng để test cleanup sau khi lock semantics fire.
 */
debugRouter.post(
  "/live-help/sessions/:id/end",
  async (req: Request, res: Response) => {
    const admin = await requireRole(req, res, ["admin"]);
    if (!admin) return;

    const sessionId = req.params.id;
    const session = await queryOne<RowDataPacket & { student_id: string }>(
      `SELECT student_id, status FROM live_help_sessions WHERE id = ?`,
      [sessionId]
    );
    if (!session) {
      return res.status(404).json({ error: "Session không tồn tại." });
    }

    await query<ResultSetHeader>(
      `UPDATE live_help_sessions
       SET status = 'ended', ended_at = NOW(), outcome = 'teacher_left'
       WHERE id = ?`,
      [sessionId]
    );

    await logAudit({
      actorId: admin.id,
      action: "debug.session.force_end",
      targetType: "live_help_session",
      targetId: sessionId,
      details: { previous_status: session.status },
      ip: req.ip,
    });

    res.json({ ok: true, session_id: sessionId });
  }
);

// ============================================================
// Whiteboards
// ============================================================

interface WhiteboardDebugRow extends RowDataPacket {
  id: string;
  live_help_session_id: string;
  question_id: string;
  teacher_id: string;
  created_at: string;
  updated_at: string;
  teacher_name: string;
  stroke_count: number;
  strokes_bytes: number;
}

/**
 * GET /api/debug/live-help/whiteboards
 *
 * List saved whiteboards (với stroke count + storage bytes từ JSON, KHÔNG load BLOB).
 */
debugRouter.get("/live-help/whiteboards", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const sessionId = req.query.session_id as string | undefined;
  const questionId = req.query.question_id as string | undefined;
  const limit = parseLimit(req.query.limit, 50, 200);

  const filters: string[] = [];
  const params: any[] = [];
  if (sessionId) {
    filters.push("w.live_help_session_id = ?");
    params.push(sessionId);
  }
  if (questionId) {
    filters.push("w.question_id = ?");
    params.push(questionId);
  }
  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

  const rows = await query<WhiteboardDebugRow[]>(
    `SELECT w.id, w.live_help_session_id, w.question_id, w.teacher_id,
            w.created_at, w.updated_at,
            u.name AS teacher_name,
            JSON_LENGTH(w.strokes_json) AS stroke_count,
            OCTET_LENGTH(w.strokes_json) AS strokes_bytes
     FROM live_help_whiteboards w
     JOIN users u ON u.id = w.teacher_id
     ${where}
     ORDER BY w.updated_at DESC
     LIMIT ${limit}`,
    params
  );

  res.json({
    count: rows.length,
    whiteboards: rows.map((r) => ({
      id: r.id,
      session_id: r.live_help_session_id,
      question_id: r.question_id,
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name,
      stroke_count: r.stroke_count,
      bytes: r.strokes_bytes,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  });
});

// ============================================================
// Engagement events (test status logic)
// ============================================================

interface EngagementEventRow extends RowDataPacket {
  id: string;
  user_id: string;
  event: string;
  value: number | null;
  occurred_at: string;
  user_name: string;
}

/**
 * GET /api/debug/engagement/events?user_id=&limit=
 *
 * List recent engagement_events cho 1 user (debug + UI dropdown).
 */
debugRouter.get("/engagement/events", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const userId = req.query.user_id as string | undefined;
  const limit = parseLimit(req.query.limit, 50, 500);

  const where = userId ? "WHERE ee.user_id = ?" : "";
  const params = userId ? [userId] : [];

  const rows = await query<EngagementEventRow[]>(
    `SELECT ee.*, u.name AS user_name
     FROM engagement_events ee
     JOIN users u ON u.id = ee.user_id
     ${where}
     ORDER BY ee.occurred_at DESC
     LIMIT ${limit}`,
    params
  );

  res.json({
    count: rows.length,
    events: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name,
      event: r.event,
      value: r.value,
      occurred_at: r.occurred_at,
      minutes_ago: Math.round((Date.now() - new Date(r.occurred_at).getTime()) / 60000),
    })),
  });
});

/**
 * POST /api/debug/engagement/inject
 *
 * Body: { user_id: string, event: string, value?: number, minutes_ago?: number }
 *
 * INSERT engagement_event với occurred_at = NOW() - INTERVAL minutes_ago MINUTE.
 * Dùng để flip status của HS:
 *   - minutes_ago = 0  → doing_today
 *   - minutes_ago = 10 → idle
 *   - minutes_ago = 60 → offline
 */
debugRouter.post("/engagement/inject", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const { user_id, event, value, minutes_ago } = req.body || {};
  if (!user_id || !event) {
    return res.status(400).json({ error: "user_id + event là bắt buộc." });
  }

  if (!(VALID_ENGAGEMENT_EVENTS as readonly string[]).includes(event)) {
    return res
      .status(400)
      .json({ error: `event phải là 1 trong: ${VALID_ENGAGEMENT_EVENTS.join(", ")}` });
  }

  const ago = parseInt(String(minutes_ago ?? 0), 10);
  if (isNaN(ago) || ago < 0) {
    return res.status(400).json({ error: "minutes_ago phải là số ≥ 0." });
  }

  const eventId = crypto.randomUUID();
  const valNum = value == null ? null : Number(value);

  // Compute occurred_at bằng cách convert sang MySQL DATETIME format
  const occurredAt = new Date(Date.now() - ago * 60000);
  const occurredAtSql = occurredAt.toISOString().slice(0, 19).replace("T", " ");

  await query<ResultSetHeader>(
    `INSERT INTO engagement_events (id, user_id, event, value, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
    [eventId, user_id, event, valNum, occurredAtSql]
  );

  await logAudit({
    actorId: admin.id,
    action: "debug.engagement.inject",
    targetType: "engagement_event",
    targetId: eventId,
    details: { user_id, event, value: valNum, minutes_ago: ago },
    ip: req.ip,
  });

  res.json({
    ok: true,
    event_id: eventId,
    user_id,
    event,
    value: valNum,
    minutes_ago: ago,
    occurred_at: occurredAtSql,
  });
});

// ============================================================
// Force-create observe session (test currently_observed_by lock UI)
// ============================================================

/**
 * POST /api/debug/observe/force-create
 *
 * Body: { student_id: string, teacher_id: string }
 *
 * INSERT live_help_session với trigger='teacher_observe', status='active'.
 * Bypass lock semantics (mục đích test UI — xem badge "GV đang xem" hiện ra).
 */
debugRouter.post("/observe/force-create", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const { student_id, teacher_id } = req.body || {};
  if (!student_id || !teacher_id) {
    return res.status(400).json({ error: "student_id + teacher_id là bắt buộc." });
  }

  // Verify users exist + đúng role (parallel — independent lookups)
  const [student, teacher] = await Promise.all([
    queryOne<RowDataPacket & { role: string; name: string }>(
      `SELECT role, name FROM users WHERE id = ? AND deleted_at IS NULL`,
      [student_id]
    ),
    queryOne<RowDataPacket & { role: string; name: string }>(
      `SELECT role, name FROM users WHERE id = ? AND deleted_at IS NULL`,
      [teacher_id]
    ),
  ]);
  if (!student || student.role !== "student") {
    return res.status(404).json({ error: "student_id không hợp lệ." });
  }
  if (!teacher || teacher.role !== "teacher") {
    return res.status(404).json({ error: "teacher_id không hợp lệ." });
  }

  // Trigger 'teacher_observe' bypass lock semantics ở /api/live/help/teacher-proactive
  // (xem server/liveHelp.ts) — debug-only để test UI badge "GV đang xem".

  const sessionId = crypto.randomUUID();
  await query<ResultSetHeader>(
    `INSERT INTO live_help_sessions
       (id, student_id, teacher_id, \`trigger\`, level, status, started_at, created_at)
     VALUES (?, ?, ?, 'teacher_observe', 'mixed', 'active', NOW(), NOW())`,
    [sessionId, student_id, teacher_id]
  );

  await logAudit({
    actorId: admin.id,
    action: "debug.observe.force_create",
    targetType: "live_help_session",
    targetId: sessionId,
    details: { student_id, teacher_id },
    ip: req.ip,
  });

  res.json({
    ok: true,
    session_id: sessionId,
    student_id,
    teacher_id,
    student_name: student.name,
    teacher_name: teacher.name,
  });
});
