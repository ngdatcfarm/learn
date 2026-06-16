/**
 * server/admin.ts — Admin-only API (Step 6)
 *
 * Tất cả routes yêu cầu role="admin". Mọi mutation đều log audit_log.
 *
 * Routes:
 *   GET    /api/admin/overview
 *   GET    /api/admin/users
 *   GET    /api/admin/users/:id
 *   POST   /api/admin/users
 *   PATCH  /api/admin/users/:id
 *   DELETE /api/admin/users/:id              (soft-delete)
 *   POST   /api/admin/users/:id/restore
 *   POST   /api/admin/users/:id/reset-password
 *   GET    /api/admin/classes
 *   POST   /api/admin/classes
 *   PATCH  /api/admin/classes/:id
 *   DELETE /api/admin/classes/:id
 *   GET    /api/admin/classes/:id/members
 *   POST   /api/admin/classes/:id/members
 *   DELETE /api/admin/classes/:id/members/:studentId
 *   GET    /api/admin/settings/zalo
 *   PATCH  /api/admin/settings/zalo
 *   POST   /api/admin/settings/zalo/test
 *   GET    /api/admin/audit
 *   GET    /api/admin/cron-runs
 *   GET    /api/admin/audio
 *   POST   /api/admin/parent-links
 *   DELETE /api/admin/parent-links/:parentId/:studentId
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { query, queryOne, withTransaction, RowDataPacket, ResultSetHeader } from "../db/client";
import { requireRole, AuthUser } from "./auth";
import { logAudit } from "./audit";
import { hashPassword, generateTempPassword } from "./passwords";
import { sendZaloMessage } from "./zalo";

export const adminRouter = Router();

// ============================================================
// OVERVIEW
// ============================================================

adminRouter.get("/overview", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const [students, teachers, parents, admins, classCount, needsHelp, audits, cronRuns] =
    await Promise.all([
      queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(*) AS c FROM users WHERE role='student' AND deleted_at IS NULL`
      ),
      queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(*) AS c FROM users WHERE role='teacher' AND deleted_at IS NULL`
      ),
      queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(*) AS c FROM users WHERE role='parent' AND deleted_at IS NULL`
      ),
      queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(*) AS c FROM users WHERE role='admin' AND deleted_at IS NULL`
      ),
      queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(*) AS c FROM classes`
      ),
      // needs_help_count: HS có submissions với needs_help=1 trong 7 ngày gần nhất
      queryOne<RowDataPacket & { c: number }>(
        `SELECT COUNT(DISTINCT user_id) AS c FROM submissions
         WHERE needs_help = 1
           AND created_at >= CURDATE() - INTERVAL 7 DAY`
      ),
      query<RowDataPacket[]>(
        `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.details_json,
                a.created_at, u.name AS actor_name, u.username AS actor_username
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         ORDER BY a.created_at DESC LIMIT 10`
      ),
      query<RowDataPacket[]>(
        `SELECT * FROM cron_job_runs ORDER BY started_at DESC LIMIT 10`
      ),
    ]);

  res.json({
    userCounts: {
      student: students?.c ?? 0,
      teacher: teachers?.c ?? 0,
      parent: parents?.c ?? 0,
      admin: admins?.c ?? 0,
    },
    classCount: classCount?.c ?? 0,
    needsHelpCount: needsHelp?.c ?? 0,
    recentAudits: audits,
    recentCronRuns: cronRuns,
  });
});

// ============================================================
// USERS
// ============================================================

interface UserListRow extends RowDataPacket {
  id: string;
  username: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  daily_goal_minutes: number | null;
  created_at: string;
  last_login_at: string | null;
  deleted_at: string | null;
}

adminRouter.get("/users", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const role = (req.query.role as string) || "";
  const search = (req.query.search as string) || "";
  const showDeleted = req.query.deleted === "1" || req.query.deleted === "true";
  const parentless = req.query.parentless === "1" || req.query.parentless === "true";

  const conditions: string[] = [];
  const params: any[] = [];
  if (!showDeleted) conditions.push("u.deleted_at IS NULL");
  if (role && ["student", "parent", "teacher", "admin"].includes(role)) {
    conditions.push("u.role = ?");
    params.push(role);
  }
  if (search) {
    conditions.push("(u.username LIKE ? OR u.name LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (parentless) {
    conditions.push("u.id NOT IN (SELECT student_id FROM parent_links)");
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = (await query<UserListRow[]>(
    `SELECT u.id, u.username, u.name, u.role, u.level, u.cefr_level,
            u.goal, u.daily_goal_minutes, u.created_at, u.last_login_at, u.deleted_at
     FROM users u
     ${where}
     ORDER BY u.role, u.name
     LIMIT 200`,
    params
  )) as UserListRow[];

  res.json({ users: rows });
});

adminRouter.get("/users/:id", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const id = req.params.id;
  const user = await queryOne<UserListRow>(
    `SELECT id, username, name, role, level, cefr_level, goal, daily_goal_minutes,
            created_at, last_login_at, deleted_at
     FROM users WHERE id = ?`,
    [id]
  );
  if (!user) return res.status(404).json({ error: "Người dùng không tồn tại." });

  // Classes (nếu là student) hoặc classes dạy (nếu là teacher)
  let classes: RowDataPacket[] = [];
  if (user.role === "student") {
    classes = (await query<RowDataPacket[]>(
      `SELECT c.id, c.name, c.schedule, c.teacher_id, u.name AS teacher_name
       FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE cm.student_id = ?`,
      [id]
    )) as RowDataPacket[];
  } else if (user.role === "teacher") {
    classes = (await query<RowDataPacket[]>(
      `SELECT id, name, schedule, teacher_id FROM classes WHERE teacher_id = ?`,
      [id]
    )) as RowDataPacket[];
  }

  // Children (nếu là parent) hoặc parents (nếu là student)
  let children: RowDataPacket[] = [];
  let parents: RowDataPacket[] = [];
  if (user.role === "parent") {
    children = (await query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.username, u.level, u.cefr_level, pl.relationship
       FROM parent_links pl JOIN users u ON u.id = pl.student_id
       WHERE pl.parent_id = ? AND u.deleted_at IS NULL`,
      [id]
    )) as RowDataPacket[];
  } else if (user.role === "student") {
    parents = (await query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.username, pl.relationship
       FROM parent_links pl JOIN users u ON u.id = pl.parent_id
       WHERE pl.student_id = ? AND u.deleted_at IS NULL`,
      [id]
    )) as RowDataPacket[];
  }

  res.json({ user, classes, children, parents });
});

// ============================================================
// PARENT_LINKS — Admin quản lý quan hệ PH ↔ HS
// ============================================================

adminRouter.post("/parent-links", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const { parent_id, student_id, relationship } = req.body || {};
  if (!parent_id || !student_id) {
    return res.status(400).json({ error: "Thiếu parent_id hoặc student_id." });
  }

  // Validate parent
  const parent = await queryOne<RowDataPacket & { name: string }>(
    "SELECT id, name FROM users WHERE id = ? AND role='parent' AND deleted_at IS NULL",
    [parent_id]
  );
  if (!parent) {
    return res
      .status(400)
      .json({ error: "parent_id không hợp lệ (không phải PH hoặc đã xóa)." });
  }

  // Validate student
  const student = await queryOne<RowDataPacket & { name: string }>(
    "SELECT id, name FROM users WHERE id = ? AND role='student' AND deleted_at IS NULL",
    [student_id]
  );
  if (!student) {
    return res
      .status(400)
      .json({ error: "student_id không hợp lệ (không phải HS hoặc đã xóa)." });
  }

  // Relationship (optional, max 16 chars theo schema)
  const relValue =
    relationship == null || relationship === ""
      ? null
      : String(relationship).trim();
  if (relValue && relValue.length > 16) {
    return res.status(400).json({ error: "relationship tối đa 16 ký tự." });
  }

  // Duplicate check
  const existing = await queryOne(
    "SELECT 1 FROM parent_links WHERE parent_id = ? AND student_id = ?",
    [parent_id, student_id]
  );
  if (existing) {
    return res.status(409).json({ error: "Liên kết PH ↔ HS đã tồn tại." });
  }

  await query<ResultSetHeader>(
    "INSERT INTO parent_links (parent_id, student_id, relationship) VALUES (?, ?, ?)",
    [parent_id, student_id, relValue]
  );
  await logAudit({
    actorId: admin.id,
    action: "parent_link.add",
    targetType: "parent_link",
    targetId: `${parent_id}/${student_id}`,
    details: { parent_name: parent.name, student_name: student.name, relationship: relValue },
    ip: req.ip,
  });

  res.json({ ok: true });
});

adminRouter.delete(
  "/parent-links/:parentId/:studentId",
  async (req: Request, res: Response) => {
    const admin = await requireRole(req, res, ["admin"]);
    if (!admin) return;
    const { parentId, studentId } = req.params;
    await query<ResultSetHeader>(
      "DELETE FROM parent_links WHERE parent_id = ? AND student_id = ?",
      [parentId, studentId]
    );
    await logAudit({
      actorId: admin.id,
      action: "parent_link.remove",
      targetType: "parent_link",
      targetId: `${parentId}/${studentId}`,
      details: {},
      ip: req.ip,
    });
    res.json({ ok: true });
  }
);

const VALID_ROLES = ["student", "parent", "teacher", "admin"] as const;

function pickUserFields(body: any): {
  name?: string;
  level?: string | null;
  cefr_level?: string | null;
  goal?: string | null;
  daily_goal_minutes?: number | null;
} {
  const out: any = {};
  if (body.name !== undefined) out.name = String(body.name).trim();
  if (body.level !== undefined) out.level = body.level || null;
  if (body.cefr_level !== undefined) out.cefr_level = body.cefr_level || null;
  if (body.goal !== undefined) out.goal = body.goal || null;
  if (body.daily_goal_minutes !== undefined) {
    const n = Number(body.daily_goal_minutes);
    if (![5, 15, 30].includes(n)) {
      throw new Error("daily_goal_minutes phải là 5, 15 hoặc 30.");
    }
    out.daily_goal_minutes = n;
  }
  return out;
}

adminRouter.post("/users", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name || !role) {
    return res
      .status(400)
      .json({ error: "Thiếu username, password, name hoặc role." });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role không hợp lệ: ${role}` });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: "Password quá ngắn (tối thiểu 4 ký tự)." });
  }

  const existing = await queryOne(
    "SELECT id FROM users WHERE username = ?",
    [username]
  );
  if (existing) {
    return res.status(409).json({ error: `Username "${username}" đã tồn tại.` });
  }

  let fields: any;
  try {
    fields = pickUserFields(req.body);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const id = crypto.randomUUID();
  const { hash, salt } = hashPassword(password);
  await query<ResultSetHeader>(
    `INSERT INTO users (id, username, password_hash, password_salt, role, name,
                        level, cefr_level, goal, daily_goal_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      username,
      hash,
      salt,
      role,
      name,
      fields.level ?? null,
      fields.cefr_level ?? null,
      fields.goal ?? null,
      fields.daily_goal_minutes ?? 15,
    ]
  );

  await logAudit({
    actorId: admin.id,
    action: "user.create",
    targetType: "user",
    targetId: id,
    details: { username, role, name },
    ip: req.ip,
  });

  const user = await queryOne<UserListRow>(
    `SELECT id, username, name, role, level, cefr_level, goal,
            daily_goal_minutes, created_at, deleted_at
     FROM users WHERE id = ?`,
    [id]
  );
  res.json({ user });
});

adminRouter.patch("/users/:id", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const id = req.params.id;
  const existing = await queryOne<UserListRow>(
    "SELECT id, role FROM users WHERE id = ?",
    [id]
  );
  if (!existing) return res.status(404).json({ error: "Người dùng không tồn tại." });

  let fields: any;
  try {
    fields = pickUserFields(req.body);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "Không có trường nào để cập nhật." });
  }

  const sets: string[] = [];
  const params: any[] = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    params.push(v);
  }
  params.push(id);
  await query<ResultSetHeader>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    params
  );

  await logAudit({
    actorId: admin.id,
    action: "user.update",
    targetType: "user",
    targetId: id,
    details: fields,
    ip: req.ip,
  });

  const user = await queryOne<UserListRow>(
    `SELECT id, username, name, role, level, cefr_level, goal,
            daily_goal_minutes, created_at, deleted_at
     FROM users WHERE id = ?`,
    [id]
  );
  res.json({ user });
});

adminRouter.delete("/users/:id", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const id = req.params.id;
  if (id === admin.id) {
    return res
      .status(400)
      .json({ error: "Không thể xóa chính mình. Nhờ admin khác nếu cần." });
  }
  const existing = await queryOne<UserListRow>(
    "SELECT id, username, deleted_at FROM users WHERE id = ?",
    [id]
  );
  if (!existing) return res.status(404).json({ error: "Người dùng không tồn tại." });
  if (existing.deleted_at) {
    return res.status(400).json({ error: "Người dùng đã bị xóa mềm." });
  }

  // Wrap UPDATE + DELETE sessions trong 1 transaction (audit log bên ngoài —
  // audit_log INSERT luôn thành công nhờ INSERT, không cần transaction)
  await withTransaction(async (conn) => {
    await conn.execute("UPDATE users SET deleted_at = NOW() WHERE id = ?", [id]);
    await conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", [id]);
  });

  await logAudit({
    actorId: admin.id,
    action: "user.soft_delete",
    targetType: "user",
    targetId: id,
    details: { username: existing.username },
    ip: req.ip,
  });

  res.json({ ok: true });
});

adminRouter.post("/users/:id/restore", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;

  const id = req.params.id;
  const existing = await queryOne<UserListRow>(
    "SELECT id, deleted_at FROM users WHERE id = ?",
    [id]
  );
  if (!existing) return res.status(404).json({ error: "Người dùng không tồn tại." });
  if (!existing.deleted_at) {
    return res.status(400).json({ error: "Người dùng chưa bị xóa." });
  }
  await query<ResultSetHeader>(
    "UPDATE users SET deleted_at = NULL WHERE id = ?",
    [id]
  );
  await logAudit({
    actorId: admin.id,
    action: "user.restore",
    targetType: "user",
    targetId: id,
    ip: req.ip,
  });
  const user = await queryOne<UserListRow>(
    `SELECT id, username, name, role, level, cefr_level, goal,
            daily_goal_minutes, created_at, deleted_at
     FROM users WHERE id = ?`,
    [id]
  );
  res.json({ user });
});

adminRouter.post(
  "/users/:id/reset-password",
  async (req: Request, res: Response) => {
    const admin = await requireRole(req, res, ["admin"]);
    if (!admin) return;

    const id = req.params.id;
    // Self-reset allowed theo user choice
    const existing = await queryOne<UserListRow>(
      "SELECT id, username FROM users WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    if (!existing)
      return res
        .status(404)
        .json({ error: "Người dùng không tồn tại hoặc đã bị xóa." });

    const temp = generateTempPassword();
    const { hash, salt } = hashPassword(temp);
    await query<ResultSetHeader>(
      "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
      [hash, salt, id]
    );
    // Kill all sessions
    await query<ResultSetHeader>(
      "DELETE FROM auth_sessions WHERE user_id = ?",
      [id]
    );

    await logAudit({
      actorId: admin.id,
      action: "user.reset_password",
      targetType: "user",
      targetId: id,
      details: { username: existing.username, self_reset: id === admin.id },
      ip: req.ip,
    });

    res.json({
      ok: true,
      tempPassword: temp,
      user: { id, username: existing.username },
    });
  }
);

// ============================================================
// CLASSES
// ============================================================

interface ClassListRow extends RowDataPacket {
  id: string;
  name: string;
  teacher_id: string;
  teacher_name: string | null;
  schedule: string | null;
  description: string | null;
  member_count: number;
  created_at: string;
}

adminRouter.get("/classes", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const rows = (await query<ClassListRow[]>(
    `SELECT c.id, c.name, c.teacher_id, c.schedule, c.description, c.created_at,
            u.name AS teacher_name,
            COUNT(cm.student_id) AS member_count
     FROM classes c
     LEFT JOIN users u ON u.id = c.teacher_id
     LEFT JOIN class_members cm ON cm.class_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at ASC`
  )) as ClassListRow[];
  res.json({ classes: rows });
});

adminRouter.post("/classes", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const { name, teacher_id, schedule, description } = req.body || {};
  if (!name || !teacher_id) {
    return res
      .status(400)
      .json({ error: "Thiếu name hoặc teacher_id." });
  }
  // Verify teacher exists + not deleted
  const teacher = await queryOne(
    "SELECT id FROM users WHERE id = ? AND role='teacher' AND deleted_at IS NULL",
    [teacher_id]
  );
  if (!teacher) {
    return res.status(400).json({ error: "teacher_id không hợp lệ." });
  }
  const id = crypto.randomUUID();
  await query<ResultSetHeader>(
    `INSERT INTO classes (id, name, teacher_id, schedule, description)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, teacher_id, schedule || null, description || null]
  );
  await logAudit({
    actorId: admin.id,
    action: "class.create",
    targetType: "class",
    targetId: id,
    details: { name, teacher_id },
    ip: req.ip,
  });
  const cls = await queryOne<ClassListRow>(
    `SELECT c.id, c.name, c.teacher_id, c.schedule, c.description, c.created_at,
            u.name AS teacher_name,
            COUNT(cm.student_id) AS member_count
     FROM classes c
     LEFT JOIN users u ON u.id = c.teacher_id
     LEFT JOIN class_members cm ON cm.class_id = c.id
     WHERE c.id = ?
     GROUP BY c.id`,
    [id]
  );
  res.json({ class: cls });
});

adminRouter.patch("/classes/:id", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const id = req.params.id;
  const existing = await queryOne(
    "SELECT id FROM classes WHERE id = ?",
    [id]
  );
  if (!existing) return res.status(404).json({ error: "Lớp không tồn tại." });

  const sets: string[] = [];
  const params: any[] = [];
  for (const k of ["name", "teacher_id", "schedule", "description"]) {
    if (req.body?.[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(req.body[k] || null);
    }
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Không có trường nào để cập nhật." });
  }
  params.push(id);
  await query<ResultSetHeader>(
    `UPDATE classes SET ${sets.join(", ")} WHERE id = ?`,
    params
  );
  await logAudit({
    actorId: admin.id,
    action: "class.update",
    targetType: "class",
    targetId: id,
    details: req.body,
    ip: req.ip,
  });
  const cls = await queryOne<ClassListRow>(
    `SELECT c.id, c.name, c.teacher_id, c.schedule, c.description, c.created_at,
            u.name AS teacher_name,
            COUNT(cm.student_id) AS member_count
     FROM classes c
     LEFT JOIN users u ON u.id = c.teacher_id
     LEFT JOIN class_members cm ON cm.class_id = c.id
     WHERE c.id = ?
     GROUP BY c.id`,
    [id]
  );
  res.json({ class: cls });
});

adminRouter.delete("/classes/:id", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const id = req.params.id;
  const existing = await queryOne<RowDataPacket & { name: string }>(
    "SELECT id, name FROM classes WHERE id = ?",
    [id]
  );
  if (!existing) return res.status(404).json({ error: "Lớp không tồn tại." });
  await query<ResultSetHeader>("DELETE FROM classes WHERE id = ?", [id]);
  await logAudit({
    actorId: admin.id,
    action: "class.delete",
    targetType: "class",
    targetId: id,
    details: { name: existing.name },
    ip: req.ip,
  });
  res.json({ ok: true });
});

adminRouter.get("/classes/:id/members", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const id = req.params.id;
  const students = (await query<RowDataPacket[]>(
    `SELECT u.id, u.name, u.username, u.level, u.cefr_level, u.goal, cm.joined_at
     FROM class_members cm
     JOIN users u ON u.id = cm.student_id
     WHERE cm.class_id = ? AND u.deleted_at IS NULL
     ORDER BY u.name`,
    [id]
  )) as RowDataPacket[];
  res.json({ students });
});

adminRouter.post("/classes/:id/members", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const id = req.params.id;
  const { student_id } = req.body || {};
  if (!student_id) {
    return res.status(400).json({ error: "Thiếu student_id." });
  }
  const cls = await queryOne("SELECT id FROM classes WHERE id = ?", [id]);
  if (!cls) return res.status(404).json({ error: "Lớp không tồn tại." });
  const student = await queryOne<RowDataPacket & { name: string }>(
    "SELECT id, name FROM users WHERE id = ? AND role='student' AND deleted_at IS NULL",
    [student_id]
  );
  if (!student) {
    return res
      .status(400)
      .json({ error: "student_id không hợp lệ (không phải HS hoặc đã xóa)." });
  }
  const already = await queryOne(
    "SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?",
    [id, student_id]
  );
  if (already) {
    return res.status(409).json({ error: "HS đã có trong lớp." });
  }
  await query<ResultSetHeader>(
    "INSERT INTO class_members (class_id, student_id) VALUES (?, ?)",
    [id, student_id]
  );
  await logAudit({
    actorId: admin.id,
    action: "class.add_member",
    targetType: "class_member",
    targetId: student_id,
    details: { class_id: id, student_name: student.name },
    ip: req.ip,
  });
  res.json({ ok: true });
});

adminRouter.delete(
  "/classes/:id/members/:studentId",
  async (req: Request, res: Response) => {
    const admin = await requireRole(req, res, ["admin"]);
    if (!admin) return;
    const id = req.params.id;
    const studentId = req.params.studentId;
    await query<ResultSetHeader>(
      "DELETE FROM class_members WHERE class_id = ? AND student_id = ?",
      [id, studentId]
    );
    await logAudit({
      actorId: admin.id,
      action: "class.remove_member",
      targetType: "class_member",
      targetId: studentId,
      details: { class_id: id },
      ip: req.ip,
    });
    res.json({ ok: true });
  }
);

// ============================================================
// ZALO SETTINGS
// ============================================================

const ZALO_FREQUENCIES = ["off", "daily", "weekly", "biweekly", "monthly"] as const;

function validateZaloSettings(body: any): {
  ok: boolean;
  error?: string;
  cleaned: any;
} {
  const cleaned: any = {};
  if (body.frequency !== undefined) {
    if (!ZALO_FREQUENCIES.includes(body.frequency)) {
      return { ok: false, error: `frequency phải là một trong: ${ZALO_FREQUENCIES.join(", ")}`, cleaned };
    }
    cleaned.frequency = body.frequency;
  }
  if (body.send_time !== undefined) {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(body.send_time)) {
      return { ok: false, error: "send_time phải có dạng HH:MM hoặc HH:MM:SS.", cleaned };
    }
    cleaned.send_time = body.send_time;
  }
  if (body.send_day_of_week !== undefined) {
    if (body.send_day_of_week === null || body.send_day_of_week === "") {
      cleaned.send_day_of_week = null;
    } else {
      const n = Number(body.send_day_of_week);
      if (!Number.isInteger(n) || n < 1 || n > 7) {
        return { ok: false, error: "send_day_of_week phải trong khoảng 1-7 hoặc null.", cleaned };
      }
      cleaned.send_day_of_week = n;
    }
  }
  for (const k of [
    "zalo_oa_id",
    "zalo_access_token",
    "zalo_template_id",
    "custom_message",
  ]) {
    if (body[k] !== undefined) cleaned[k] = body[k] || null;
  }
  if (body.zalo_template_data_json !== undefined) {
    if (body.zalo_template_data_json) {
      try {
        JSON.parse(body.zalo_template_data_json);
      } catch (e: any) {
        return { ok: false, error: "zalo_template_data_json không phải JSON hợp lệ.", cleaned };
      }
    }
    cleaned.zalo_template_data_json = body.zalo_template_data_json || null;
  }
  for (const k of [
    "include_skills",
    "include_streak",
    "include_minutes",
    "include_needs_help",
  ]) {
    if (body[k] !== undefined) {
      cleaned[k] = body[k] ? 1 : 0;
    }
  }
  return { ok: true, cleaned };
}

adminRouter.get("/settings/zalo", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const settings = await queryOne(
    `SELECT * FROM parent_report_settings WHERE id = 1`
  );
  res.json({ settings });
});

adminRouter.patch("/settings/zalo", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const v = validateZaloSettings(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const fields = v.cleaned;
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "Không có trường nào để cập nhật." });
  }
  const sets: string[] = [];
  const params: any[] = [];
  for (const [k, val] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    params.push(val);
  }
  sets.push("updated_by = ?");
  params.push(admin.id);
  params.push(1);
  await query<ResultSetHeader>(
    `UPDATE parent_report_settings SET ${sets.join(", ")} WHERE id = ?`,
    params
  );
  await logAudit({
    actorId: admin.id,
    action: "settings.update_zalo",
    targetType: "settings",
    targetId: "zalo",
    details: fields,
    ip: req.ip,
  });
  const settings = await queryOne(
    `SELECT * FROM parent_report_settings WHERE id = 1`
  );
  res.json({ settings });
});

adminRouter.post("/settings/zalo/test", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const { recipient_id, data } = req.body || {};
  if (!recipient_id) {
    return res.status(400).json({ error: "Thiếu recipient_id." });
  }
  const settings = await queryOne<RowDataPacket>(
    `SELECT * FROM parent_report_settings WHERE id = 1`
  );
  if (!settings || !settings.zalo_oa_id || !settings.zalo_access_token || !settings.zalo_template_id) {
    return res
      .status(400)
      .json({ error: "Chưa cấu hình OA credentials. Điền OA ID + access token + template trước." });
  }
  const result = await sendZaloMessage(
    {
      oaId: settings.zalo_oa_id,
      accessToken: settings.zalo_access_token,
      templateId: settings.zalo_template_id,
    },
    recipient_id,
    data || { test: true, sent_by: admin.username, sent_at: new Date().toISOString() }
  );
  await logAudit({
    actorId: admin.id,
    action: "zalo.test_stub",
    targetType: "parent",
    targetId: recipient_id,
    details: { template: settings.zalo_template_id },
    ip: req.ip,
  });
  res.json({ result });
});

// ============================================================
// AUDIT + CRON + AUDIO (read-only lists)
// ============================================================

adminRouter.get("/audit", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 200);
  const entries = (await query<RowDataPacket[]>(
    `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.details_json,
            a.ip_address, a.created_at, u.name AS actor_name, u.username AS actor_username
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [limit]
  )) as RowDataPacket[];
  res.json({ entries });
});

adminRouter.get("/cron-runs", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 200);
  const runs = (await query<RowDataPacket[]>(
    `SELECT * FROM cron_job_runs ORDER BY started_at DESC LIMIT ?`,
    [limit]
  )) as RowDataPacket[];
  res.json({ runs });
});

adminRouter.get("/audio", async (req: Request, res: Response) => {
  const admin = await requireRole(req, res, ["admin"]);
  if (!admin) return;
  const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 200);
  const recordings = (await query<RowDataPacket[]>(
    `SELECT s.id, s.user_id, s.transcript, s.audio_duration_ms, s.expires_at,
            s.topic, s.level, s.created_at, u.name AS user_name, u.username
     FROM speak_recordings s
     LEFT JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC
     LIMIT ?`,
    [limit]
  )) as RowDataPacket[];
  res.json({ recordings });
});
