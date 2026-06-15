/**
 * server/auth.ts — Login, logout, get current user
 *
 * Auth strategy: token-based (server-side sessions table)
 *   - Client gửi username + password → server hash check → trả { token, user }
 *   - Client lưu token vào localStorage
 *   - Mọi request sau gửi `Authorization: Bearer <token>`
 *   - Server lookup token trong auth_sessions table
 *
 * Password: scrypt (built-in, no extra dep)
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { getDb } from "../db/client";

const TOKEN_TTL_DAYS = 30;
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  level?: string;
  cefrLevel?: string;
  goal?: string;
  dailyGoalMinutes?: number;
}

function hashPassword(
  password: string,
  saltHex: string
): string {
  return crypto.scryptSync(password, saltHex, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const computed = hashPassword(password, salt);
  // timing-safe comparison
  if (computed.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(expectedHash, "hex")
  );
}

function issueToken(userId: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  getDb()
    .prepare("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, expiresAt);
  return { token, expiresAt };
}

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Response: { token, user }
 */
authRouter.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Thiếu username hoặc password." });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, username, name, role, password_hash, password_salt,
              level, cefr_level, goal, daily_goal_minutes
       FROM users WHERE username = ?`
    )
    .get(username) as
    | (AuthUser & { password_hash: string; password_salt: string })
    | undefined;

  if (!row) {
    return res.status(401).json({ error: "Sai username hoặc password." });
  }

  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: "Sai username hoặc password." });
  }

  // Update last_login_at
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(
    row.id
  );

  const { token, expiresAt } = issueToken(row.id);
  const { password_hash, password_salt, ...user } = row as any;

  res.json({ token, expiresAt, user });
});

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 */
authRouter.post("/logout", (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) return res.status(200).json({ ok: true }); // idempotent
  getDb().prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
  res.json({ ok: true });
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 * Response: { user }
 */
authRouter.get("/me", (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ user });
});

// ============================================================
// Helpers — dùng bởi các router khác
// ============================================================

export function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export function requireUser(req: Request, res: Response): AuthUser | null {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Chưa đăng nhập." });
    return null;
  }

  const db = getDb();
  const session = db
    .prepare(
      `SELECT s.user_id, s.expires_at, u.id, u.username, u.name, u.role,
              u.level, u.cefr_level, u.goal, u.daily_goal_minutes
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as any;

  if (!session) {
    res.status(401).json({ error: "Token không hợp lệ." });
    return null;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
    res.status(401).json({ error: "Session đã hết hạn. Vui lòng đăng nhập lại." });
    return null;
  }

  return {
    id: session.id,
    username: session.username,
    name: session.name,
    role: session.role,
    level: session.level,
    cefrLevel: session.cefr_level,
    goal: session.goal,
    dailyGoalMinutes: session.daily_goal_minutes,
  };
}

export function requireRole(
  req: Request,
  res: Response,
  roles: AuthUser["role"][]
): AuthUser | null {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    res.status(403).json({ error: "Bạn không có quyền truy cập." });
    return null;
  }
  return user;
}
