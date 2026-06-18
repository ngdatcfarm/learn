/**
 * server/auth.ts — Login, logout, get current user (MySQL)
 *
 * Auth strategy: token-based (server-side sessions table)
 *   - Client gửi username + password → server hash check → trả { token, user }
 *   - Client lưu token vào localStorage
 *   - Mọi request sau gửi `Authorization: Bearer <token>`
 *   - Server lookup token trong auth_sessions table
 *
 * Force change password (v6):
 *   - users.must_change_password = 1: login KHÔNG trả token, chỉ trả
 *     { mustChangePassword: true, user } để client show "đổi pass lần đầu"
 *   - Client gọi POST /api/auth/change-password-first với currentPassword +
 *     newPassword → server verify current, set new hash, clear flag, issue token
 *
 * Password: scrypt (built-in, no extra dep)
 *
 * Khác biệt với SQLite:
 *   - Mọi DB call là async (await query/queryOne)
 *   - Route handlers phải là async
 *   - Không có db.transaction() — dùng BEGIN/COMMIT nếu cần
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { query, queryOne, RowDataPacket, ResultSetHeader } from "../db/client";
import { hashWithSalt, hashPassword } from "./passwords";

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

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const computed = hashWithSalt(password, salt);
  if (computed.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(expectedHash, "hex")
  );
}

async function issueToken(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAtDate = new Date(Date.now() + TOKEN_TTL_MS);
  const expiresAtIso = expiresAtDate.toISOString();
  // MySQL DATETIME expects "YYYY-MM-DD HH:MM:SS" (no T, no Z, no milliseconds)
  const expiresAtMysql = expiresAtDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  await query<ResultSetHeader>(
    "INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    [token, userId, expiresAtMysql]
  );
  return { token, expiresAt: expiresAtIso };
}

export const authRouter = Router();

interface UserRow extends RowDataPacket {
  id: string;
  username: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  daily_goal_minutes: number | null;
  password_hash: string;
  password_salt: string;
  must_change_password: number;
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Response:
 *   - Thường:  { token, expiresAt, user }
 *   - Force change: { mustChangePassword: true, user }  (KHÔNG trả token;
 *     client phải gọi /api/auth/change-password-first)
 */
authRouter.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Thiếu username hoặc password." });
  }

  const row = await queryOne<UserRow>(
    `SELECT id, username, name, role, password_hash, password_salt,
            level, cefr_level, goal, daily_goal_minutes, must_change_password
     FROM users WHERE username = ? AND deleted_at IS NULL`,
    [username]
  );

  if (!row) {
    return res.status(401).json({ error: "Sai username hoặc password." });
  }

  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: "Sai username hoặc password." });
  }

  // Update last_login_at (cả 2 nhánh: force-change và login thường đều count)
  await query<ResultSetHeader>(
    "UPDATE users SET last_login_at = NOW() WHERE id = ?",
    [row.id]
  );

  // Nếu user phải đổi pass lần đầu → KHÔNG cấp token, bắt buộc đổi trước.
  if (row.must_change_password === 1) {
    const { password_hash, password_salt, must_change_password, ...user } = row;
    return res.json({ mustChangePassword: true, user });
  }

  const { token, expiresAt } = await issueToken(row.id);
  const { password_hash, password_salt, must_change_password, ...user } = row;

  res.json({ token, expiresAt, user });
});

/**
 * POST /api/auth/change-password-first
 * Body: { username, currentPassword, newPassword }
 * Chỉ dùng khi user có must_change_password=1 (login trả về mustChangePassword).
 * Verify current password → set new hash + salt + clear flag → issue token bình thường.
 *
 * Response: { token, expiresAt, user }  (giống login bình thường)
 */
authRouter.post("/change-password-first", async (req: Request, res: Response) => {
  const { username, currentPassword, newPassword } = req.body || {};
  if (!username || !currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Thiếu username, currentPassword hoặc newPassword." });
  }
  if (String(newPassword).length < 4) {
    return res
      .status(400)
      .json({ error: "Mật khẩu mới quá ngắn (tối thiểu 4 ký tự)." });
  }
  if (currentPassword === newPassword) {
    return res
      .status(400)
      .json({ error: "Mật khẩu mới phải khác mật khẩu hiện tại." });
  }

  const row = await queryOne<UserRow>(
    `SELECT id, username, name, role, password_hash, password_salt,
            level, cefr_level, goal, daily_goal_minutes, must_change_password
     FROM users WHERE username = ? AND deleted_at IS NULL`,
    [username]
  );

  if (!row) {
    return res.status(401).json({ error: "Sai username hoặc password." });
  }
  if (!verifyPassword(currentPassword, row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: "Mật khẩu hiện tại không đúng." });
  }
  if (row.must_change_password !== 1) {
    // Không phải first-login flow → endpoint này không hợp lệ.
    // Tránh user thường lợi dụng endpoint này để đổi pass (chưa có voluntary flow).
    return res
      .status(400)
      .json({ error: "Endpoint này chỉ dùng cho lần đổi mật khẩu đầu tiên." });
  }

  const { hash, salt } = hashPassword(newPassword);
  await query<ResultSetHeader>(
    `UPDATE users
     SET password_hash = ?, password_salt = ?, must_change_password = 0,
         last_login_at = NOW()
     WHERE id = ?`,
    [hash, salt, row.id]
  );

  const { token, expiresAt } = await issueToken(row.id);
  const { password_hash, password_salt, must_change_password, ...user } = row;
  res.json({ token, expiresAt, user });
});

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 */
authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) return res.status(200).json({ ok: true }); // idempotent
  await query<ResultSetHeader>("DELETE FROM auth_sessions WHERE token = ?", [token]);
  res.json({ ok: true });
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 * Response: { user }
 */
authRouter.get("/me", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
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

interface SessionRow extends RowDataPacket {
  user_id: string;
  expires_at: string;
  id: string;
  username: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  daily_goal_minutes: number | null;
}

export async function requireUser(
  req: Request,
  res: Response
): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Chưa đăng nhập." });
    return null;
  }

  const session = await queryOne<SessionRow>(
    `SELECT s.user_id, s.expires_at, u.id, u.username, u.name, u.role,
            u.level, u.cefr_level, u.goal, u.daily_goal_minutes
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND u.deleted_at IS NULL`,
    [token]
  );

  if (!session) {
    res.status(401).json({ error: "Token không hợp lệ." });
    return null;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await query<ResultSetHeader>("DELETE FROM auth_sessions WHERE token = ?", [token]);
    res.status(401).json({ error: "Session đã hết hạn. Vui lòng đăng nhập lại." });
    return null;
  }

  return {
    id: session.id,
    username: session.username,
    name: session.name,
    role: session.role,
    level: session.level || undefined,
    cefrLevel: session.cefr_level || undefined,
    goal: session.goal || undefined,
    dailyGoalMinutes: session.daily_goal_minutes || undefined,
  };
}

export async function requireRole(
  req: Request,
  res: Response,
  roles: AuthUser["role"][]
): Promise<AuthUser | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    res.status(403).json({ error: "Bạn không có quyền truy cập." });
    return null;
  }
  return user;
}
