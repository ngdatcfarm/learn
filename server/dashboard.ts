/**
 * server/dashboard.ts — Teacher + Parent dashboards (MySQL)
 *
 * GET /api/dashboard/teacher/:classId  — Danh sách HS trong lớp + status
 * GET /api/dashboard/parent            — Danh sách con + skills summary
 *
 * Khác biệt với SQLite:
 *   - Async/await
 *   - `db.prepare(...).all()` → `await query<RowDataPacket[]>(...)`
 *   - computeCurrentSkills + computeEngagement là async → await cả 2
 */

import { Router, Request, Response } from "express";
import { query, queryOne, RowDataPacket } from "../db/client";
import { requireUser, requireRole } from "./auth";
import { computeCurrentSkills, computeEngagement } from "./skills";

export const dashboardRouter = Router();

interface ClassRow extends RowDataPacket {
  id: string;
  name: string;
  schedule: string | null;
  description: string | null;
}

interface StudentRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  joined_at: string;
}

/**
 * GET /api/dashboard/teacher/:classId
 * Teacher: xem danh sách HS trong lớp + skills + recent activity
 */
dashboardRouter.get("/teacher/:classId", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const { classId } = req.params;

  // Verify teacher owns this class (admin thì pass)
  if (teacher.role === "teacher") {
    const owns = await queryOne(
      "SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?",
      [classId, teacher.id]
    );
    if (!owns) return res.status(403).json({ error: "Bạn không dạy lớp này." });
  }

  // Class info
  const cls = await queryOne<ClassRow>(
    "SELECT id, name, schedule, description FROM classes WHERE id = ?",
    [classId]
  );
  if (!cls) return res.status(404).json({ error: "Lớp không tồn tại." });

  // Students in class
  const students = (await query<StudentRow[]>(
    `SELECT u.id, u.name, u.username, u.level, u.cefr_level, u.goal,
            cm.joined_at
     FROM class_members cm
     JOIN users u ON u.id = cm.student_id
     WHERE cm.class_id = ?
     ORDER BY u.name`,
    [classId]
  )) as StudentRow[];

  // For each student: compute current skills (parallel)
  const studentsWithStats = await Promise.all(
    students.map(async (s) => {
      const [skills, engagement] = await Promise.all([
        computeCurrentSkills(s.id),
        computeEngagement(s.id),
      ]);
      return { ...s, skills, engagement };
    })
  );

  res.json({
    class: cls,
    students: studentsWithStats,
    count: students.length,
  });
});

interface ChildRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  relationship: string | null;
}

/**
 * GET /api/dashboard/parent
 * Parent: xem danh sách con + skills summary
 */
dashboardRouter.get("/parent", async (req: Request, res: Response) => {
  const parent = await requireRole(req, res, ["parent", "admin"]);
  if (!parent) return;

  const children = (await query<ChildRow[]>(
    `SELECT u.id, u.name, u.username, u.level, u.cefr_level, u.goal,
            pl.relationship
     FROM parent_links pl
     JOIN users u ON u.id = pl.student_id
     WHERE pl.parent_id = ?
     ORDER BY u.name`,
    [parent.id]
  )) as ChildRow[];

  const childrenWithStats = await Promise.all(
    children.map(async (c) => {
      const [skills, engagement] = await Promise.all([
        computeCurrentSkills(c.id),
        computeEngagement(c.id),
      ]);
      return { ...c, skills, engagement };
    })
  );

  res.json({ children: childrenWithStats, count: children.length });
});
