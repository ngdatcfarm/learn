/**
 * server/teach.ts — Step 12d: Teacher Observation Mode (REST helpers)
 *
 * GV-driven classroom monitoring thay cho model HS-request cũ.
 * Các endpoint:
 *
 *   GET  /api/live/teach/active-students
 *     → List HS trong các lớp GV dạy + status (doing_today/idle/offline)
 *       + currently_observed_by (GV đang observe HS này, nếu có)
 *
 *   GET  /api/live/teach/student/:id/current-session
 *     → Current assignment context của HS (assignment + questions + submissions)
 *       cho GV chọn câu hỏi để mở whiteboard.
 *
 * Whiteboard endpoints (load/save strokes) nằm ở server/liveHelp.ts tại
 *   GET /api/live/help/whiteboard/:sessionId/:questionId
 *   PUT /api/live/help/whiteboard/:sessionId/:questionId
 * vì whiteboard là resource của session, share giữa GV + HS.
 *
 * Status logic:
 *   - doing_today: last engagement_event < 5 phút trước
 *   - idle:        5-30 phút
 *   - offline:     không có event hôm nay hoặc > 30 phút
 *
 * Lock semantics:
 *   - "1 HS / 1 observe tại 1 thời điểm" được enforce trong socket handler
 *     (observe:start) — check live_help_sessions WHERE trigger='teacher_observe'
 *     AND status='active' AND student_id=? trước khi tạo mới.
 *
 * Audit (PII-safe):
 *   - teach.observe.start  → details: { session_id, student_id }
 *   - teach.observe.end    → details: { session_id, outcome, duration_sec }
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

export const teachRouter = Router();

// ============================================================
// Active students list
// ============================================================

interface StudentWithStatusRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  class_id: string;
  class_name: string;
  last_activity_at: string | null;
  last_activity_minutes_ago: number | null;
  tasks_done_today: number;
  minutes_today: number;
  currently_observed_by: string | null;
  currently_observed_name: string | null;
}

type ObserveStatus = "doing_today" | "idle" | "offline";

/**
 * GET /api/live/teach/active-students
 *
 * Teacher: list HS các lớp mình dạy với status + currently_observed_by.
 * Admin: list tất cả HS (bypass teacher filter).
 *
 * Query không cần params. Status derived từ engagement_events hôm nay.
 */
teachRouter.get("/active-students", async (req: Request, res: Response) => {
  const teacher = await requireRole(req, res, ["teacher", "admin"]);
  if (!teacher) return;

  const whereClause =
    teacher.role === "teacher" ? "WHERE c.teacher_id = ?" : "";
  const params: any[] = teacher.role === "teacher" ? [teacher.id] : [];

  // FIX timezone: dùng CURDATE() + TIMESTAMPDIFF của MySQL để mọi so sánh thời gian
  // đều self-consistent (cùng 1 clock). Trước đây client-side Date.now() vs
  // mysql2 string parse gây drift do Node UTC vs MySQL session timezone khác nhau.
  const rows = await query<StudentWithStatusRow[]>(
    `SELECT
       u.id, u.name, u.username, u.level, u.cefr_level, u.goal,
       c.id AS class_id, c.name AS class_name,
       MAX(ee.occurred_at) AS last_activity_at,
       TIMESTAMPDIFF(MINUTE, MAX(ee.occurred_at), NOW()) AS last_activity_minutes_ago,
       SUM(CASE WHEN ee.event='task_done' AND ee.occurred_at >= CURDATE() THEN 1 ELSE 0 END) AS tasks_done_today,
       SUM(CASE WHEN ee.event='session_end' AND ee.occurred_at >= CURDATE() THEN ee.value ELSE 0 END) AS minutes_today,
       obs.teacher_id AS currently_observed_by,
       obs_t.name AS currently_observed_name
     FROM users u
     JOIN class_members cm ON cm.student_id = u.id
     JOIN classes c ON c.id = cm.class_id
     LEFT JOIN engagement_events ee
       ON ee.user_id = u.id AND ee.occurred_at >= CURDATE()
     LEFT JOIN (
       SELECT student_id, teacher_id
       FROM live_help_sessions
       WHERE \`trigger\`='teacher_observe' AND status='active'
     ) obs ON obs.student_id = u.id
     LEFT JOIN users obs_t ON obs_t.id = obs.teacher_id
     ${whereClause} AND u.role='student' AND u.deleted_at IS NULL
     GROUP BY u.id, c.id, c.name, u.name, u.username, u.level, u.cefr_level, u.goal,
              obs.teacher_id, obs_t.name
     ORDER BY u.name`,
    params
  );

  const students = rows.map((r) => {
    let status: ObserveStatus;
    let last_activity_minutes_ago: number | null = null;
    // last_activity_minutes_ago từ SQL TIMESTAMPDIFF — null nếu không có event hôm nay.
    // Có thể NEGATIVE nếu inject occurred_at trong tương lai — coerce thành 0 (= now).
    if (r.last_activity_at != null && r.last_activity_minutes_ago != null) {
      const diffMin = Math.max(0, Number(r.last_activity_minutes_ago));
      last_activity_minutes_ago = Math.round(diffMin);
      if (diffMin < 5) status = "doing_today";
      else if (diffMin < 30) status = "idle";
      else status = "offline";
    } else {
      status = "offline";
    }
    return {
      id: r.id,
      name: r.name,
      username: r.username,
      level: r.level,
      cefr_level: r.cefr_level,
      goal: r.goal,
      class_id: r.class_id,
      class_name: r.class_name,
      status,
      last_activity_at: r.last_activity_at,
      last_activity_minutes_ago,
      tasks_done_today: Number(r.tasks_done_today || 0),
      minutes_today: Math.round(Number(r.minutes_today || 0)),
      currently_observed_by: r.currently_observed_by,
      currently_observed_name: r.currently_observed_name,
    };
  });

  res.json({
    students,
    count: students.length,
    summary: {
      doing_today: students.filter((s) => s.status === "doing_today").length,
      idle: students.filter((s) => s.status === "idle").length,
      offline: students.filter((s) => s.status === "offline").length,
    },
  });
});

// ============================================================
// Current session context (cho GV chọn câu hỏi)
// ============================================================

interface AssignmentRow extends RowDataPacket {
  id: string;
  title: string;
  question_ids: string;
  due_at: string | null;
  instructions: string | null;
  class_id: string;
  class_name: string;
}

interface QuestionRow extends RowDataPacket {
  id: string;
  template_type: string;
  topic: string | null;
  level: string | null;
  content_json: string;
}

interface SubmissionRow extends RowDataPacket {
  id: string;
  question_id: string;
  score_pct: number | null;
  created_at: string;
}

/**
 * GET /api/live/teach/student/:id/current-session
 *
 * Current assignment của HS + questions + submissions gần nhất.
 * GV dùng để chọn câu hỏi mở whiteboard.
 */
teachRouter.get(
  "/student/:id/current-session",
  async (req: Request, res: Response) => {
    const teacher = await requireRole(req, res, ["teacher", "admin"]);
    if (!teacher) return;

    const studentId = req.params.id;

    // Verify HS thuộc lớp GV dạy (admin bypass)
    if (teacher.role === "teacher") {
      const inClass = await queryOne<RowDataPacket>(
        `SELECT 1 FROM class_members cm
         JOIN classes c ON c.id = cm.class_id
         WHERE cm.student_id = ? AND c.teacher_id = ? LIMIT 1`,
        [studentId, teacher.id]
      );
      if (!inClass) {
        return res.status(403).json({
          error: "HS không ở lớp bạn dạy.",
        });
      }
    }

    // Lấy assignment mới nhất HS được giao
    const assignment = await queryOne<AssignmentRow>(
      `SELECT a.id, a.title, a.question_ids, a.due_at, a.instructions,
              c.id AS class_id, c.name AS class_name
       FROM assignments a
       JOIN class_members cm ON cm.class_id = a.class_id
       JOIN classes c ON c.id = a.class_id
       WHERE cm.student_id = ?
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [studentId]
    );

    if (!assignment) {
      return res.json({ has_assignment: false });
    }

    // Parse question_ids JSON
    let questionIds: string[] = [];
    try {
      questionIds = JSON.parse(assignment.question_ids);
    } catch {
      return res
        .status(500)
        .json({ error: "Assignment question_ids không hợp lệ." });
    }

    // Limit 20 questions cho payload (tránh quá tải)
    const limitedIds = questionIds.slice(0, 20);
    if (limitedIds.length === 0) {
      return res.json({
        has_assignment: true,
        assignment: {
          id: assignment.id,
          title: assignment.title,
          class_id: assignment.class_id,
          class_name: assignment.class_name,
          due_at: assignment.due_at,
          instructions: assignment.instructions,
        },
        questions: [],
        total_questions: 0,
      });
    }

    const placeholders = limitedIds.map(() => "?").join(",");
    const questions = await query<QuestionRow[]>(
      `SELECT id, template_type, topic, level, content_json
       FROM question_bank
       WHERE id IN (${placeholders})`,
      limitedIds
    );

    // Preserve question order from question_ids array
    const orderedQuestions = limitedIds
      .map((qid) => questions.find((q) => q.id === qid))
      .filter(Boolean);

    // Submissions gần nhất cho các câu này
    const submissions = await query<SubmissionRow[]>(
      `SELECT id, question_id, score_pct, created_at
       FROM submissions
       WHERE user_id = ? AND question_id IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT 50`,
      [studentId, ...limitedIds]
    );

    // Group submissions by question_id (lấy cái mới nhất)
    const subByQ: Record<string, SubmissionRow> = {};
    for (const s of submissions) {
      if (!subByQ[s.question_id]) subByQ[s.question_id] = s;
    }

    const questionsPayload = orderedQuestions.map((q) => {
      let content: any = {};
      try {
        content = JSON.parse((q as QuestionRow).content_json);
      } catch {
        // ignore
      }
      const sub = subByQ[(q as QuestionRow).id];
      return {
        id: (q as QuestionRow).id,
        template_type: (q as QuestionRow).template_type,
        topic: (q as QuestionRow).topic,
        level: (q as QuestionRow).level,
        content,
        submission: sub
          ? {
              id: sub.id,
              score_pct: sub.score_pct,
              submitted_at: sub.created_at,
            }
          : null,
      };
    });

    res.json({
      has_assignment: true,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        class_id: assignment.class_id,
        class_name: assignment.class_name,
        due_at: assignment.due_at,
        instructions: assignment.instructions,
      },
      questions: questionsPayload,
      total_questions: questionIds.length,
    });
  }
);

// Whiteboard endpoints moved to server/liveHelp.ts (mount tại /api/live/help).
// Lý do: whiteboard là resource của session, share giữa GV + HS — đặt tại
// /api/live/help/whiteboard/:sessionId/:questionId cho nhất quán với hint/
// highlight endpoints hiện có.