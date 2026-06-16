/**
 * server/passwords.ts — Centralized password hashing (scrypt)
 *
 * Step 6 extraction: dùng chung cho auth, admin (reset password), seed, setup.
 * Format: { hash, salt } cả 2 đều hex string.
 * Algorithm: scryptSync với N=default (Node built-in, no extra dep).
 */
import crypto from "node:crypto";

export function hashPassword(
  password: string
): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

/**
 * Low-level hash 1 chiều (giữ để auth.ts verify chính xác).
 */
export function hashWithSalt(password: string, saltHex: string): string {
  return crypto.scryptSync(password, saltHex, 64).toString("hex");
}

/**
 * Tạo mật khẩu tạm thời readable: 10 ký tự [a-z0-9].
 * Dùng cho admin reset password endpoint.
 */
export function generateTempPassword(): string {
  return crypto
    .randomBytes(8)
    .toString("base64")
    .replace(/[+/=]/g, "")
    .slice(0, 10)
    .toLowerCase();
}
