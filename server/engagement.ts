/**
 * server/engagement.ts — Track session events
 *
 * Events chính:
 *   - session_start / session_end: mở/đóng app
 *   - task_done / task_abandoned: hoàn thành/bỏ ngang bài
 *   - hint_used: HS dùng gợi ý
 *   - login: đã track qua auth_sessions
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { getDb } from "../db/client";
import { requireUser } from "./auth";

export const engagementRouter = Router();

/**
 * POST /api/engagement/track
 * Body: { event, value?, context? }
 */
engagementRouter.post("/track", (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { event, value, context } = req.body || {};
  const VALID_EVENTS = [
    "session_start",
    "session_end",
    "task_done",
    "task_abandoned",
    "hint_used",
  ];
  if (!VALID_EVENTS.includes(event)) {
    return res.status(400).json({ error: `event không hợp lệ. Phải là: ${VALID_EVENTS.join(", ")}` });
  }

  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO engagement_events (id, user_id, event, value, context_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, user.id, event, value ?? null, context ? JSON.stringify(context) : null);

  res.json({ ok: true, id });
});
