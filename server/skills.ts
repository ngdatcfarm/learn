/**
 * server/skills.ts — Skill measurement API (MySQL)
 *
 * Nguyên tắc:
 *   - skill_measurements là APPEND-ONLY (không update, không delete)
 *   - Client chỉ gửi raw event: { skill, metric, value, context }
 *   - Server append, rồi compute current state từ history
 *   - Client không tự tính running average
 *
 * Khác biệt với SQLite:
 *   - Tất cả route handlers + compute fns là async
 *   - `db.prepare(...).get()` → `await queryOne(...)`
 *   - `db.prepare(...).all()` → `await query(...)` (trả về array)
 *   - `db.prepare(...).run()` → `await query(...)` (trả về ResultSetHeader)
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { query, queryOne, RowDataPacket, ResultSetHeader } from "../db/client";
import { requireUser, AuthUser } from "./auth";
import { getTodayMinutes } from "./queries/engagement";
import { formatDateLocal } from "./utils/time";

const VALID_SKILLS = ["read", "write", "listen", "speak", "learn"] as const;

export const skillsRouter = Router();

/**
 * POST /api/skills/measure
 * Body: { skill, metric, value, context? }
 * Header: Authorization: Bearer <token>
 */
skillsRouter.post("/measure", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
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

  await query<ResultSetHeader>(
    `INSERT INTO skill_measurements (id, user_id, skill, metric, value, context_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, user.id, skill, metric, value, contextJson]
  );

  const current = await computeCurrentSkills(user.id);
  res.json({ ok: true, id, current });
});

/**
 * GET /api/skills/me
 */
skillsRouter.get("/me", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const [skills, engagement, minutesToday] = await Promise.all([
    computeCurrentSkills(user.id),
    computeEngagement(user.id),
    getTodayMinutes(user.id),
  ]);
  res.json({ skills, engagement: { ...engagement, minutesToday } });
});

/**
 * GET /api/skills/:userId
 * (Teacher xem HS, PH xem con)
 */
skillsRouter.get("/:userId", async (req: Request, res: Response) => {
  const me = await requireUser(req, res);
  if (!me) return;
  const targetUserId = req.params.userId;

  // PH chỉ xem được con của mình
  if (me.role === "parent") {
    const isLinked = await queryOne(
      "SELECT 1 FROM parent_links WHERE parent_id = ? AND student_id = ?",
      [me.id, targetUserId]
    );
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
    const teaches = await queryOne(
      `SELECT 1 FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       WHERE cm.student_id = ? AND c.teacher_id = ?`,
      [targetUserId, me.id]
    );
    if (!teaches) {
      return res.status(403).json({ error: "Học sinh này không thuộc lớp bạn dạy." });
    }
  }

  const [skills, engagement] = await Promise.all([
    computeCurrentSkills(targetUserId),
    computeEngagement(targetUserId),
  ]);
  res.json({ skills, engagement });
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
  // Step 2: time-window comparisons (so với chính mình)
  // todayScore = AVG(value) của các measurements hôm nay
  // todayDelta = % thay đổi so với hôm qua (null nếu chưa có data hôm qua)
  todayScore: number | null;
  yesterdayScore: number | null;
  todayDelta: number | null;
  weekScore: number | null;
  lastWeekScore: number | null;
  weekDelta: number | null;
}

interface MeasurementRow extends RowDataPacket {
  metric: string;
  value: number;
  measured_at: string;
}

/**
 * AVG(value) của 1 skill trong 1 cửa sổ thời gian định nghĩa sẵn.
 * Dùng CURDATE() + INTERVAL n DAY trong MySQL → timezone-safe.
 *
 * 4 cửa sổ:
 *   - today:       [today 00:00,         tomorrow 00:00)        — hôm nay
 *   - yesterday:   [yesterday 00:00,     today 00:00)           — hôm qua
 *   - thisWeek:    [7 days ago 00:00,    today 00:00)           — 7 ngày gần nhất
 *   - lastWeek:    [14 days ago 00:00,   7 days ago 00:00)      — 7 ngày trước đó
 */
type Window = "today" | "yesterday" | "thisWeek" | "lastWeek";

async function avgInWindow(
  userId: string,
  skill: string,
  window: Window
): Promise<number | null> {
  const whereClause: Record<Window, string> = {
    today:
      "measured_at >= CURDATE() AND measured_at < CURDATE() + INTERVAL 1 DAY",
    yesterday:
      "measured_at >= CURDATE() - INTERVAL 1 DAY AND measured_at < CURDATE()",
    thisWeek:
      "measured_at >= CURDATE() - INTERVAL 7 DAY AND measured_at < CURDATE()",
    lastWeek:
      "measured_at >= CURDATE() - INTERVAL 14 DAY AND measured_at < CURDATE() - INTERVAL 7 DAY",
  };
  const row = (await queryOne<RowDataPacket & { avg_value: number | null; cnt: number }>(
    `SELECT AVG(value) AS avg_value, COUNT(*) AS cnt
     FROM skill_measurements
     WHERE user_id = ?
       AND skill = ?
       AND ${whereClause[window]}`,
    [userId, skill]
  )) as { avg_value: number | null; cnt: number } | undefined;
  if (!row || !row.cnt || row.avg_value == null) return null;
  return Math.round(row.avg_value * 100) / 100;
}

/**
 * Tính % delta giữa 2 giá trị.
 *   - a hoặc b = null  → null (chưa đủ dữ liệu)
 *   - a = 0 và b > 0   → -100 (giảm hoàn toàn)
 *   - a > 0 và b = 0   → 100  (tăng từ 0, không chia được)
 *   - b = 0 và a = 0   → 0
 *   - normal           → ((a - b) / |b|) * 100
 */
function pctDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  if (a === 0 && b === 0) return 0;
  if (b === 0) return 100; // tăng từ 0
  return Math.round(((a - b) / Math.abs(b)) * 1000) / 10; // 1 chữ số thập phân
}

export async function computeCurrentSkills(
  userId: string
): Promise<Record<string, SkillState>> {
  const out: Record<string, SkillState> = {};

  for (const skill of VALID_SKILLS) {
    const metrics = SKILL_METRICS[skill];
    const state: SkillState = {
      attempts: 0,
      lastMeasured: null,
      trend: "unknown",
      todayScore: null,
      yesterdayScore: null,
      todayDelta: null,
      weekScore: null,
      lastWeekScore: null,
      weekDelta: null,
    };
    for (const m of metrics) state[m] = 0;

    const rows = (await query<MeasurementRow[]>(
      `SELECT metric, value, measured_at FROM skill_measurements
       WHERE user_id = ? AND skill = ? ORDER BY measured_at DESC`,
      [userId, skill]
    )) as MeasurementRow[];

    if (rows.length === 0) {
      out[skill] = state;
      continue;
    }

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

  // Time-window comparisons (song song cho 5 skills)
  await Promise.all(
    VALID_SKILLS.map(async (skill) => {
      const [today, yesterday, week, lastWeek] = await Promise.all([
        avgInWindow(userId, skill, "today"),
        avgInWindow(userId, skill, "yesterday"),
        avgInWindow(userId, skill, "thisWeek"),
        avgInWindow(userId, skill, "lastWeek"),
      ]);
      const s = out[skill];
      s.todayScore = today;
      s.yesterdayScore = yesterday;
      s.todayDelta = pctDelta(today, yesterday);
      s.weekScore = week;
      s.lastWeekScore = lastWeek;
      s.weekDelta = pctDelta(week, lastWeek);
    })
  );

  return out;
}

interface EngagementEventRow extends RowDataPacket {
  event: string;
  value: number | null;
  occurred_at: string;
}

interface FreezeDateRow extends RowDataPacket {
  used_for_date: string; // "YYYY-MM-DD" qua DATE_FORMAT
}

export async function computeEngagement(userId: string): Promise<{
  streak: number;
  avgSessionMinutes: number;
  retryRate: number;
  helpSeekingRate: number;
  dropoutPerTask: number;
  lastActive: string | null;
  totalEvents: number;
}> {
  // Parallel: events (giới hạn 500 mới nhất) + frozen dates (all time)
  const [events, freezeRows] = await Promise.all([
    query<EngagementEventRow[]>(
      `SELECT event, value, occurred_at FROM engagement_events
       WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 500`,
      [userId]
    ),
    query<FreezeDateRow[]>(
      `SELECT DATE_FORMAT(used_for_date, '%Y-%m-%d') AS used_for_date
       FROM streak_freezes WHERE user_id = ?`,
      [userId]
    ),
  ]);

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
  // MySQL DATETIME trả về "YYYY-MM-DD HH:MM:SS" khi dateStrings: true (server timezone)
  // Frozen days (Step 11) cũng count như "had activity" → tránh streak đứt khi HS được auto-freeze
  // Dùng formatDateLocal (LOCAL TIME) để lookup key khớp với dates trả về từ MySQL.
  const days = new Set<string>(events.map((e) => e.occurred_at.split(" ")[0]));
  for (const f of freezeRows as FreezeDateRow[]) days.add(f.used_for_date);
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatDateLocal(d);
    if (days.has(key)) streak++;
    else if (i > 0) break;
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
    retryRate: 0,
    helpSeekingRate: Math.round(helpSeekingRate * 100) / 100,
    dropoutPerTask: Math.round(dropoutPerTask * 100) / 100,
    lastActive: events[0].occurred_at,
    totalEvents: events.length,
  };
}
