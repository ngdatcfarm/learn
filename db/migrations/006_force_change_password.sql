-- =====================================================================
-- MIGRATION v6: Force change password on first login
-- Admin manages all passwords; every new user must change on first login.
--
-- Thêm:
--   users.must_change_password — flag (0/1). Khi 1: login KHÔNG trả token,
--   chỉ trả { mustChangePassword: true, user }. Client phải gọi
--   POST /api/auth/change-password-first với currentPassword + newPassword
--   để nhận token.
--
-- Default 0 cho mọi user hiện tại (backwards compatible — không ép user cũ
-- đổi pass). User MỚI tạo qua admin endpoint sẽ được set = 1 (force change).
-- Seed ban đầu cũng set = 1 cho tất cả tài khoản mẫu.
--
-- Idempotency: ALTER TABLE không có IF NOT EXISTS (MySQL 8).
-- Migration runner skip cả v6 nếu version=6 đã apply → an toàn.
-- =====================================================================

ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0
  AFTER password_salt;
