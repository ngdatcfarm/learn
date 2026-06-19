/**
 * server/dashboard.ts — Teacher + Parent dashboards (MySQL)
 *
 * GET /api/dashboard/teacher            — Auto-resolve lớp đầu tiên của GV
 * GET /api/dashboard/teacher/classes    — Step 8: list classes của GV (admin: all)
 * GET /api/dashboard/teacher/:classId   — Explicit classId
 * GET /api/dashboard/parent             — Danh sách con + skills summary
 *
 * Khác biệt với SQLite:
 *   - Async/await
 *   - `db.prepare(...).all()` → `await query<RowDataPacket[]>(...)`
 *   - computeCurrentSkills + computeEngagement là async → await cả 2
 */

import { Router, Request, Response } from "express";
import { query, queryOne, RowDataPacket } from "../db/client";
import { requireRole, AuthUser } from "./auth";
import { computeCurrentSkills, computeEngagement } from "./skills";
import { getTodayActivity } from "./queries/engagement";

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
 * Xác định HS cần hỗ trợ.
 * Trả về 1 object chứa các flag + reason ngắn gọn để hiển thị.
 */
function classifyNeedsHelp(
  engagement: { streak: number; lastActive: string | null; totalEvents: number; retryRate: number }
): { needsHelp: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Streak = 0 và từng có events trước đó (đã từng học nhưng bỏ)
  if (engagement.totalEvents > 0 && engagement.streak === 0) {
    reasons.push("Streak đứt");
  }

  // 2. Không active > 3 ngày
  if (engagement.lastActive) {
    const last = new Date(engagement.lastActive.replace(" ", "T") + "Z");
    const daysAgo = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo > 3) {
      reasons.push(`Không vào ${daysAgo} ngày`);
    }
  } else if (engagement.totalEvents === 0) {
    reasons.push("Chưa từng học");
  }

  // 3. Retry rate cao = HS toàn sai (số task_done < số task_abandoned * 1.5)
  if (engagement.retryRate > 0.6) {
    reasons.push("Nhiều bài sai");
  }

  return { needsHelp: reasons.length > 0, reasons };
}

/**
 * GET /api/dashboard/teacher
 * Auto-resolve lớp đầu tiên của GV (admin → lớp bất kỳ). Trả cùng shape như /:classId.
 */
dashboardRouter.get("/teacher", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  // Teacher: lớp đầu tiên của mình. Admin: lớp bất kỳ trong hệ thống.
  const cls = teacher.role === "admin"
    ? await queryOne<{ id: string }>(
        `SELECT id FROM classes ORDER BY created_at ASC LIMIT 1`
      )
    : await queryOne<{ id: string }>(
        `SELECT id FROM classes
         WHERE teacher_id = ?
         ORDER BY created_at ASC LIMIT 1`,
        [teacher.id]
      );
  if (!cls) return res.status(404).json({ error: "Chưa có lớp nào." });

  return handleTeacherClass(req, res, cls.id, teacher);
});

interface TeacherClassRow {
  id: string;
  name: string;
  schedule: string | null;
  description: string | null;
  member_count: number;
  created_at: string;
}

/**
 * GET /api/dashboard/teacher/classes
 * Step 8: list classes của teacher hiện tại (admin thấy all).
 * Route phải đặt TRƯỚC /teacher/:classId — Express match theo thứ tự, nếu đặt sau
 * path "classes" sẽ bị match làm classId → ownership check fail → 403.
 */
dashboardRouter.get("/teacher/classes", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;
  const isAdmin = teacher.role === "admin";
  const rows = (await query<TeacherClassRow[]>(
    isAdmin
      ? `SELECT c.id, c.name, c.schedule, c.description, c.created_at,
                COUNT(cm.student_id) AS member_count
         FROM classes c
         LEFT JOIN class_members cm ON cm.class_id = c.id
         GROUP BY c.id
         ORDER BY c.created_at ASC`
      : `SELECT c.id, c.name, c.schedule, c.description, c.created_at,
                COUNT(cm.student_id) AS member_count
         FROM classes c
         LEFT JOIN class_members cm ON cm.class_id = c.id
         WHERE c.teacher_id = ?
         GROUP BY c.id
         ORDER BY c.created_at ASC`,
    isAdmin ? [] : [teacher.id]
  )) as TeacherClassRow[];
  res.json({ classes: rows });
});

/**
 * GET /api/dashboard/teacher/:classId
 * Teacher: xem danh sách HS trong lớp + skills + recent activity
 */
dashboardRouter.get("/teacher/:classId", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;
  return handleTeacherClass(req, res, req.params.classId, teacher);
});

/**
 * Shared handler cho cả /teacher và /teacher/:classId.
 * - Verify ownership (admin pass)
 * - Load class + students
 * - Compute skills + engagement + today activity (parallel) cho mỗi HS
 * - Triage "cần hỗ trợ"
 * - Aggregate classStats
 */
async function handleTeacherClass(
  req: Request,
  res: Response,
  classId: string,
  teacher: AuthUser
): Promise<void> {
  // Verify teacher owns this class (admin thì pass)
  if (teacher.role === "teacher") {
    const owns = await queryOne(
      "SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?",
      [classId, teacher.id]
    );
    if (!owns) {
      res.status(403).json({ error: "Bạn không dạy lớp này." });
      return;
    }
  }

  // Class info
  const cls = await queryOne<ClassRow>(
    "SELECT id, name, schedule, description FROM classes WHERE id = ?",
    [classId]
  );
  if (!cls) {
    res.status(404).json({ error: "Lớp không tồn tại." });
    return;
  }

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

  // For each student: compute current skills + engagement + today's activity (parallel)
  const studentsWithStats = await Promise.all(
    students.map(async (s) => {
      const [skills, engagement, today] = await Promise.all([
        computeCurrentSkills(s.id),
        computeEngagement(s.id),
        getTodayActivity(s.id),
      ]);
      const help = classifyNeedsHelp(engagement);
      return {
        ...s,
        skills,
        engagement,
        today,
        needsHelp: help.needsHelp,
        helpReasons: help.reasons,
      };
    })
  );

  // Class-level aggregates
  const classStats = computeClassStats(studentsWithStats);

  res.json({
    class: cls,
    students: studentsWithStats,
    count: students.length,
    classStats,
  });
}

/**
 * Tính aggregate stats cho toàn lớp — GV nhìn nhanh "lớp mình ổn không?"
 */
function computeClassStats(
  students: Array<{
    skills: Record<string, { attempts: number; [k: string]: any }>;
    engagement: { streak: number; totalEvents: number; lastActive: string | null };
    today: { task_done_today: number; minutes_today: number; measurements_today: number };
    needsHelp: boolean;
  }>
) {
  const total = students.length;
  if (total === 0) {
    return {
      totalStudents: 0,
      activeToday: 0,
      needsHelpCount: 0,
      avgSkills: { read: 0, write: 0, listen: 0, speak: 0, learn: 0 },
      totalMeasurementsThisWeek: 0,
      totalMinutesThisWeek: 0,
    };
  }

  const activeToday = students.filter((s) => s.today.task_done_today > 0).length;
  const needsHelpCount = students.filter((s) => s.needsHelp).length;

  // Avg primary metric per skill
  const skillIds = ["read", "write", "listen", "speak", "learn"] as const;
  // Mỗi skill lấy metric "chính" (trùng với SKILL_META frontend)
  const PRIMARY: Record<string, string> = {
    read: "readComprehension",
    write: "writeCoherence",
    listen: "listenAccuracy",
    speak: "speakPronunciation",
    learn: "vocabRetention",
  };
  const avgSkills: Record<string, number> = {};
  for (const sid of skillIds) {
    const m = PRIMARY[sid];
    const vals = students
      .map((s) => Number(s.skills[sid]?.[m]) || 0)
      .filter((v) => v > 0); // bỏ qua HS chưa có data
    avgSkills[sid] = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }

  const totalMeasurementsThisWeek = students.reduce(
    (sum, s) => sum + s.today.measurements_today,
    0
  );
  const totalMinutesThisWeek = students.reduce((sum, s) => sum + s.today.minutes_today, 0);

  return {
    totalStudents: total,
    activeToday,
    needsHelpCount,
    avgSkills,
    totalMeasurementsThisWeek,
    totalMinutesThisWeek,
  };
}

interface ChildRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  relationship: string | null;
}

interface ParentRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
  phone: string | null;
}

/**
 * GET /api/dashboard/parent
 * Parent: xem danh sách con + skills + engagement + today + needs-help.
 * Step 4 mở rộng: thêm `today` (task/minutes/measurements) + `needsHelp`/`helpReasons`
 * để PH UI render tab-per-child với KPI + cảnh báo.
 * Cũng trả `parent.phone` để PH UI biết đã cấu hình Zalo chưa.
 */
dashboardRouter.get("/parent", async (req: Request, res: Response) => {
  const parent = await requireRole(req, res, ["parent", "admin"]);
  if (!parent) return;

  // Step 4: trả thêm phone để PH UI biết đã cấu hình SĐT chưa
  const parentRow = await queryOne<ParentRow>(
    "SELECT id, name, username, phone FROM users WHERE id = ?",
    [parent.id]
  );

  const children = (await query<ChildRow[]>(
    `SELECT u.id, u.name, u.username, u.level, u.cefr_level, u.goal,
            pl.relationship
     FROM parent_links pl
     JOIN users u ON u.id = pl.student_id
     WHERE pl.parent_id = ?
     ORDER BY u.name`,
    [parent.id]
  )) as ChildRow[];

  // Reuse teacher handler's parallel pattern: skills + engagement + today (Step 4)
  const childrenWithStats = await Promise.all(
    children.map(async (c) => {
      const [skills, engagement, today] = await Promise.all([
        computeCurrentSkills(c.id),
        computeEngagement(c.id),
        getTodayActivity(c.id),
      ]);
      const help = classifyNeedsHelp(engagement);
      return {
        ...c,
        skills,
        engagement,
        today,
        needsHelp: help.needsHelp,
        helpReasons: help.reasons,
      };
    })
  );

  res.json({
    parent: parentRow
      ? {
          id: parentRow.id,
          name: parentRow.name,
          username: parentRow.username,
          phone: parentRow.phone,
        }
      : { id: parent.id, name: parent.name, username: parent.username, phone: null },
    children: childrenWithStats,
    count: children.length,
  });
});

/**
 * GET /api/dashboard/parent/classes
 * PH xem các lớp mà con mình đang học, kèm aggregate stats.
 *
 * Mỗi class card gồm:
 *   - Thông tin lớp (name, teacher, schedule)
 *   - my_children_count / total_students (PH nhìn được context lớp lớn cỡ nào)
 *   - today aggregate (tasks_done, minutes, active_children) — tính từ
 *     getTodayActivity của các con của PH trong lớp
 *   - children[] compact info (id, name, username, streak, needs_help)
 *
 * Query 1 round-trip JOIN parent_links + class_members + classes + users
 * → group theo class_id ở JS. Sau đó parallel Promise.all cho today + engagement.
 */
interface ParentClassRow extends RowDataPacket {
  class_id: string;
  class_name: string;
  schedule: string | null;
  description: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  teacher_username: string | null;
  student_id: string;
  student_name: string;
  student_username: string;
  relationship: string | null;
  total_students: number; // COUNT qua subquery hoặc groupby
}

dashboardRouter.get("/parent/classes", async (req: Request, res: Response) => {
  const parent = await requireRole(req, res, ["parent", "admin"]);
  if (!parent) return;

  // 1 query: lấy tất cả class + PH's children trong class đó + teacher + total students
  // Dùng subquery để đếm total_students của class (không phải chỉ con của PH).
  const rows = (await query<ParentClassRow[]>(
    `SELECT c.id AS class_id, c.name AS class_name, c.schedule, c.description,
            u.id AS teacher_id, u.name AS teacher_name, u.username AS teacher_username,
            s.id AS student_id, s.name AS student_name, s.username AS student_username,
            pl.relationship,
            (SELECT COUNT(*) FROM class_members cm2 WHERE cm2.class_id = c.id) AS total_students
     FROM parent_links pl
     JOIN class_members cm ON cm.student_id = pl.student_id
     JOIN classes c ON c.id = cm.class_id
     LEFT JOIN users u ON u.id = c.teacher_id
     JOIN users s ON s.id = cm.student_id
     WHERE pl.parent_id = ? AND s.deleted_at IS NULL
     ORDER BY c.name, s.name`,
    [parent.id]
  )) as ParentClassRow[];

  if (rows.length === 0) {
    return res.json({ classes: [], count: 0 });
  }

  // Group by class_id
  const byClass = new Map<string, {
    class_id: string;
    class_name: string;
    schedule: string | null;
    description: string | null;
    teacher: { id: string; name: string; username: string } | null;
    total_students: number;
    my_children: { id: string; name: string; username: string; relationship: string | null }[];
  }>();

  for (const r of rows) {
    let entry = byClass.get(r.class_id);
    if (!entry) {
      entry = {
        class_id: r.class_id,
        class_name: r.class_name,
        schedule: r.schedule,
        description: r.description,
        teacher:
          r.teacher_id && r.teacher_name && r.teacher_username
            ? {
                id: r.teacher_id,
                name: r.teacher_name,
                username: r.teacher_username,
              }
            : null,
        total_students: r.total_students,
        my_children: [],
      };
      byClass.set(r.class_id, entry);
    }
    entry.my_children.push({
      id: r.student_id,
      name: r.student_name,
      username: r.student_username,
      relationship: r.relationship,
    });
  }

  // Parallel fetch stats per child (engagement + today)
  const allChildIds = [...new Set(rows.map((r) => r.student_id))];
  const childStats = new Map<
    string,
    { engagement: Awaited<ReturnType<typeof computeEngagement>>; today: Awaited<ReturnType<typeof getTodayActivity>> }
  >();
  await Promise.all(
    allChildIds.map(async (sid) => {
      const [engagement, today] = await Promise.all([
        computeEngagement(sid),
        getTodayActivity(sid),
      ]);
      childStats.set(sid, { engagement, today });
    })
  );

  // Aggregate + build response
  const classes = [...byClass.values()].map((entry) => {
    let tasksDone = 0;
    let minutes = 0;
    let activeCount = 0;
    const childrenWithStats = entry.my_children.map((child) => {
      const stats = childStats.get(child.id)!;
      const help = classifyNeedsHelp(stats.engagement);
      tasksDone += stats.today.task_done_today;
      minutes += stats.today.minutes_today;
      if (stats.today.task_done_today > 0) activeCount++;
      return {
        ...child,
        streak: stats.engagement.streak,
        needs_help: help.needsHelp,
      };
    });

    return {
      id: entry.class_id,
      name: entry.class_name,
      schedule: entry.schedule,
      description: entry.description,
      teacher: entry.teacher,
      total_students: entry.total_students,
      my_children_count: entry.my_children.length,
      my_children: childrenWithStats,
      today: {
        tasks_done: tasksDone,
        minutes: minutes,
        active_children: activeCount,
      },
    };
  });

  // Sort: lớp có con cần chú ý trước, sau đó theo tên
  classes.sort((a, b) => {
    const aAlert = a.my_children.some((c) => c.needs_help);
    const bAlert = b.my_children.some((c) => c.needs_help);
    if (aAlert !== bAlert) return aAlert ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  res.json({ classes, count: classes.length });
});
