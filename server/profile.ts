/**
 * server/profile.ts — Self-service profile endpoints (MySQL)
 *
 * PATCH /api/me/phone — Parent tự cập nhật SĐT để nhận Zalo report.
 *                       Mọi role đều gọi được (audit vẫn ghi), nhưng
 *                       thực tế chỉ PH mới dùng.
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
