/**
 * server/jobs/classSessionReview.ts — Step 13b Phase 5
 *
 * Cron hourly tick. Mỗi tick:
 *   1. Check NOW() trong cửa sổ ±15 phút của REVIEW_HOUR:REVIEW_MINUTE
 *      (mặc định 20:00 — sau khi lớp T3 kết thúc).
 *   2. Query class_sessions ended yesterday chưa có review trong
 *      class_session_reviews (idempotency qua LEFT JOIN).
 *   3. Cho mỗi session:
 *      - Gather context:
 *        • live_help_sessions (với class_session_id)
 *        • engagement_events task_done trong buổi
 *        • class_session_handups (số HS giơ tay)
 *        • class_session_board_pushes (số lần push)
 *        • class_session_tab_events (HS có tập trung không)
 *      - Gọi provider.generateJSON với structured prompt → review payload
 *        { summary_md, strengths[], needs_review[], tip_from_teacher_md }
 *      - Validate shape (manual guard, no zod dep)
 *      - INSERT class_session_reviews (UNIQUE class_session_id → idempotent)
 *      - StubProvider fallback: insert placeholder text
 *      - Audit `class_session.review_generated`
 *   4. Tất cả wrap với withRetry (transient AI failures).
 *
 * Debug: POST /api/debug/run-class-session-review-now (admin) để chạy ngay.
 */

import crypto from "node:crypto";
import { query, queryOne, RowDataPacket, ResultSetHeader } from "../../db/client";
import { logAudit } from "../audit";
import { isInTimeWindow } from "../utils/time";
import { withRetry } from "../utils/aiRetry";
import { createAiProvider } from "../ai/index";

const REVIEW_HOUR = parseInt(process.env.REVIEW_HOUR || "20", 10);
const REVIEW_MINUTE = parseInt(process.env.REVIEW_MINUTE || "0", 10);

interface SessionRow extends RowDataPacket {
  id: string;
  class_id: string;
  teacher_id: string;
  ended_at: string;
}

interface ContextRow extends RowDataPacket {
  count: number;
}

interface HandupStatRow extends RowDataPacket {
  student_id: string;
  handup_count: number;
}

interface SuspiciousFlagRow extends RowDataPacket {
  student_id: string;
  flagged_count: number;
}

interface ReviewPayload {
  summary_md: string;
  strengths: string[];
  needs_review: string[];
  tip_from_teacher_md: string;
}

/** Shape validator (manual, no zod). Returns null nếu invalid. */
function validateReviewPayload(p: unknown): ReviewPayload | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const summary = typeof o.summary_md === "string" ? o.summary_md : "";
  const tip = typeof o.tip_from_teacher_md === "string" ? o.tip_from_teacher_md : "";
  if (!summary && !tip) return null;
  const strengths = Array.isArray(o.strengths)
    ? o.strengths.filter((s): s is string => typeof s === "string").slice(0, 10)
    : [];
  const needs = Array.isArray(o.needs_review)
    ? o.needs_review.filter((s): s is string => typeof s === "string").slice(0, 10)
    : [];
  return {
    summary_md: summary.slice(0, 1500),
    strengths,
    needs_review: needs,
    tip_from_teacher_md: tip.slice(0, 1500),
  };
}

async function gatherContext(sessionId: string): Promise<{
  liveHelpCount: number;
  taskDoneCount: number;
  handupCount: number;
  boardPushCount: number;
  uniqueStudents: number;
  tabHiddenTotal: number;
  suspiciousCount: number;
  topStudentsByHandup: Array<{ student_id: string; handup_count: number }>;
}> {
  const [lh, td, hu, bp, uniq, tab, susp] = await Promise.all([
    queryOne<ContextRow>(
      `SELECT COUNT(*) AS count FROM live_help_sessions WHERE class_session_id = ?`,
      [sessionId]
    ),
    queryOne<ContextRow>(
      `SELECT COUNT(*) AS count
       FROM engagement_events
       WHERE event = 'task_done'
         AND JSON_EXTRACT(context_json, '$.class_session_id') = ?`,
      [sessionId]
    ),
    queryOne<ContextRow>(
      `SELECT COUNT(*) AS count FROM class_session_handups WHERE class_session_id = ?`,
      [sessionId]
    ),
    queryOne<ContextRow>(
      `SELECT COUNT(*) AS count FROM class_session_board_pushes WHERE class_session_id = ?`,
      [sessionId]
    ),
    queryOne<ContextRow>(
      `SELECT COUNT(DISTINCT student_id) AS count FROM class_session_tab_events
       WHERE class_session_id = ?`,
      [sessionId]
    ),
    queryOne<ContextRow>(
      `SELECT COUNT(*) AS count FROM class_session_tab_events
       WHERE class_session_id = ? AND event = 'hidden'`,
      [sessionId]
    ),
    queryOne<ContextRow>(
      `SELECT COUNT(*) AS count FROM engagement_events
       WHERE event = 'class_board_dismiss_requested'
         AND JSON_EXTRACT(context_json, '$.class_session_id') = ?`,
      [sessionId]
    ),
  ]);

  const top = await query<HandupStatRow[]>(
    `SELECT student_id, COUNT(*) AS handup_count
     FROM class_session_handups
     WHERE class_session_id = ?
     GROUP BY student_id
     ORDER BY handup_count DESC
     LIMIT 5`,
    [sessionId]
  );

  return {
    liveHelpCount: lh?.count ?? 0,
    taskDoneCount: td?.count ?? 0,
    handupCount: hu?.count ?? 0,
    boardPushCount: bp?.count ?? 0,
    uniqueStudents: uniq?.count ?? 0,
    tabHiddenTotal: tab?.count ?? 0,
    suspiciousCount: susp?.count ?? 0,
    topStudentsByHandup: top.map((r) => ({
      student_id: r.student_id,
      handup_count: r.handup_count,
    })),
  };
}

const PROVIDER = createAiProvider();

async function generateReview(
  ctx: Awaited<ReturnType<typeof gatherContext>>,
  sessionId: string
): Promise<ReviewPayload> {
  // Nếu không có key thật (stub provider) → trả placeholder.
  if (PROVIDER.info().name === "stub") {
    return {
      summary_md:
        "GV chưa mở buổi học — review sẽ có sau khi AI được cấu hình.",
      strengths: [],
      needs_review: [],
      tip_from_teacher_md: "Configure MINIMAX_API_KEY hoặc GEMINI_API_KEY để bật AI review.",
    };
  }

  const sysPrompt = `You are an encouraging English tutor summarizing a Vietnamese high school class session.
Given metrics from the session, return STRICT JSON with this shape:
{
  "summary_md": "1-2 sentence summary in Vietnamese, encouraging tone",
  "strengths": ["concept 1 HS nailed", "concept 2", ...],  // 0-5 strings
  "needs_review": ["concept 1 to revisit", ...],            // 0-5 strings
  "tip_from_teacher_md": "1 short actionable tip in Vietnamese for HS to follow up"
}
Be encouraging, age-appropriate (12-15). Keep each string under 80 chars.
Return ONLY the JSON object — no markdown, no commentary.`;

  const userPrompt = JSON.stringify(
    {
      session_id: sessionId,
      unique_students: ctx.uniqueStudents,
      task_done_count: ctx.taskDoneCount,
      handup_count: ctx.handupCount,
      board_push_count: ctx.boardPushCount,
      tab_hidden_total: ctx.tabHiddenTotal,
      suspicious_dismiss_count: ctx.suspiciousCount,
      live_help_sessions: ctx.liveHelpCount,
      top_students_by_handup: ctx.topStudentsByHandup,
    },
    null,
    2
  );

  const raw = await withRetry(
    () =>
      PROVIDER.generateText({
        system: sysPrompt,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.3,
      }),
    3,
    500
  );

  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    const validated = validateReviewPayload(parsed);
    if (validated) return validated;
  } catch {
    // fall through to placeholder
  }
  // Fallback khi parse fail
  return {
    summary_md: `Buổi học có ${ctx.uniqueStudents} HS tham gia, hoàn thành ${ctx.taskDoneCount} bài.`,
    strengths: [],
    needs_review: [],
    tip_from_teacher_md: "AI không generate được structured payload — check logs.",
  };
}

async function persistReview(
  sessionId: string,
  payload: ReviewPayload,
  model: string
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  await query<ResultSetHeader>(
    `INSERT INTO class_session_reviews (id, class_session_id, payload_json, model, generated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), model = VALUES(model), generated_at = VALUES(generated_at)`,
    [id, sessionId, JSON.stringify(payload), model, now]
  );
}

export interface ClassSessionReviewJobResult {
  processed: number;
  failed: number;
  skipped: boolean;
}

/**
 * Main entry — gọi từ cron (hourly) hoặc debug endpoint.
 * Nếu skipTimeWindow=true → skip check giờ (dùng cho debug endpoint).
 */
export async function runClassSessionReview(
  skipTimeWindow: boolean = false
): Promise<ClassSessionReviewJobResult> {
  const now = new Date();
  if (!skipTimeWindow && !isInTimeWindow(now, REVIEW_HOUR, REVIEW_MINUTE)) {
    return { processed: 0, failed: 0, skipped: true };
  }

  // Query sessions ended trong 36h qua chưa có review
  const sessions = await query<SessionRow[]>(
    `SELECT cs.id, cs.class_id, cs.teacher_id, cs.ended_at
     FROM class_sessions cs
     LEFT JOIN class_session_reviews r ON r.class_session_id = cs.id
     WHERE cs.status = 'ended'
       AND cs.ended_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
       AND r.id IS NULL
     ORDER BY cs.ended_at ASC
     LIMIT 20`,
    []
  );

  if (sessions.length === 0) {
    return { processed: 0, failed: 0, skipped: false };
  }

  const model = PROVIDER.info().model;
  let processed = 0;
  let failed = 0;

  for (const s of sessions) {
    try {
      const ctx = await gatherContext(s.id);
      const payload = await generateReview(ctx, s.id);
      await persistReview(s.id, payload, model);
      await logAudit({
        actorId: null,
        action: "class_session.review_generated",
        targetType: "class_session",
        targetId: s.id,
        details: {
          unique_students: ctx.uniqueStudents,
          task_done: ctx.taskDoneCount,
          handup_count: ctx.handupCount,
          model,
        },
      });
      processed++;
    } catch (err: any) {
      console.error(`[classSessionReview] session=${s.id} failed:`, err.message);
      failed++;
    }
  }

  console.log(
    `[classSessionReview] processed=${processed} failed=${failed} (${sessions.length} candidates)`
  );
  return { processed, failed, skipped: false };
}
