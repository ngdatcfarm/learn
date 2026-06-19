-- =====================================================================
-- 008_parent_link_history.sql — Soft-delete + restore cho parent_links
--
-- Trước: DELETE /api/admin/parent-links/:parentId/:studentId → hard delete
--   → không có lịch sử → admin không thể restore nếu lỡ tay xóa nhầm.
--
-- Nay:
--   - deleted_at DATETIME NULL: timestamp soft-delete (NULL = link còn active)
--   - deleted_by VARCHAR(36) NULL: admin id đã xóa (FK tới users.id)
--   - Index idx_parent_links_deleted để query history nhanh
--
-- Lưu ý: các SELECT query hiện tại phải thêm `AND pl.deleted_at IS NULL`
-- để tránh trả về link đã xóa. Xem commit message để biết danh sách file
-- bị ảnh hưởng (server/admin.ts: GET /users/:id parents/children queries).
-- =====================================================================

ALTER TABLE parent_links
  ADD COLUMN deleted_at DATETIME NULL AFTER relationship,
  ADD COLUMN deleted_by VARCHAR(36) NULL AFTER deleted_at;

ALTER TABLE parent_links
  ADD KEY idx_parent_links_deleted (deleted_at);

-- FK deleted_by → users(id). ON DELETE SET NULL vì nếu admin bị xóa thì vẫn
-- giữ lịch sử.
ALTER TABLE parent_links
  ADD CONSTRAINT fk_pl_deleted_by FOREIGN KEY (deleted_by)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;