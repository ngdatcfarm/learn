/**
 * server/profile.ts — Self-service profile endpoints (MySQL)
 *
 * PATCH /api/me/phone   — Parent tự cập nhật SĐT để nhận Zalo report.
 * PATCH /api/me/password — User tự đổi mật khẩu (sau khi đã force-change lần đầu).
 *
 * Validate phone: optional `+` prefix + 9-15 digits.
 *
 * Khác biệt với SQLite:
 *   - Tất cả route handlers là async
 *   - `db.prepare(...).run()` → `await query(...)`
 */

import { Router, Request, Response } from "express";
import { query, queryOne, ResultSetHeader, RowDataPacket } from "../db/client";
import { requireUser } from "./auth";
import { logAudit } from "./audit";
import { verifyPassword, hashPassword } from "./passwords";

export const profileRouter = Router();

const PHONE_REGEX = /^\+?\d{9,15}$/;

/**
 * PATCH /api/me/phone
 * Body: { phone: string | null }
 * - phone === null hoặc "" → set NULL (xóa SĐT)
 * - phone hợp lệ (9-15 digits, optional +) → set
 * - Mỗi lần save đều ghi audit_log
 */
profileRouter.patch("/phone", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { phone } = req.body || {};

  // Normalize: empty string → null
  const normalized = phone === "" || phone === undefined ? null : phone;

  if (normalized !== null && typeof normalized !== "string") {
    return res.status(400).json({ error: "Số điện thoại không hợp lệ." });
  }
  if (normalized !== null && !PHONE_REGEX.test(String(normalized))) {
    return res
      .status(400)
      .json({ error: "Số điện thoại không hợp lệ (9-15 chữ số, có thể có + ở đầu)." });
  }

  // Đọc phone hiện tại để audit (chỉ khi giá trị thay đổi)
  const current = await queryOne<RowDataPacket & { phone: string | null }>(
    "SELECT phone FROM users WHERE id = ?",
    [user.id]
  );
  const currentPhone = current?.phone ?? null;
  const nextPhone = normalized === null ? null : String(normalized);

  if (currentPhone !== nextPhone) {
    await query<ResultSetHeader>(
      "UPDATE users SET phone = ? WHERE id = ?",
      [nextPhone, user.id]
    );
    await logAudit({
      actorId: user.id,
      action: "user.update_phone",
      targetType: "user",
      targetId: user.id,
      details: {
        role: user.role,
        has_phone: !!nextPhone,
        // Không log raw phone (PII) — chỉ log presence
      },
      ip: req.ip,
    });
  }

  res.json({ ok: true, phone: nextPhone });
});

/**
 * PATCH /api/me/password — User tự đổi mật khẩu (đã authenticated).
 * Body: { currentPassword, newPassword }
 *
 * Verify current password → set new hash + salt + clear must_change_password.
 * KHÔNG kill sessions (user đang dùng app, đổi pass voluntary — khác với admin
 * reset có kill all sessions). Nếu user muốn sign out khỏi thiết bị khác,
 * dùng nút "Đăng xuất" trên thiết bị đó (deferred: device list).
 *
 * Audit `user.change_password` — KHÔNG log raw passwords (PII + security).
 *
 * Validate rules (mirror auth/change-password-first):
 *   - newPassword.length >= 4
 *   - newPassword !== currentPassword
 */
profileRouter.patch("/password", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Thiếu mật khẩu hiện tại hoặc mật khẩu mới." });
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

  // Fetch user's current hash to verify (separate from session lookup)
  const row = await queryOne<
    RowDataPacket & { password_hash: string; password_salt: string }
  >("SELECT password_hash, password_salt FROM users WHERE id = ?", [user.id]);
  if (!row) {
    return res.status(404).json({ error: "Không tìm thấy user." });
  }

  if (!verifyPassword(currentPassword, row.password_salt, row.password_hash)) {
    return res.status(401).json({ error: "Mật khẩu hiện tại không đúng." });
  }

  const { hash, salt } = hashPassword(newPassword);
  await query<ResultSetHeader>(
    `UPDATE users
     SET password_hash = ?, password_salt = ?, must_change_password = 0
     WHERE id = ?`,
    [hash, salt, user.id]
  );

  await logAudit({
    actorId: user.id,
    action: "user.change_password",
    targetType: "user",
    targetId: user.id,
    details: {
      role: user.role,
      // KHÔNG log raw passwords (PII + security risk nếu log bị leak)
    },
    ip: req.ip,
  });

  res.json({ ok: true });
});
