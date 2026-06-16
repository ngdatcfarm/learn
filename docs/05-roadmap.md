# Roadmap & Tiến độ dự án `thaoenglish/learn`

> Cập nhật lần cuối: 2026-06-16
> Mục đích: Theo dõi các Step đã chốt, đang làm, và sắp tới — để mỗi lần quay lại trao đổi đều biết kế hoạch tới đâu.

---

## Tổng quan các Step

| # | Step | Trạng thái | Ghi chú |
|---|------|-----------|---------|
| 0 | SQLite → MySQL migration (cfarm.vn) | ✅ Done 2026-06-15 | `docs/04-deploy-cfarm.md` |
| 1 | Wire measurement API + session tracking | ✅ Done | Commit `d4a53d5` |
| 2 | Today vs yesterday + week vs last week trends | ✅ Done | Commit `0b2d6e9` |
| 3 | Daily goal progress bar (HS) | ⏸ Skipped | Tạm hoãn để ưu tiên Step 5/6 |
| 4a | Backend: parent phone column + `/parent` dashboard mở rộng | ✅ Done 2026-06-15 | Commit `3f31e8d` |
| 4b | Frontend: ParentDashboard + shared SkillCard | ✅ Done 2026-06-15 | Commit `0973169` |
| 4c | Routing: isParent branch + isStaff rename | ✅ Done 2026-06-15 | Commit `12fa10a` |
| 5 | TeacherDashboard + class matrix view | ✅ Done | Commit `8d6970c` |
| 6 | Admin dashboard + Zalo + parent reports + audio retention | ✅ Done 2026-06-15 | Commit `c7cfa4e` |
| **6.5** | **Admin: quản lý liên kết PH ↔ HS qua EditUserModal** | ✅ **Done 2026-06-16** | Commit `fd56b29` + 4 fix commits → `ccfbb98` |

---

## Step 6.5 — Admin: Quản lý liên kết PH ↔ HS

### Bối cảnh
Sau Step 4 (Parent Dashboard), PH đã có UI riêng xem được data con. Nhưng admin **không có cách nào** tạo/xóa/sửa `parent_links` trong DB — chỉ seed data mới có sẵn ở `db/seed.ts:97-110` (1 PH ↔ Nguyên). Mọi thao tác liên kết PH ↔ HS phải SQL thủ công → không sustainable khi onboarding HS mới, đổi PH phụ trách, HS nghỉ học, v.v.

### Quyết định đã chốt
- **UI placement**: Tab "Quan hệ" trong `EditUserModal` (Option 1) — không tạo modal mới
- **Endpoint shape**: Flat `/api/admin/parent-links` (không nhập nhằng role)
- **DELETE semantics**: Idempotent (200 dù link không tồn tại) — an toàn cho double-click
- **Commits**: 1 commit chính + các commit fix riêng
- **Relationship validation**: Optional, free-text, max 16 char (match schema VARCHAR(16))
- **Picker behavior** (sau debug): Khi admin edit **parent** → chỉ hiện HS chưa có PH nào (parentless filter). Khi admin edit **student** → hiện tất cả PH chưa liên kết với HS này.

### Backend (`server/admin.ts`)
- ✅ Fix `GET /api/admin/users/:id` — children query thêm `pl.relationship`
- ✅ `POST /api/admin/parent-links` — validate parent+student role, check duplicate, audit `parent_link.add`
- ✅ `DELETE /api/admin/parent-links/:parentId/:studentId` — idempotent, audit `parent_link.remove`
- ✅ Thêm `parentless=1` query param cho `adminListUsers` → filter HS không có PH nào

### Frontend (`src/api/client.ts` + `src/components/AdminUserModals.tsx`)
- ✅ `adminAddParentLink` + `adminRemoveParentLink` trong `src/api/client.ts`
- ✅ `LinkedUser` interface exported, `adminGetUser` return type updated
- ✅ `EditUserModal` refactor: 2-tab nav ("Thông tin" / "Quan hệ"), chỉ hiện tab Quan hệ với role student/parent
- ✅ `RelationshipsSection` sub-component + `PickerCandidate` sub-component
- ✅ Pill segmented control style (copy từ AdminDashboard)
- ✅ ModalShell sizing `max-w-2xl` khi ở tab Quan hệ, `max-w-lg` khi Thông tin

### Bugs đã fix (qua 5 commit riêng)
1. **`as LinkedUser[]` cast thừa** — refactor typing trong `client.ts`
2. **Spurious `key?` prop** — chỉ `PickerCandidate` cần (cho `.map()`), `RelationshipsSection` thì không
3. **`Data too long for column 'target_id'`** — composite ID `${parentId}/${studentId}` (73 char) > VARCHAR(36). Fix: `targetId = student_id` (1 ID duy nhất), full context vào `details_json` (LONGTEXT)
4. **Picker hoàn toàn trống** — debug session, log fetch
5. **Picker chỉ hiện list sau khi search** — 2 useEffect tách rời, effect initial-mount miss `pickerOpen=true`. Fix: gộp thành 1 effect deps `[pickerOpen, search, oppositeRole, isParent]`, `setTimeout(0)` khi mở picker, `setTimeout(250)` khi search

### Commits
```
ccfbb98 fix: fetch candidates when picker opens (not just on section mount)
acb3683 debug: add candidate count indicator to picker
eac76bb fix: more informative empty state for parent-link picker
83f6b31 fix: show parentless students in parent-link picker (fetch + filter)
fd56b29 feat: admin can manage parent-student links via EditUserModal
```

### Verification (đã chạy local + push lên cfarm)
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` clean
- ✅ Manual test: Edit PH → tab Quan hệ → thêm HS mới (An) thành công → Bỏ liên kết thành công
- ✅ Audit log có 3 row: `parent_link.add`, `parent_link.remove`
- ✅ Regression: HS UI, Teacher UI, Parent UI không bị ảnh hưởng

### Out of scope (deferred)
- Bulk add nhiều PH ↔ HS cùng lúc
- Lịch sử liên kết (chỉ xóa mềm rồi restore)
- Auto-suggest PH/HS theo tên con
- Multi-class cho PH
- Relationship options dropdown cố định (mother/father/...) — giữ free-text

---

## Sắp tới (open backlog)

### Ưu tiên cao
- **Zalo OA thật** (Step 6 chỉ có stub). Cần:
  - Đăng ký OA + lấy credentials
  - Swap `server/zalo.ts` từ stub → real ZNS API
  - Test với 1 PH trước khi rollout
- **Backup tự động** — MySQL dump hàng ngày qua cron job (xem `docs/04-deploy-cfarm.md`). Chưa set up.

### Ưu tiên trung bình
- **Step 3 — Daily goal progress bar (HS)** — đã skip từ lâu. Hiện `dailyGoalMinutes` đã có ở API + `DAILY_GOAL_OPTIONS` đã có ở FE; chỉ thiếu progress bar component.
- **Multi-class cho GV** — hiện `GET /api/dashboard/teacher` auto-resolve lớp đầu tiên. Cần UI chọn lớp khi GV dạy ≥ 2 lớp.
- **Force change password** sau khi admin reset — hiện user có thể giữ temp password mãi. Cần flow "đổi MK lần đầu".

### Ưu tiên thấp
- **Step 7+**: MySQL `GET_LOCK()` cho cron multi-instance (khi scale PM2 cluster)
- **Password reset request** — bảng `password_reset_requests` để user tự yêu cầu reset, admin duyệt
- **Relationship dropdown** cố định (mother/father/guardian/other) thay vì free-text
- **Bulk import users** từ CSV

---

## Test accounts (sau seed)

| Role | Username | Password | Note |
|------|----------|----------|------|
| admin | admin | admin123 | |
| teacher | teacher1 | teacher123 | Dạy lớp duy nhất |
| student | nguyen | nguyen123 | Có data mẫu, PH = phuhuynh1 |
| student | an | an123 | |
| student | binh | binh123 | |
| parent | phuhuynh1 | ph123 | Linked với Nguyên |

## Build/run

- Dev: `npm install` → `npm run setup` → `npm run dev`
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Seed: `npm run db:seed`
- Deploy cloud: `git pull && npm install && npm run setup && npm run build && pm2 restart learn`

## Memory

Cross-session memory ở `C:\Users\nguye\.claude\projects\E--thaoenglish-learn\memory\MEMORY.md` — cập nhật theo từng step quan trọng (đã có patterns cho Step 4 + Step 6).
