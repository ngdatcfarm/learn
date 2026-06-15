/**
 * server/dashboard.ts — Teacher + Parent dashboards
 *
 * GET /api/dashboard/teacher/:classId  — Danh sách HS trong lớp + status
 * GET /api/dashboard/parent            — Danh sách con + skills summary
 */

import { Router, Request, Response } from "express";
import { getDb } from "../db/client";
import { requireUser, requireRole } from "./auth";
import { computeCurrentSkills, computeEngagement } from "./skills";

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/teacher/:classId
 * Teacher: xem danh sách HS trong lớp + skills + recent activity
 */
dashboardRouter.get("/teacher/:classId", (req: Request, res: Response) => {
  const teacher = requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const { classId } = req.params;
  const db = getDb();

  // Verify teacher owns this class (admin thì pass)
  if (teacher.role === "teacher") {
    const owns = db
      .prepare("SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?")
      .get(classId, teacher.id);
    if (!owns) return res.status(403).json({ error: "Bạn không dạy lớp này." });
  }

  // Class info
  const cls = db
    .prepare("SELECT id, name, schedule, description FROM classes WHERE id = ?")
    .get(classId) as any;
  if (!cls) return res.status(404).json({ error: "Lớp không tồn tại." });

  // Students in class
  const students = db
    .prepare(
      `SELECT u.id, u.name, u.username, u.level, u.cefr_level, u.goal,
              cm.joined_at
       FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = ?
       ORDER BY u.name`
    )
    .all(classId) as any[];

  // For each student: compute current skills (expensive — optimize sau nếu cần)
  const studentsWithStats = students.map((s) => ({
    ...s,
    skills: computeCurrentSkills(s.id),
    engagement: computeEngagement(s.id),
  }));

  res.json({
    class: cls,
    students: studentsWithStats,
    count: students.length,
  });
});

/**
 * GET /api/dashboard/parent
 * Parent: xem danh sách con + skills summary
 */
dashboardRouter.get("/parent", (req: Request, res: Response) => {
  const parent = requireRole(req, res, ["parent", "admin"]);
  if (!parent) return;

  const db = getDb();
  const children = db
    .prepare(
      `SELECT u.id, u.name, u.username, u.level, u.cefr_level, u.goal,
              pl.relationship
       FROM parent_links pl
       JOIN users u ON u.id = pl.student_id
       WHERE pl.parent_id = ?
       ORDER BY u.name`
    )
    .all(parent.id) as any[];

  const childrenWithStats = children.map((c) => ({
    ...c,
    skills: computeCurrentSkills(c.id),
    engagement: computeEngagement(c.id),
  }));

  res.json({ children: childrenWithStats, count: children.length });
});
