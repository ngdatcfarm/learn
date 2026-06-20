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
import { query, ResultSetHeader } from "../db/client";
import { requireUser } from "./auth";
import { VALID_ENGAGEMENT_EVENTS } from "./constants";

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

  res.json({ ok: true, id });
});
