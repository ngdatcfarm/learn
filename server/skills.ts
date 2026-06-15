/**
 * server/skills.ts — Skill measurement API
 *
 * Nguyên tắc:
 *   - skill_measurements là APPEND-ONLY (không update, không delete)
 *   - Client chỉ gửi raw event: { skill, metric, value, context }
 *   - Server append, rồi compute current state từ history
 *   - Client không tự tính running average
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { getDb } from "../db/client";
import { requireUser, AuthUser } from "./auth";

const VALID_SKILLS = ["read", "write", "listen", "speak", "learn"] as const;

export const skillsRouter = Router();

/**
 * POST /api/skills/measure
 * Body: { skill, metric, value, context? }
 * Header: Authorization: Bearer <token>
 *
 * Append 1 measurement. Trả về current state (server-computed).
 */
skillsRouter.post("/measure", (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { skill, metric, value, context } = req.body || {};
  if (!VALID_SKILLS.includes(skill)) {
    return res.status(400).json({ error: `skill phải là một trong: ${VALID_SKILLS.join(", ")}` });
  }
  if (!metric || typeof metric !== "string") {
    return res.status(400).json({ error: "Thiếu metric." });
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return res.status(400).json({ error: "value phải là số." });
  }

  const id = crypto.randomUUID();
  const contextJson = context ? JSON.stringify(context) : null;

  getDb()
    .prepare(
      `INSERT INTO skill_measurements (id, user_id, skill, metric, value, context_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, user.id, skill, metric, value, contextJson);

  // Trả về current state cho client refresh
  const current = computeCurrentSkills(user.id);
  res.json({ ok: true, id, current });
});

/**
 * GET /api/skills/me
 * Header: Authorization: Bearer <token>
 * Response: { skills: { read: {...}, write: {...}, ... }, engagement: {...} }
 */
skillsRouter.get("/me", (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({
    skills: computeCurrentSkills(user.id),
    engagement: computeEngagement(user.id),
  });
});

/**
 * GET /api/skills/:userId
 * (Teacher xem HS, PH xem con)
 * Header: Authorization: Bearer <token>
 */
skillsRouter.get("/:userId", (req: Request, res: Response) => {
  const me = requireUser(req, res);
  if (!me) return;
  const targetUserId = req.params.userId;

  // PH chỉ xem được con của mình
  if (me.role === "parent") {
    const isLinked = getDb()
      .prepare("SELECT 1 FROM parent_links WHERE parent_id = ? AND student_id = ?")
      .get(me.id, targetUserId);
    if (!isLinked) {
      return res.status(403).json({ error: "Bạn không có quyền xem học sinh này." });
    }
  }
  // Student chỉ xem được chính mình
  else if (me.role === "student" && me.id !== targetUserId) {
    return res.status(403).json({ error: "Bạn chỉ xem được dữ liệu của mình." });
  }
  // GV: kiểm tra HS có trong lớp mình dạy không
  else if (me.role === "teacher") {
    const teaches = getDb()
      .prepare(
        `SELECT 1 FROM class_members cm
         JOIN classes c ON c.id = cm.class_id
         WHERE cm.student_id = ? AND c.teacher_id = ?`
      )
      .get(targetUserId, me.id);
    if (!teaches) {
      return res.status(403).json({ error: "Học sinh này không thuộc lớp bạn dạy." });
    }
  }

  res.json({
    skills: computeCurrentSkills(targetUserId),
    engagement: computeEngagement(targetUserId),
  });
});

// ============================================================
// SERVER-SIDE COMPUTATIONS — không bao giờ để client tính
// ============================================================

const SKILL_METRICS: Record<string, string[]> = {
  read: ["readSpeed", "readComprehension", "readVocabInContext"],
  write: ["writeGrammar", "writeVocabRange", "writeCoherence", "writeTaskAchievement"],
  listen: ["listenAccuracy", "listenComprehension", "listenSpeedTolerance"],
  speak: ["speakPronunciation", "speakFluency", "speakIntonation", "speakConfidence"],
  learn: ["vocabKnown", "vocabRetention", "vocabActiveUse", "grammarMastery"],
};

interface SkillState {
  attempts: number;
  lastMeasured: string | null;
  trend: "improving" | "stable" | "declining" | "unknown";
  [metric: string]: number | string | null;
}

export function computeCurrentSkills(userId: string): Record<string, SkillState> {
  const db = getDb();
  const out: Record<string, SkillState> = {};

  for (const skill of VALID_SKILLS) {
    const metrics = SKILL_METRICS[skill];
    const state: SkillState = {
      attempts: 0,
      lastMeasured: null,
      trend: "unknown",
    };
    for (const m of metrics) state[m] = 0;

    const rows = db
      .prepare(
        `SELECT metric, value, measured_at FROM skill_measurements
         WHERE user_id = ? AND skill = ? ORDER BY measured_at DESC`
      )
      .all(userId, skill) as { metric: string; value: number; measured_at: string }[];

    if (rows.length === 0) continue;

    // Recent 5 measurements weighted average
    const recent = rows.slice(0, 5);
    const older = rows.slice(5, 10);
    const recentAvg: Record<string, number> = {};
    const olderAvg: Record<string, number> = {};

    for (const r of recent) {
      recentAvg[r.metric] = (recentAvg[r.metric] || 0) + r.value;
    }
    for (const r of older) {
      olderAvg[r.metric] = (olderAvg[r.metric] || 0) + r.value;
    }

    // Count per metric
    const recentCount: Record<string, number> = {};
    const olderCount: Record<string, number> = {};
    for (const r of recent) recentCount[r.metric] = (recentCount[r.metric] || 0) + 1;
    for (const r of older) olderCount[r.metric] = (olderCount[r.metric] || 0) + 1;

    for (const m of metrics) {
      if (recentCount[m]) {
        state[m] = Math.round((recentAvg[m] / recentCount[m]) * 100) / 100;
      }
    }

    state.attempts = rows.length;
    state.lastMeasured = rows[0].measured_at;

    // Trend: so sánh recent vs older
    if (older.length > 0 && recent.length > 0) {
      const sumRecent = recent.reduce((s, r) => s + r.value, 0) / recent.length;
      const sumOlder = older.reduce((s, r) => s + r.value, 0) / older.length;
      const diff = sumRecent - sumOlder;
      if (diff > 2) state.trend = "improving";
      else if (diff < -2) state.trend = "declining";
      else state.trend = "stable";
    }

    out[skill] = state;
  }

  return out;
}

export function computeEngagement(userId: string): {
  streak: number;
  avgSessionMinutes: number;
  retryRate: number;
  helpSeekingRate: number;
  dropoutPerTask: number;
  lastActive: string | null;
  totalEvents: number;
} {
  const db = getDb();
  const events = db
    .prepare(
      `SELECT event, value, occurred_at FROM engagement_events
       WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 500`
    )
    .all(userId) as { event: string; value: number | null; occurred_at: string }[];

  if (events.length === 0) {
    return {
      streak: 0,
      avgSessionMinutes: 0,
      retryRate: 0,
      helpSeekingRate: 0,
      dropoutPerTask: 0,
      lastActive: null,
      totalEvents: 0,
    };
  }

  // Streak: số ngày liên tiếp có ít nhất 1 event (đếm từ hôm nay ngược lại)
  const days = new Set(events.map((e) => e.occurred_at.split(" ")[0]));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (days.has(key)) streak++;
    else if (i > 0) break; // hôm nay chưa có event vẫn tính (HS vừa mở)
  }

  // Avg session minutes
  const sessions = events.filter((e) => e.event === "session_end" && e.value);
  const avgSessionMinutes = sessions.length
    ? Math.round((sessions.reduce((s, e) => s + (e.value || 0), 0) / sessions.length) * 10) / 10
    : 0;

  // Rates
  const hintUsed = events.filter((e) => e.event === "hint_used").length;
  const taskDone = events.filter((e) => e.event === "task_done").length;
  const taskAbandoned = events.filter((e) => e.event === "task_abandoned").length;
  const helpSeekingRate = taskDone > 0 ? hintUsed / taskDone : 0;
  const dropoutPerTask = taskDone + taskAbandoned > 0 ? taskAbandoned / (taskDone + taskAbandoned) : 0;

  return {
    streak,
    avgSessionMinutes,
    retryRate: 0, // TODO: compute từ submissions khi có
    helpSeekingRate: Math.round(helpSeekingRate * 100) / 100,
    dropoutPerTask: Math.round(dropoutPerTask * 100) / 100,
    lastActive: events[0].occurred_at,
    totalEvents: events.length,
  };
}
