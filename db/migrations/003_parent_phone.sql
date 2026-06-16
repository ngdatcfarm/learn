-- =====================================================================
-- MIGRATION v3: Parent phone (Zalo recipient)
-- Step 4 — Parent Dashboard UI + Zalo phone config
--
-- Thêm:
--   users.phone — PH tự nhập SĐT để nhận báo cáo qua Zalo
--                 (Admin cấu hình OA Zalo, PH chỉ cần nhập phone)
--                 (zalo_user_id để sau khi có OA business verify)
--
-- Idempotency: ALTER TABLE không có IF NOT EXISTS (MySQL 8).
-- Migration runner skip cả v3 nếu version=3 đã apply → an toàn.
-- =====================================================================

-- 1. Phone column cho parent (nullable; chỉ PH dùng thực tế, GV/HS có thể NULL)
ALTER TABLE users
  ADD COLUMN phone VARCHAR(20) NULL DEFAULT NULL;
