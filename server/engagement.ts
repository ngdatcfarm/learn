/**
 * server/engagement.ts — Track session events (MySQL)
 *
 * Events chính:
 *   - session_start / session_end: mở/đóng app
 *   - task_done / task_abandoned: hoàn thành/bỏ ngang bài
 *   - hint_used: HS dùng gợi ý
 *   - login: đã track qua auth_sessions
 *
 * Khác biệt với SQLite:
 *   - Async/await
 *   - `db.prepare(...).run()` → `await query<ResultSetHeader>(...)`
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { query, queryOne, ResultSetHeader, RowDataPacket } from "../db/client";
import { requireUser } from "./auth";
import { VALID_ENGAGEMENT_EVENTS } from "./constants";
import { logAudit } from "./audit";
import { detectSuspicious } from "./jobs/classSessionDetector";
import { emitToRoom } from "./socket";

export const engagementRouter = Router();

/**
 * POST /api/engagement/track
 * Body: { event, value?, context? }
 */
engagementRouter.post("/track", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { event, value, context } = req.body || {};
  if (!VALID_ENGAGEMENT_EVENTS.includes(event)) {
    return res.status(400).json({ error: `event không hợp lệ. Phải là: ${VALID_ENGAGEMENT_EVENTS.join(", ")}` });
  }

  const id = crypto.randomUUID();
  await query<ResultSetHeader>(
    `INSERT INTO engagement_events (id, user_id, event, value, context_json)
     VALUES (?, ?, ?, ?, ?)`,
    [id, user.id, event, value ?? null, context ? JSON.stringify(context) : null]
  );

  // Step 13b Phase 6: detect suspicious task_done nếu HS đang trong active class session
  if (event === "task_done") {
    void checkSuspiciousTaskDone(user.id, context, id).catch((err) =>
      console.warn("[engagement] suspicious check failed:", err?.message)
    );
  }

  res.json({ ok: true, id });
});

/**
 * Phase 6: check xem task_done có suspicious không.
 *   1. Lookup latest task_started cùng context.question_id
 *   2. Lookup question_bank.text + tags
 *   3. Compute time_ms
 *   4. Nếu suspicious + HS trong active class_session → emit class:suspicious-answer
 *   5. Audit `class_session.suspicious_flag`
 *
 * Wrap try/catch — lỗi không làm fail track endpoint.
 */
async function checkSuspiciousTaskDone(
  userId: string,
  context: Record<string, unknown> | undefined,
  taskDoneId: string
): Promise<void> {
  const questionId =
    typeof context?.question_id === "string" ? (context.question_id as string) : null;
  if (!questionId) return;

  // 1. Lookup task_started gần nhất với cùng question_id
  const startedRow = await queryOne<RowDataPacket & { occurred_at: string }>(
    `SELECT occurred_at FROM engagement_events
     WHERE user_id = ?
       AND event = 'task_started'
       AND JSON_EXTRACT(context_json, '$.question_id') = ?
     ORDER BY occurred_at DESC LIMIT 1`,
    [userId, questionId]
  );
  if (!startedRow) return;

  const startedAt = new Date(startedRow.occurred_at).getTime();
  const doneAt = Date.now();
  const timeMs = Math.max(0, doneAt - startedAt);

  // 2. Lookup question text + tags
  const q = await queryOne<RowDataPacket & { text: string | null; tags: string | null }>(
    `SELECT content_json, tags FROM question_bank WHERE id = ?`,
    [questionId]
  );
  let qText: string | null = null;
  if (q) {
    try {
      const parsed = JSON.parse(String((q as any).content_json || "{}"));
      qText =
        parsed?.text ||
        parsed?.prompt ||
        parsed?.reference ||
        null;
    } catch {
      qText = null;
    }
  }
  const qTags = q ? (q as any).tags ?? null : null;

  // 3. Detect
  const result = detectSuspicious({
    time_ms: timeMs,
    question_text: qText,
    question_tags: qTags,
  });

  if (!result.suspicious) return;

  // 4. Check HS có trong active class_session không
  const activeCs = await queryOne<RowDataPacket & { id: string; teacher_id: string }>(
    `SELECT cs.id, cs.teacher_id
     FROM class_sessions cs
     JOIN class_members cm ON cm.class_id = cs.class_id
     WHERE cm.student_id = ?
       AND cs.status = 'active'
     ORDER BY cs.started_at DESC LIMIT 1`,
    [userId]
  );
  if (!activeCs) return;

  // 5. Emit + audit
  emitToRoom("/live-help", `class:${activeCs.id}`, "class:suspicious-answer", {
    student_id: userId,
    question_id: questionId,
    time_ms: timeMs,
    threshold_ms: result.threshold_ms,
    reason: result.reason,
    task_done_id: taskDoneId,
  });

  await logAudit({
    actorId: null,
    action: "class_session.suspicious_flag",
    targetType: "class_session",
    targetId: activeCs.id,
    details: {
      student_id: userId,
      question_id: questionId,
      time_ms: timeMs,
      threshold_ms: result.threshold_ms,
      reason: result.reason,
    },
  });
}
