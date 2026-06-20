# Roadmap & Tiến độ dự án `thaoenglish/learn`

> Cập nhật lần cuối: 2026-06-20 (Step 12d Phase 1+2 — GV-driven Observe foundation)
> Mục đích: Theo dõi các Step đã chốt, đang làm, và sắp tới — để mỗi lần quay lại trao đổi đều biết kế hoạch tới đâu.

---

## Tổng quan các Step

| # | Step | Trạng thái | Ghi chú |
|---|------|-----------|---------|
| 0 | SQLite → MySQL migration (cfarm.vn) | ✅ Done 2026-06-15 | `docs/04-deploy-cfarm.md` |
| 1 | Wire measurement API + session tracking | ✅ Done | Commit `d4a53d5` |
| 2 | Today vs yesterday + week vs last week trends | ✅ Done | Commit `0b2d6e9` |
| 3 | Daily goal progress bar (HS) | ✅ Done 2026-06-18 | Commit `6e55b64` — dùng `minutesToday` thật, extract `server/queries/engagement.ts` |
| 4a | Backend: parent phone column + `/parent` dashboard mở rộng | ✅ Done 2026-06-15 | Commit `3f31e8d` |
| 4b | Frontend: ParentDashboard + shared SkillCard | ✅ Done 2026-06-15 | Commit `0973169` |
| 4c | Routing: isParent branch + isStaff rename | ✅ Done 2026-06-15 | Commit `12fa10a` |
| 5 | TeacherDashboard + class matrix view | ✅ Done | Commit `8d6970c` |
| 6 | Admin dashboard + Zalo + parent reports + audio retention | ✅ Done 2026-06-15 | Commit `c7cfa4e` |
| 6.5 | Admin: quản lý liên kết PH ↔ HS qua EditUserModal | ✅ Done 2026-06-16 | Commit `fd56b29` + 4 fix commits → `ccfbb98` |
| 7 | Inbox nội bộ PH ↔ GV/Admin + broadcast | ✅ Done 2026-06-16 | xem `step7-messaging.md` |
| 8 | Multi-class cho GV (backend + FE pill nav) | ✅ Done 2026-06-17 | xem `step8-multi-class.md` |
| 8b | Admin edit phone cho user (EditUserModal + CreateUserModal) | ✅ Done 2026-06-17 | xem `step8b-admin-phone-edit.md` |
| 9a | Audio infra (MediaRecorder + multer + /uploads) | ✅ Done 2026-06-17 | |
| 9b | Gemini multimodal (transcribe + error analysis) | ✅ Done 2026-06-17 | |
| 9c | Dictation + Speaking prompt UI | ✅ Done 2026-06-17 | |
| 9d | Shadowing + useAudioRecorder hook + recordPracticeAttempt | ✅ Done 2026-06-17 | |
| 9e | Voice input cho AILab chat | ✅ Done 2026-06-17 | |
| 9f | SRS flashcard — SM-2 algorithm + 12 seed vocab + UI session | ✅ Done 2026-06-18 | |
| 9g | Tab restructure (PracticeTab 4 mode) + seed 36 practice items | ✅ Done 2026-06-18 | |
| **10a** | **Backup tự động (in-process mysqldump + gzip + rotate 7)** | ✅ **Done 2026-06-18** | xem `docs/04-deploy-cfarm.md` |
| **10c** | **Force change password (v6 migration)** | ✅ **Done 2026-06-18** | Commit `65d4716` — `must_change_password` flag, login trả `mustChangePassword`, new `/api/auth/change-password-first` endpoint. Admin quản lý toàn bộ pass. |
| **10d** | **Voluntary change password** | ✅ **Done 2026-06-18** | Commit `037a7b9` — `PATCH /api/me/password` (verify current + set new). ProfileModal thêm nút "🔑 Đổi mật khẩu" → ChangePasswordModal overlay (3 trường + toggle show/hide). KHÔNG kill sessions (khác admin reset). Refactor: extract `verifyPassword` (timing-safe scrypt) từ auth.ts → `server/passwords.ts`. |
| **10e** | **Bulk import users via CSV** | ✅ **Done 2026-06-19** | Commit `b0cfdfe` — `POST /api/admin/users/import` (CSV parse → validate → multi-row INSERT chunked 500 rows). Atomic: any row error → 400 với errors[], nothing inserted. CSV columns: username, name, role (required) + password, level, cefr_level, goal, daily_goal_minutes, phone (optional). Password optional → auto-gen temp + `must_change_password=1`. 5MB cap. UI: AdminDashboard "Import CSV" button → ImportUsersModal (file upload OR paste + template + copyable temp password table). Refactor: extract `parseAndValidateImport()` helper + `VALID_DAILY_GOALS` constant. |
| **11** | **Streak protection + daily nudge (v7 migration)** | ✅ **Done 2026-06-18** | Commit `b16cc7b` — 2 cron jobs: `streak_freeze` (00:05 auto-apply) + `streakNudge` (19:00 gửi inbox cho PH+GV). `computeEngagement` consult `streak_freezes` để streak không gap khi auto-freeze. Bug fixes: drop `subject` field trên direct-thread INSERT + fix timezone mismatch UTC↔local. Refactor: extract `sendDirectMessage` (messaging.ts) + `isInTimeWindow/formatDateLocal` (`server/utils/time.ts`). Xem `step11-streak-protection.md`. |
| **Polish** | **5 commits ship được ngay (sau Step 10e)** | ✅ **Done 2026-06-19** | Commits `524a1f0` → `0c1d8a4`. Refactor: extract `server/constants.ts` (single source of truth validation) + share `validateUserFields` (errors[] thay throw). Feature: relationship dropdown cố định (mother/father/guardian/other), auto-suggest PH/HS theo họ trong picker, bulk add HS vào lớp qua CSV, parent_username column trong CSV import (auto-link PH ↔ HS). |
| **10f** | **Bulk import classes + auto-link HS qua CSV** | ✅ **Done 2026-06-19** | Commit `69a1101` — `POST /api/admin/classes/import` (CSV parse → 2-phase INSERT class + members trong 1 transaction). CSV columns: class_name, teacher_username, student_usernames (semicolon-separated). Class mới = teacher phải tồn tại + role='teacher' + chưa bị soft-delete. Members insert dùng `INSERT IGNORE` (idempotent nếu HS đã ở lớp). |
| **10g** | **PH multi-class view (Step 10h)** | ✅ **Done 2026-06-19** | Commit `fccb743` — `GET /api/dashboard/parent/classes` (JOIN classes+class_members+parent_links, group by class, aggregate stats: tasks_done/minutes/active_children). Frontend `ClassesSection` mới giữa "Tổng quan" và "Cài đặt", 3 KPI cards + per-class children list với needs_help alert. |
| **10i** | **Lịch sử PH↔HS link (soft-delete + restore)** | ✅ **Done 2026-06-19** | Commit `1e9a30f` — Migration 008 (`deleted_at` + `deleted_by` FK→users + index). DELETE → UPDATE soft-delete. Mới: `GET /api/admin/parent-links/history` + `POST /api/admin/parent-links/:p/:s/restore`. EditUserModal có tab "📜 Lịch sử" thứ 3, restore 1-click với confirm. |
| **12a** | **Live Help T3 — Cấp 1 (Text hint) + Foundation** | ✅ **Done 2026-06-19** | Commit `6e1e796` — 3-commit plan (Text → Highlight → Voice). Migration 009 tạo 3 table (sessions/hints/highlights; highlights anticipate Slice B). 7 endpoint REST (request/teacher-proactive/hint/end/queue/mine/messages) + auto-assign teacher (lớp HS cũ nhất) + Inbox fallback. FE: floating "🆘" cho HS + HelpRequestModal + LiveHelpModal (HS chat) + TeacherLiveHelpPane (slide-in right) + useLiveHelp hook với 3s polling. Slice B (Socket.io + Highlight) + Slice C (WebRTC Voice) sẽ dùng lại schema + hooks. PH không có role. |
| **12b** | **Live Help Cấp 3 — Highlight overlay (Socket.IO realtime)** | ✅ **Done 2026-06-19** | xem `step12b-live-help-highlight.md` |
| **12c** | **Live Help Cấp 2 — Voice call + Screen share (WebRTC P2P + TURN)** | ✅ **Done 2026-06-19** | xem `step12c-live-help-voice-screenshare.md` |
| **12d P1** | **Observe foundation — backend (REST + socket + schema)** | ✅ **Done 2026-06-20** | Commit `774a69b` + `5cee430` + `c194eae`. **Pivot từ HS-driven → GV-driven classroom mode** (xem bên dưới). Migration 010: extend `live_help_sessions.trigger` enum ('teacher_observe') + `live_help_whiteboards` table (UNIQUE session×question, ON DUPLICATE KEY UPDATE). REST: `GET /api/live/teach/active-students` (status doing_today/idle/offline derived từ engagement_events), `GET /api/live/teach/student/:id/current-session` (assignment+questions+submissions), `GET/PUT /api/live/help/whiteboard/:sessionId/:questionId` (GV save, HS review). Socket handlers `/live-help` namespace: `observe:start/:accept/:reject/:end` (1 HS / 1 observe lock), `screen:state/:request-capture`, `whiteboard:open/:stroke/:clear/:close`. User-rooms (`user:${userId}`) cho targeted emits. |
| **12d P2** | **Teacher Dashboard "Lớp đang học" section** | ✅ **Done 2026-06-20** | Commit `1c0be82`. Polling `/active-students` mỗi 10s. Status badges (doing_today/idle/offline), last activity, tasks/min today, `currently_observed_by` badge (disable click nếu GV khác đang xem). LIVE pulse animation. Sort: doing_today → idle → offline. Click row → stub alert. Phase 3 sẽ wire tới `/observe/:studentId`. |

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
- ~~Lịch sử liên kết (chỉ xóa mềm rồi restore)~~ → done 2026-06-19 (commit `1e9a30f` — Step 10i)
- ~~Multi-class cho PH~~ → done 2026-06-19 (commit `fccb743` — Step 10h)
- ~~Auto-suggest PH/HS theo tên con~~ → done 2026-06-19 (commit `d1c3e6a`)
- ~~Relationship options dropdown cố định (mother/father/...) — giữ free-text~~ → done 2026-06-19 (commit `60067d6`, giờ dùng fixed vocab)

---

## Step 12d — GV-driven Classroom Observe Mode (PIVOT)

### Bối cảnh — pivot paradigm
Sau Step 12a/b/c (Live Help theo mô hình HS-driven — HS bấm "Cần hỗ trợ" → GV accept → text/voice/highlight), user nhận ra mô hình này **không phù hợp với T3 — Flipped Classroom**:

1. T3 là HS **đang làm bài** trong lớp. Nếu phải bấm "Cần hỗ trợ" → GV mới vào → HS đã mất 30s-1ph tập trung.
2. Voice call **auto-connect** giữa GV ↔ HS khi GV vào quan sát mới là điều kiện cần để **giảng bài** qua voice real-time.
3. Whiteboard chỉ hữu ích nếu GV **vẽ lên bài tập của HS** (background = câu hỏi HS đang làm) chứ không phải canvas trắng.

→ **Quyết định**: Pivot sang **GV-driven Classroom Mode**. GV dashboard list HS đang làm bài → click vào bất kỳ HS nào → voice auto-connect + view màn hình HS + whiteboard background = câu hỏi HS đang làm.

### Quyết định đã chốt (Q&A với user)
- **Screen view**: Hybrid — JSON state (current question, score) mặc định + screen capture opt-in (GV bấm "Xin quay màn hình" → HS confirm).
- **Voice**: 2-way, cả 2 bên mute được.
- **Whiteboard persistence**: Save per session, HS mở lại session có thể review bài giảng.
- **Multi-observe**: 1 HS / 1 observe tại 1 thời điểm (lock ở `observe:start` handler).

### Các phase
| Phase | Scope | Status |
|---|---|---|
| **P1 Backend** | Migration 010 + 2 REST endpoints (active-students + current-session) + 2 whiteboard endpoints + 10 socket handlers (observe:start/accept/reject/end, screen:state/request-capture, whiteboard:open/stroke/clear/close) + user-rooms | ✅ Done 2026-06-20 |
| **P2 Teacher Dashboard** | `LiveStudentsSection` hiển thị HS các lớp GV dạy + status + click handler stub | ✅ Done 2026-06-20 |
| **P3 Observe Mode (GV)** | Route `/observe/:studentId` + component với voice auto-connect + HS screen state panel + question picker → mở whiteboard | 🔜 Tiếp theo |
| **P4 HS Observer Overlay** | HS nhận `observe:incoming` → confirm/reject → mini overlay hiển thị "GV đang xem" + voice active | 🔜 |
| **P5 Whiteboard component** | Canvas (touch + mouse) + tools (pen/eraser/colors/size) + sync realtime qua `whiteboard:stroke` + autosave 30s + close sync | 🔜 |
| **P6 Voice auto-connect** | Modify `useVoiceCall` để auto-accept khi `observe:accept` từ HS + auto-cleanup khi observe:end | 🔜 |
| **P7 E2E testing + roadmap** | Test full flow 2 thiết bị (1 GV + 1 HS) → update roadmap | 🔜 |

### Kiến trúc kỹ thuật
- **Schema** (`db/migrations/010_live_help_observe.sql`):
  - `ALTER live_help_sessions MODIFY trigger ENUM(...,'teacher_observe')`
  - `live_help_whiteboards` table (id, session_id, question_id, teacher_id, strokes_json LONGTEXT, timestamps). UNIQUE KEY `(session_id, question_id)` → upsert đơn giản với `INSERT ... ON DUPLICATE KEY UPDATE`.
- **REST**:
  - `GET /api/live/teach/active-students` (teacher/admin) — JOIN class_members + engagement_events + LEFT JOIN live_help_sessions (currently_observed_by). Status derived: <5p doing_today / 5-30p idle / >30p offline.
  - `GET /api/live/teach/student/:id/current-session` (teacher/admin) — verify HS thuộc lớp GV (admin bypass) → assignment mới nhất + questions (limit 20) + submissions mới nhất.
  - `GET/PUT /api/live/help/whiteboard/:sessionId/:questionId` — moved từ teachRouter (mount `/api/live/teach`) → liveHelpRouter (mount `/api/live/help`) cho nhất quán với hint/highlight. Commit fix `5cee430`.
- **Socket** (`server/liveHelpSocket.ts`):
  - User-rooms `user:${userId}` join on connection → targeted emits (`socket.to(\`user:${studentId}\`).emit(...)`).
  - `observe:start` (GV) — check lock (existing active teacher_observe session cho student) → INSERT session row → emit `observe:incoming` tới student user-room.
  - `observe:accept` (HS) — join session room → broadcast `observe:ready` → GV initiate voice offer (P6 wires useVoiceCall).
  - `observe:reject` (HS) — UPDATE session outcome='gave_up' → emit `observe:ended`.
  - `observe:end` (either) — UPDATE ended_at + outcome → emit `observe:ended` + cleanup.
  - `screen:state` (HS→GV) — JSON {current_question_id, score_pct, last_action} every ~2s.
  - `screen:request-capture` (GV→HS) — emit, HS confirm qua `getDisplayMedia`.
  - `whiteboard:open/:stroke/:clear/:close` (GV→HS room) — realtime canvas sync. Persist via REST PUT on close.
- **Audit** (PII-safe):
  - `teach.observe.start` / `teach.observe.end` (details: session_id, student_id, outcome, duration_sec)
  - `teach.whiteboard.save` (details: question_id, stroke_count)

---

## Sắp tới (open backlog)

### Ưu tiên cao
- **Zalo OA thật** (Step 6 chỉ có stub). Cần:
  - Đăng ký OA + lấy credentials
  - Swap `server/zalo.ts` từ stub → real ZNS API
  - Test với 1 PH trước khi rollout

### Ưu tiên trung bình
- *(hiện trống — bulk import users + classes + 4 polish items đã done)*

### Ưu tiên thấp
- **Step 7+**: MySQL `GET_LOCK()` cho cron multi-instance (khi scale PM2 cluster)
- **Step 12c TURN**: Thêm TURN server (coturn self-host hoặc Twilio NTS) nếu thực tế thấy P2P fail nhiều trên 4G/CGNAT

> Đã drop: **Off-site backup** — server thuê dịch vụ đã cam kết backup sẵn, không cần tự lo.

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
