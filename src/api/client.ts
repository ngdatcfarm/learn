/**
 * src/api/client.ts — Typed wrapper cho các API endpoints
 *
 * Quy tắc:
 *   - Mọi call qua hàm trong file này (không fetch trực tiếp trong component)
 *   - Token lưu localStorage, auto-attach vào header
 *   - Trả về typed response — component không cần parse JSON
 */

const TOKEN_KEY = "apex_auth_token";
const USER_KEY = "apex_auth_user";

import type { DailyGoalMinutes } from "../utils/roles";

export interface ApiUser {
  id: string;
  username: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  level?: string;
  cefrLevel?: string;
  goal?: string;
  dailyGoalMinutes?: number;
}

export interface SkillState {
  attempts: number;
  lastMeasured: string | null;
  trend: "improving" | "stable" | "declining" | "unknown";
  [metric: string]: number | string | null;
  // Step 2: time-window comparisons
  todayScore: number | null;
  yesterdayScore: number | null;
  todayDelta: number | null;
  weekScore: number | null;
  lastWeekScore: number | null;
  weekDelta: number | null;
}

export interface SkillsResponse {
  skills: Record<string, SkillState>;
  engagement: {
    streak: number;
    avgSessionMinutes: number;
    /** Tổng phút học hôm nay (sum session_end.value từ 00:00 hôm nay). */
    minutesToday: number;
    retryRate: number;
    helpSeekingRate: number;
    dropoutPerTask: number;
    lastActive: string | null;
    totalEvents: number;
  };
}

// ============================================================
// Token management
// ============================================================

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string, user: ApiUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn("Failed to save auth:", e);
  }
}

export function getStoredUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

// ============================================================
// HTTP wrapper
// ============================================================

interface ApiError {
  error: string;
  status: number;
}

async function request<T>(
  method: string,
  path: string,
  body?: any
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearAuth();
    // Có thể trigger re-login UI ở đây
    throw { error: "Phiên đăng nhập hết hạn", status: 401 } as ApiError;
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      // ignore
    }
    throw { error: msg, status: res.status } as ApiError;
  }

  return res.json();
}

// ============================================================
// Auth endpoints
// ============================================================

/**
 * POST /api/auth/login
 * Trả 1 trong 2 shape:
 *   - Bình thường:   { token, expiresAt, user }
 *   - Force change:  { mustChangePassword: true, user }  (KHÔNG có token)
 *
 * Khi force change: caller PHẢI gọi changePasswordFirst(...) để nhận token
 * thật. Helper này KHÔNG tự gọi — để UI (LoginScreen) handle flow đổi pass.
 */
export interface LoginResponse {
  token?: string;
  expiresAt?: string;
  user: ApiUser;
  mustChangePassword?: boolean;
}

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const data = await request<LoginResponse>(
    "POST",
    "/api/auth/login",
    { username, password }
  );
  // Chỉ lưu token khi login bình thường. Force-change thì chưa có token.
  if (data.token && data.user) {
    setToken(data.token, data.user);
  }
  return data;
}

/**
 * POST /api/auth/change-password-first
 * Chỉ dùng sau khi login trả về mustChangePassword=true.
 * Verify current password → set new → issue token bình thường.
 * Set token + user vào localStorage luôn (success path).
 */
export async function changePasswordFirst(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<{ token: string; expiresAt: string; user: ApiUser }> {
  const data = await request<{ token: string; expiresAt: string; user: ApiUser }>(
    "POST",
    "/api/auth/change-password-first",
    { username, currentPassword, newPassword }
  );
  setToken(data.token, data.user);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await request("POST", "/api/auth/logout");
  } catch {
    // ignore
  }
  clearAuth();
}

export async function getMe(): Promise<ApiUser> {
  const data = await request<{ user: ApiUser }>("GET", "/api/auth/me");
  return data.user;
}

// ============================================================
// Skills endpoints
// ============================================================

export async function getMySkills(): Promise<SkillsResponse> {
  return request<SkillsResponse>("GET", "/api/skills/me");
}

export async function getStudentSkills(
  userId: string
): Promise<SkillsResponse> {
  return request<SkillsResponse>("GET", `/api/skills/${userId}`);
}

export async function recordMeasurement(input: {
  skill: "read" | "write" | "listen" | "speak" | "learn";
  metric: string;
  value: number;
  context?: any;
}): Promise<{ ok: boolean; id: string; current: SkillsResponse["skills"] }> {
  return request("POST", "/api/skills/measure", input);
}

// ============================================================
// Engagement endpoints
// ============================================================

export async function trackEvent(
  event: "session_start" | "session_end" | "task_done" | "task_abandoned" | "hint_used",
  value?: number,
  context?: any
): Promise<void> {
  await request("POST", "/api/engagement/track", { event, value, context });
}

// ============================================================
// Dashboard endpoints
// ============================================================

export interface StudentWithStats {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  joined_at: string;
  skills: SkillsResponse["skills"];
  engagement: SkillsResponse["engagement"];
  today: {
    task_done_today: number;
    minutes_today: number;
    measurements_today: number;
  };
  needsHelp: boolean;
  helpReasons: string[];
}

export interface ClassStats {
  totalStudents: number;
  activeToday: number;
  needsHelpCount: number;
  avgSkills: {
    read: number;
    write: number;
    listen: number;
    speak: number;
    learn: number;
  };
  totalMeasurementsThisWeek: number;
  totalMinutesThisWeek: number;
}

export interface TeacherDashboardResponse {
  class: { id: string; name: string; schedule: string | null; description: string | null };
  students: StudentWithStats[];
  count: number;
  classStats: ClassStats;
}

export interface ParentDashboard {
  parent: { id: string; name: string; username: string; phone: string | null };
  children: Array<ParentChild>;
  count: number;
}

export interface ParentChild {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  relationship: string | null;
  skills: SkillsResponse["skills"];
  engagement: SkillsResponse["engagement"];
  today: {
    task_done_today: number;
    minutes_today: number;
    measurements_today: number;
  };
  needsHelp: boolean;
  helpReasons: string[];
}

/**
 * GET /api/dashboard/parent/classes — Step 10h.
 * PH xem các lớp con mình đang học + aggregate stats.
 *
 * Mỗi class card:
 *   - Thông tin lớp (name, teacher, schedule, description)
 *   - total_students (context lớp lớn cỡ nào) + my_children_count
 *   - today aggregate: tổng tasks_done/minutes từ con của PH + số con active
 *   - my_children[]: compact info per child (id, name, streak, needs_help)
 *
 * Sort: lớp có con cần chú ý trước.
 */
export interface ParentClassChild {
  id: string;
  name: string;
  username: string;
  relationship: string | null;
  streak: number;
  needs_help: boolean;
}

export interface ParentClassSummary {
  id: string;
  name: string;
  schedule: string | null;
  description: string | null;
  teacher: { id: string; name: string; username: string } | null;
  total_students: number;
  my_children_count: number;
  my_children: ParentClassChild[];
  today: {
    tasks_done: number;
    minutes: number;
    active_children: number;
  };
}

export interface ParentClassesResponse {
  classes: ParentClassSummary[];
  count: number;
}

/**
 * GET /api/dashboard/teacher — server auto-resolves lớp đầu tiên của GV (admin → lớp bất kỳ).
 * Nếu muốn explicit classId (multi-class GV), dùng /api/dashboard/teacher/:classId sau.
 */
export async function getTeacherDashboard(
  classId?: string | null
): Promise<TeacherDashboardResponse> {
  return request<TeacherDashboardResponse>(
    "GET",
    classId ? `/api/dashboard/teacher/${classId}` : "/api/dashboard/teacher"
  );
}

/** Step 8: lớp mà teacher hiện tại sở hữu (admin thấy tất cả). */
export interface TeacherClassItem {
  id: string;
  name: string;
  schedule: string | null;
  description: string | null;
  member_count: number;
  created_at: string;
}

export async function listMyClasses(): Promise<{ classes: TeacherClassItem[] }> {
  return request("GET", "/api/dashboard/teacher/classes");
}

export async function getParentDashboard(): Promise<ParentDashboard> {
  return request<ParentDashboard>("GET", "/api/dashboard/parent");
}

/**
 * GET /api/dashboard/parent/classes — Step 10h.
 * Xem các lớp mà con của PH đang học, kèm aggregate today stats.
 */
export async function getParentClasses(): Promise<ParentClassesResponse> {
  return request<ParentClassesResponse>("GET", "/api/dashboard/parent/classes");
}

/**
 * PATCH /api/me/phone — Cập nhật SĐT cho user hiện tại (PH dùng để nhận Zalo report).
 * Body: { phone: string | null } — null để xóa
 */
export async function updateMyPhone(
  phone: string | null
): Promise<{ ok: boolean; phone: string | null }> {
  return request("PATCH", "/api/me/phone", { phone });
}

/**
 * PATCH /api/me/password — User tự đổi mật khẩu (đã authenticated).
 * Body: { currentPassword, newPassword }
 *
 * Dùng sau khi user đã force-change lần đầu xong, muốn đổi voluntary.
 * Server verify currentPassword, hash newPassword, UPDATE.
 *
 * Backend: server/profile.ts (PATCH /api/me/password)
 */
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean }> {
  return request("PATCH", "/api/me/password", {
    currentPassword,
    newPassword,
  });
}

// ============================================================
// Admin endpoints (Step 6) — require role="admin"
// ============================================================

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  daily_goal_minutes: number | null;
  phone: string | null;
  created_at: string;
  last_login_at: string | null;
  deleted_at: string | null;
}

export interface AdminOverview {
  userCounts: { student: number; teacher: number; parent: number; admin: number };
  classCount: number;
  needsHelpCount: number;
  recentAudits: Array<{
    id: number;
    actor_id: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details_json: string | null;
    created_at: string;
    actor_name?: string | null;
    actor_username?: string | null;
  }>;
  recentCronRuns: Array<{
    id: number;
    job_name: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    rows_affected: number | null;
    error_message: string | null;
  }>;
}

export interface AdminClass {
  id: string;
  name: string;
  teacher_id: string;
  teacher_name: string | null;
  schedule: string | null;
  description: string | null;
  member_count: number;
  created_at: string;
}

export interface ZaloSettings {
  id: number;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "off";
  send_time: string;
  send_day_of_week: number | null;
  zalo_oa_id: string | null;
  zalo_access_token: string | null;
  zalo_template_id: string | null;
  zalo_template_data_json: string | null;
  include_skills: number;
  include_streak: number;
  include_minutes: number;
  include_needs_help: number;
  custom_message: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details_json: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface CronRun {
  id: number;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_affected: number | null;
  error_message: string | null;
}

export interface AudioRecording {
  id: string;
  user_id: string;
  user_name: string | null;
  username: string | null;
  transcript: string | null;
  audio_duration_ms: number | null;
  expires_at: string | null;
  topic: string | null;
  level: string | null;
  created_at: string;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  level?: string;
  cefr_level?: string;
  goal?: string;
  daily_goal_minutes?: DailyGoalMinutes;
  phone?: string | null;
}

export interface PatchUserPayload {
  name?: string;
  level?: string | null;
  cefr_level?: string | null;
  goal?: string | null;
  daily_goal_minutes?: DailyGoalMinutes | null;
  phone?: string | null;
}

export async function adminOverview(): Promise<AdminOverview> {
  return request<AdminOverview>("GET", "/api/admin/overview");
}

export async function adminListUsers(opts: {
  role?: string;
  search?: string;
  includeDeleted?: boolean;
  parentless?: boolean;
} = {}): Promise<{ users: AdminUser[] }> {
  const params = new URLSearchParams();
  if (opts.role) params.set("role", opts.role);
  if (opts.search) params.set("search", opts.search);
  if (opts.includeDeleted) params.set("deleted", "1");
  if (opts.parentless) params.set("parentless", "1");
  const q = params.toString();
  return request("GET", `/api/admin/users${q ? `?${q}` : ""}`);
}

export async function adminGetUser(id: string): Promise<{
  user: AdminUser;
  classes: any[];
  children: LinkedUser[];
  parents: LinkedUser[];
}> {
  return request("GET", `/api/admin/users/${id}`);
}

/**
 * LinkedUser — dùng cho danh sách PH ↔ HS trong EditUserModal (tab "Quan hệ")
 * và bất kỳ call nào tới adminGetUser. Khớp SELECT children/parents ở server/admin.ts.
 */
export interface LinkedUser {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  relationship: string | null;
}

export async function adminCreateUser(
  payload: CreateUserPayload
): Promise<{ user: AdminUser }> {
  return request("POST", "/api/admin/users", payload);
}

export async function adminPatchUser(
  id: string,
  payload: PatchUserPayload
): Promise<{ user: AdminUser }> {
  return request("PATCH", `/api/admin/users/${id}`, payload);
}

export async function adminDeleteUser(id: string): Promise<{ ok: true }> {
  return request("DELETE", `/api/admin/users/${id}`);
}

export async function adminRestoreUser(id: string): Promise<{ user: AdminUser }> {
  return request("POST", `/api/admin/users/${id}/restore`);
}

export async function adminResetPassword(
  id: string
): Promise<{ ok: boolean; tempPassword: string; user: { id: string; username: string } }> {
  return request("POST", `/api/admin/users/${id}/reset-password`);
}

/**
 * POST /api/admin/users/import — Bulk import users từ CSV.
 * Body: { csv: string }
 *
 * CSV header (required): username, name, role
 * Optional columns: password, level, cefr_level, goal, daily_goal_minutes, phone,
 *                   parent_username (chỉ HS, auto-link với PH có username trùng)
 *
 * Atomic: nếu 1 row lỗi validate → 400 với errors[], KHÔNG insert gì.
 * Sau khi INSERT users thành công → tự động INSERT parent_links nếu student rows
 * có parent_username (cùng transaction). Nếu parent_username không tồn tại / sai role
 * → 400 với errors[] cho link failures, NHƯNG users vẫn đã được tạo (response kèm created[]).
 *
 * Response success:
 *   {
 *     ok: true,
 *     summary: { total, created, links_created },
 *     created: [{ row, id, username, name, role, tempPassword }]
 *   }
 *
 * Response error (validation OR link failures):
 *   { error, errors: [{ row, username, error }], created?, links_created? }
 */
export interface ImportUserResult {
  row: number;
  id: string;
  username: string;
  name: string;
  role: "student" | "parent" | "teacher" | "admin";
  tempPassword: string;
}

export interface ImportUsersResponse {
  ok: true;
  summary: { total: number; created: number; links_created: number };
  created: ImportUserResult[];
}

export interface ImportUsersError {
  row: number;
  username: string;
  error: string;
}

export async function adminImportUsers(
  csv: string
): Promise<ImportUsersResponse> {
  return request<ImportUsersResponse>("POST", "/api/admin/users/import", { csv });
}

export async function adminListClasses(): Promise<{ classes: AdminClass[] }> {
  return request("GET", "/api/admin/classes");
}

export async function adminCreateClass(payload: {
  name: string;
  teacher_id: string;
  schedule?: string;
  description?: string;
}): Promise<{ class: AdminClass }> {
  return request("POST", "/api/admin/classes", payload);
}

export async function adminPatchClass(
  id: string,
  payload: Partial<{
    name: string;
    teacher_id: string;
    schedule: string | null;
    description: string | null;
  }>
): Promise<{ class: AdminClass }> {
  return request("PATCH", `/api/admin/classes/${id}`, payload);
}

export async function adminDeleteClass(id: string): Promise<{ ok: true }> {
  return request("DELETE", `/api/admin/classes/${id}`);
}

export async function adminGetClassMembers(id: string): Promise<{
  students: Array<{
    id: string;
    name: string;
    username: string;
    level: string | null;
    cefr_level: string | null;
    goal: string | null;
    joined_at: string;
  }>;
}> {
  return request("GET", `/api/admin/classes/${id}/members`);
}

export async function adminAddClassMember(
  classId: string,
  studentId: string
): Promise<{ ok: true }> {
  return request("POST", `/api/admin/classes/${classId}/members`, { student_id: studentId });
}

/**
 * Bulk add students vào lớp qua CSV (1 cột: username).
 * Trả về { requested, added, skipped, errors[] }.
 */
export async function adminBulkAddClassMembers(
  classId: string,
  csv: string
): Promise<{
  ok: true;
  requested: number;
  added: number;
  skipped: number;
  errors: { row: number; username: string; error: string }[];
}> {
  return request("POST", `/api/admin/classes/${classId}/members/bulk`, { csv });
}

/**
 * POST /api/admin/classes/import — Bulk import classes + auto-link HS qua CSV.
 *
 * CSV header: class_name, teacher_username (required) + schedule, description, student_usernames (optional)
 * student_usernames dùng `;` làm separator để tránh conflict với CSV comma.
 *
 * Partial success: teacher_username không tồn tại / sai role → row bị skip.
 * student_username không tồn tại → member error, class vẫn tạo.
 *
 * Response success:
 *   {
 *     ok: true,
 *     summary: { total, classes_created, members_added },
 *     created: [{ row, id, class_name, teacher_username }],
 *     errors: [{ row, class_name, error }]
 *   }
 */
export interface ImportClassResult {
  row: number;
  id: string;
  class_name: string;
  teacher_username: string;
}

export interface ImportClassesResponse {
  ok: true;
  summary: { total: number; classes_created: number; members_added: number };
  created: ImportClassResult[];
  errors: { row: number; class_name: string; error: string }[];
}

export interface ImportClassesError {
  row: number;
  class_name: string;
  error: string;
}

export async function adminImportClasses(
  csv: string
): Promise<ImportClassesResponse> {
  return request<ImportClassesResponse>("POST", "/api/admin/classes/import", { csv });
}

export async function adminRemoveClassMember(
  classId: string,
  studentId: string
): Promise<{ ok: true }> {
  return request("DELETE", `/api/admin/classes/${classId}/members/${studentId}`);
}

export async function adminAddParentLink(payload: {
  parent_id: string;
  student_id: string;
  relationship?: string | null;
}): Promise<{ ok: true }> {
  return request("POST", "/api/admin/parent-links", payload);
}

export async function adminRemoveParentLink(
  parentId: string,
  studentId: string
): Promise<{ ok: true; deleted: boolean }> {
  return request("DELETE", `/api/admin/parent-links/${parentId}/${studentId}`);
}

/**
 * GET /api/admin/parent-links/history — Step 10i.
 * Lịch sử các liên kết PH ↔ HS đã soft-delete.
 *
 * Query:
 *   - user_id?: filter theo user liên quan (là PH HOẶC HS)
 *   - limit?: default 50, max 200
 *
 * Mỗi entry gồm thông tin PH/HS/relationship + linked_at + deleted_at + deleted_by (admin).
 */
export interface ParentLinkHistoryEntry {
  parent_id: string;
  parent_name: string;
  parent_username: string;
  student_id: string;
  student_name: string;
  student_username: string;
  relationship: string | null;
  linked_at: string;
  deleted_at: string;
  deleted_by_id: string | null;
  deleted_by_name: string | null;
  deleted_by_username: string | null;
}

export async function adminListParentLinkHistory(params: {
  user_id?: string;
  limit?: number;
} = {}): Promise<{ history: ParentLinkHistoryEntry[]; count: number }> {
  const search = new URLSearchParams();
  if (params.user_id) search.set("user_id", params.user_id);
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return request("GET", `/api/admin/parent-links/history${qs ? `?${qs}` : ""}`);
}

/**
 * POST /api/admin/parent-links/:parentId/:studentId/restore — Step 10i.
 * Restore soft-deleted link. 404 nếu link chưa bị xóa.
 */
export async function adminRestoreParentLink(
  parentId: string,
  studentId: string
): Promise<{ ok: true }> {
  return request("POST", `/api/admin/parent-links/${parentId}/${studentId}/restore`);
}

export async function adminGetZaloSettings(): Promise<{ settings: ZaloSettings }> {
  return request("GET", "/api/admin/settings/zalo");
}

export async function adminPatchZaloSettings(payload: {
  frequency?: ZaloSettings["frequency"];
  send_time?: string;
  send_day_of_week?: number | null;
  zalo_oa_id?: string | null;
  zalo_access_token?: string | null;
  zalo_template_id?: string | null;
  zalo_template_data_json?: string | null;
  include_skills?: boolean;
  include_streak?: boolean;
  include_minutes?: boolean;
  include_needs_help?: boolean;
  custom_message?: string | null;
}): Promise<{ settings: ZaloSettings }> {
  return request("PATCH", "/api/admin/settings/zalo", payload);
}

export async function adminTestZalo(
  recipientId: string,
  data?: Record<string, unknown>
): Promise<{ result: { ok: boolean; stub: true; messageId: string; recipientId: string; templateId: string; sentAt: string } }> {
  return request("POST", "/api/admin/settings/zalo/test", {
    recipient_id: recipientId,
    data,
  });
}

export async function adminListAudit(limit = 50): Promise<{ entries: AuditEntry[] }> {
  return request("GET", `/api/admin/audit?limit=${limit}`);
}

export async function adminListCronRuns(limit = 50): Promise<{ runs: CronRun[] }> {
  return request("GET", `/api/admin/cron-runs?limit=${limit}`);
}

export async function adminListAudio(limit = 50): Promise<{ recordings: AudioRecording[] }> {
  return request("GET", `/api/admin/audio?limit=${limit}`);
}

// ============================================================
// Messaging endpoints (Step 7) — PH ↔ GV/Admin + broadcast
// ============================================================

export interface MessageThread {
  id: string;
  type: "direct" | "broadcast";
  subject: string | null;
  target_class_id: string | null;
  target_class_name: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  last_message_at: string | null;
  last_message: {
    body: string;
    sender_id: string;
    sender_name: string;
    created_at: string;
  } | null;
  unread_count: number;
  participants: Array<{
    id: string;
    name: string;
    role: "student" | "parent" | "teacher" | "admin";
  }>;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "student" | "parent" | "teacher" | "admin";
  body: string;
  created_at: string;
}

export interface CreateDirectThreadPayload {
  recipient_id: string;
  body: string;
}

export interface CreateBroadcastPayload {
  type: "broadcast";
  subject: string;
  target_role: "student" | "parent" | "teacher" | "all";
  target_class_id?: string | null;
  body: string;
}

export async function listThreads(): Promise<{ threads: MessageThread[] }> {
  return request("GET", "/api/messages/threads");
}

export async function listEligibleRecipients(): Promise<{ recipients: ApiUser[] }> {
  return request("GET", "/api/messages/eligible-recipients");
}

export async function getThread(
  id: string
): Promise<{ thread: MessageThread; messages: Message[]; participants: ApiUser[] }> {
  return request("GET", `/api/messages/threads/${id}`);
}

export async function createDirectThread(
  payload: CreateDirectThreadPayload
): Promise<{ thread: MessageThread; message: Message }> {
  return request("POST", "/api/messages/threads", payload);
}

export async function createBroadcast(
  payload: CreateBroadcastPayload
): Promise<{ thread: MessageThread; message: Message }> {
  return request("POST", "/api/messages/threads", payload);
}

export async function sendMessage(
  threadId: string,
  body: string
): Promise<{ message: Message }> {
  return request("POST", `/api/messages/threads/${threadId}/messages`, { body });
}

export async function markThreadRead(
  threadId: string
): Promise<{ ok: boolean; last_read_at: string }> {
  return request("POST", `/api/messages/threads/${threadId}/read`);
}

export async function getUnreadCount(): Promise<{ count: number }> {
  return request("GET", "/api/messages/unread-count");
}

// ============================================================
// Practice endpoints (Step 9c + 9d) — Dictation + Speaking + Shadowing
// ============================================================
// LƯU Ý: SpeakError + SpeakAnalysisResult dưới đây PHẢI khớp với
// server/ai.ts (canonical, có parser logic). Server là nguồn sự thật;
// client re-declare vì FE/BE có type spaces riêng (cùng pattern với
// LearnerSkills mapping trong App.tsx). Nếu thêm field → sửa cả 2 chỗ.

export interface PracticeItem {
  id: string;
  template_type: "dictation" | "speaking" | "shadowing";
  topic: string | null;
  level: string | null;
  text?: string;       // dictation
  prompt?: string;     // speaking
  reference?: string;  // shadowing (câu mẫu để nghe + lặp lại)
}

export interface DictationDiffWord {
  word: string;
  correct: boolean;
}

export interface DictationCheckResult {
  ok: true;
  score: number;
  expected: string;
  userInput: string;
  diff: DictationDiffWord[];
  correctCount: number;
  totalCount: number;
}

export interface SpeakError {
  type: string;
  original: string;
  expected: string;
  hint: string;
}

export interface SpeakAnalysisResult {
  errors: SpeakError[];
  overall_score: number; // 0-10
  encouragement: string;
  raw_text: string;
}

export interface SpeakSubmitResult {
  ok: true;
  recordingId: string;
  transcript: string;
  confidence: "low" | "medium" | "high";
  analysis: SpeakAnalysisResult;
}

export interface ShadowingCheckResult {
  ok: true;
  recordingId: string;
  transcript: string;
  confidence: "low" | "medium" | "high";
  reference: string;
  diff: DictationDiffWord[];
  correctCount: number;
  totalCount: number;
  score: number;       // 0-100, % từ đúng
}

export async function listPracticeItems(
  type: "dictation" | "speaking" | "shadowing"
): Promise<{ items: PracticeItem[] }> {
  return request("GET", `/api/practice/items?type=${type}`);
}

export async function checkDictation(
  itemId: string,
  userInput: string
): Promise<DictationCheckResult> {
  return request("POST", "/api/practice/dictation/check", { itemId, userInput });
}

export async function submitSpeak(payload: {
  itemId: string;
  audioUrl: string;
  durationMs?: number;
  mime?: string;
}): Promise<SpeakSubmitResult> {
  return request("POST", "/api/practice/speak/submit", payload);
}

export async function submitShadowing(payload: {
  itemId: string;
  audioUrl: string;
  durationMs?: number;
  mime?: string;
}): Promise<ShadowingCheckResult> {
  return request("POST", "/api/practice/shadowing/check", payload);
}

// ============================================================
// SRS Flashcard endpoints (Step 9f) — Spaced Repetition System
// ============================================================

export interface FlashcardItem {
  vocabId: string;
  topic: string | null;
  level: string | null;
  term: string;
  phonetic: string | null;
  explanation: string | null;
  example: string | null;
  isNew: boolean;
  review: {
    repetitions: number;
    easeFactor: number;
    intervalDays: number;
    nextReviewAt: string;
  } | null;
}

export interface FlashcardReviewResult {
  ok: true;
  vocabId: string;
  quality: number;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: string;
}

export async function listDueFlashcards(
  limit = 20
): Promise<{ items: FlashcardItem[]; count: number }> {
  return request("GET", `/api/flashcards/due?limit=${limit}`);
}

export async function reviewFlashcard(
  vocabId: string,
  quality: 1 | 3 | 4 | 5
): Promise<FlashcardReviewResult> {
  return request("POST", "/api/flashcards/review", { vocabId, quality });
}

// ============================================================
// Live Help T3 — Cấp 1 (Text hint) (Step 12a)
// ============================================================

export type LiveHelpLevel = "text" | "voice" | "highlight" | "mixed";
export type LiveHelpStatus = "pending" | "active" | "ended";
export type LiveHelpTrigger = "student_request" | "teacher_proactive";
export type LiveHelpOutcome =
  | "understood"
  | "gave_up"
  | "timeout"
  | "teacher_left";

export interface LiveHelpSession {
  id: string;
  class_id: string | null;
  student_id: string;
  teacher_id: string;
  assignment_id: string | null;
  trigger: LiveHelpTrigger;
  level: LiveHelpLevel;
  status: LiveHelpStatus;
  started_at: string | null;
  ended_at: string | null;
  outcome: LiveHelpOutcome | null;
  created_at: string;
  student_name: string;
  student_username: string;
  teacher_name: string;
  teacher_username: string;
  class_name: string | null;
}

export interface LiveHelpHintMessage {
  id: string;
  session_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender_name: string;
  sender_role: "student" | "parent" | "teacher" | "admin";
}

export async function liveHelpRequest(input: {
  assignment_id?: string;
  message?: string;
}): Promise<{ ok: true; session_id: string }> {
  return request("POST", "/api/live/help/request", input);
}

export async function liveHelpTeacherProactive(input: {
  student_id: string;
  message?: string;
}): Promise<{ ok: true; session_id: string }> {
  return request("POST", "/api/live/help/teacher-proactive", input);
}

export async function liveHelpSendHint(
  sessionId: string,
  message: string
): Promise<{ ok: true; hint_id: string }> {
  return request("POST", `/api/live/help/${sessionId}/hint`, { message });
}

export async function liveHelpEnd(
  sessionId: string,
  outcome?: LiveHelpOutcome
): Promise<{ ok: true; already_ended?: boolean }> {
  return request("POST", `/api/live/help/${sessionId}/end`, outcome ? { outcome } : {});
}

export async function liveHelpTeacherQueue(): Promise<{
  sessions: LiveHelpSession[];
  count: number;
}> {
  return request("GET", "/api/live/help/queue");
}

export async function liveHelpStudentMine(): Promise<{
  sessions: LiveHelpSession[];
  count: number;
}> {
  return request("GET", "/api/live/help/mine");
}

export async function liveHelpMessages(sessionId: string): Promise<{
  messages: LiveHelpHintMessage[];
  count: number;
}> {
  return request("GET", `/api/live/help/${sessionId}/messages`);
}

export interface LiveHelpHighlight {
  id: string;
  session_id: string;
  teacher_id: string;
  selector: string;
  color: string;
  note: string | null;
  created_at: string;
}

export async function liveHelpSendHighlight(
  sessionId: string,
  selector: string,
  note?: string | null
): Promise<{ ok: boolean; highlight: LiveHelpHighlight }> {
  return request("POST", `/api/live/help/${sessionId}/highlight`, {
    selector,
    note: note ?? null,
  });
}

export async function liveHelpClearHighlight(
  sessionId: string
): Promise<{ ok: boolean }> {
  return request("POST", `/api/live/help/${sessionId}/highlight/clear`);
}

/**
 * GET /api/live/help/turn-credentials
 * Time-limited TURN credentials cho WebRTC ICE servers.
 * Trả {urls, username, credential, ttl} — dùng để build RTCIceServer.
 * Nếu server chưa cấu hình TURN_SECRET → throw 503 (fallback STUN-only).
 */
export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
}

export async function getTurnCredentials(): Promise<TurnCredentials> {
  return request("GET", "/api/live/help/turn-credentials");
}

// ============================================================
// Step 12d — Teacher Observation Mode + Whiteboard
// ============================================================

/**
 * Status của HS trong active-students list:
 *   - doing_today: last engagement_event < 5 phút trước
 *   - idle: 5-30 phút
 *   - offline: không có event hôm nay hoặc > 30 phút
 */
export type ObserveStatus = "doing_today" | "idle" | "offline";

export interface ActiveStudent {
  id: string;
  name: string;
  username: string;
  level: string | null;
  cefr_level: string | null;
  goal: string | null;
  class_id: string;
  class_name: string;
  status: ObserveStatus;
  last_activity_at: string | null;
  last_activity_minutes_ago: number | null;
  tasks_done_today: number;
  minutes_today: number;
  /** Teacher đang observe HS này (nếu có). */
  currently_observed_by: string | null;
  currently_observed_name: string | null;
}

export interface ActiveStudentsResponse {
  students: ActiveStudent[];
  count: number;
  summary: {
    doing_today: number;
    idle: number;
    offline: number;
  };
}

/**
 * GET /api/live/teach/active-students
 * GV: list HS các lớp mình dạy + status + currently_observed_by.
 * Admin: list tất cả HS.
 */
export async function getActiveStudents(): Promise<ActiveStudentsResponse> {
  return request<ActiveStudentsResponse>(
    "GET",
    "/api/live/teach/active-students"
  );
}

export interface StudentQuestionContext {
  id: string;
  template_type: string;
  topic: string | null;
  level: string | null;
  content: any; // JSON parsed từ question_bank.content_json
  submission: {
    id: string;
    score_pct: number | null;
    submitted_at: string;
  } | null;
}

export interface StudentCurrentSession {
  has_assignment: boolean;
  assignment?: {
    id: string;
    title: string;
    class_id: string;
    class_name: string;
    due_at: string | null;
    instructions: string | null;
  };
  questions?: StudentQuestionContext[];
  total_questions?: number;
}

/**
 * GET /api/live/teach/student/:id/current-session
 * GV: current assignment context của HS + questions + submissions gần nhất.
 */
export async function getStudentCurrentSession(
  studentId: string
): Promise<StudentCurrentSession> {
  return request<StudentCurrentSession>(
    "GET",
    `/api/live/teach/student/${studentId}/current-session`
  );
}

/**
 * Một stroke vẽ trên whiteboard.
 * - color: hex string (vd: "#ef4444")
 * - size: pen width 1-10
 * - points: array [x, y] tọa độ canvas (0-1000 normalize hoặc raw px)
 * - tool: "pen" | "eraser"
 */
export interface WhiteboardStroke {
  tool: "pen" | "eraser";
  color: string;
  size: number;
  points: Array<[number, number]>;
  timestamp: number;
}

/**
 * GET /api/live/help/whiteboard/:sessionId/:questionId
 * Load strokes đã lưu cho (session, question).
 * HS mở lại session có thể xem lại bài giảng của GV.
 */
export async function getWhiteboardStrokes(
  sessionId: string,
  questionId: string
): Promise<{ strokes: WhiteboardStroke[]; count: number; updated_at?: string }> {
  return request(
    "GET",
    `/api/live/help/whiteboard/${sessionId}/${questionId}`
  );
}

/**
 * PUT /api/live/help/whiteboard/:sessionId/:questionId
 * GV: save (upsert) strokes. Gọi khi whiteboard:close hoặc auto-save mỗi 30s.
 */
export async function saveWhiteboardStrokes(
  sessionId: string,
  questionId: string,
  strokes: WhiteboardStroke[]
): Promise<{ ok: true; count: number }> {
  return request(
    "PUT",
    `/api/live/help/whiteboard/${sessionId}/${questionId}`,
    { strokes }
  );
}

// ============================================================
// Step 13b — Class Session ("Lớp hôm nay")
// ============================================================

export interface ClassSessionLite {
  id: string;
  class_id: string;
  teacher_id?: string;
  started_at?: string | null;
  ended_at?: string | null;
  status: "planned" | "active" | "ended" | "cancelled";
}

export interface ClassSessionCountdown {
  label: string;
  approx_minutes: number;
}

export interface ClassSessionReviewPayload {
  summary_md?: string;
  strengths?: string[];
  needs_review?: string[];
  tip_from_teacher_md?: string;
}

export interface ClassSessionReview {
  payload: ClassSessionReviewPayload | null;
  model: string;
  generated_at: string;
}

export interface ClassSessionTodayStudent {
  session: ClassSessionLite | null;
  countdown: ClassSessionCountdown | null;
  review: ClassSessionReview | null;
  class_id: string | null;
}

export interface ClassSessionTodayTeacher {
  active_session: ClassSessionLite | null;
  recent_past: Array<{
    id: string;
    class_id: string;
    started_at: string | null;
    ended_at: string | null;
    status: ClassSessionLite["status"];
  }>;
}

export interface ClassSessionHandup {
  id: string;
  class_session_id: string;
  student_id: string;
  student_name?: string;
  question_id: string | null;
  message: string | null;
  queue_position: number;
  status: "queued" | "claimed" | "dismissed" | "cancelled";
  created_at: string;
  claimed_at: string | null;
}

/**
 * GET /api/class-sessions/today
 * Student: xem có buổi active không + countdown + review hôm qua.
 * Teacher: xem buổi active + recent ended.
 */
export async function getClassSessionToday(): Promise<
  ClassSessionTodayStudent | ClassSessionTodayTeacher
> {
  return request("GET", "/api/class-sessions/today");
}

/**
 * POST /api/class-sessions (teacher)
 * Start class session.
 */
export async function startClassSession(
  classId: string,
  plannedQuestionIds?: string[]
): Promise<{ ok: true; session_id: string; started_at: string }> {
  return request("POST", "/api/class-sessions", {
    class_id: classId,
    planned_question_ids: plannedQuestionIds,
  });
}

/**
 * POST /api/class-sessions/:id/end (teacher)
 */
export async function endClassSession(
  sessionId: string
): Promise<{ ok: true; ended_at?: string; already_ended?: boolean }> {
  return request("POST", `/api/class-sessions/${sessionId}/end`);
}

/**
 * POST /api/class-sessions/:id/hand-up (student)
 */
export async function classHandUp(
  sessionId: string,
  input: { question_id?: string; message?: string } = {}
): Promise<{ ok: true; handup_id: string; queue_position: number }> {
  return request("POST", `/api/class-sessions/${sessionId}/hand-up`, input);
}

/**
 * GET /api/class-sessions/:id/handups (teacher)
 */
export async function classListHandups(
  sessionId: string
): Promise<{ handups: ClassSessionHandup[]; count: number }> {
  return request("GET", `/api/class-sessions/${sessionId}/handups`);
}

/**
 * POST /api/class-sessions/:id/hand-ups/:huId/claim (teacher)
 * → auto-create live_help_session với trigger='class_session'
 */
export async function classClaimHandUp(
  sessionId: string,
  handupId: string
): Promise<{ ok: true; live_help_session_id: string; handup_id: string }> {
  return request(
    "POST",
    `/api/class-sessions/${sessionId}/hand-ups/${handupId}/claim`
  );
}

/**
 * POST /api/class-sessions/:id/board-push (teacher)
 */
export async function classBoardPush(
  sessionId: string,
  input: { student_id: string; question_id?: string; note?: string }
): Promise<{ ok: true; board_id: string; created_at: string }> {
  return request("POST", `/api/class-sessions/${sessionId}/board-push`, input);
}

/**
 * POST /api/class-sessions/:id/board-pushes/:bpId/dismiss-request (student)
 */
export async function classBoardDismissRequest(
  sessionId: string,
  boardId: string
): Promise<{ ok: true; requested_at?: string }> {
  return request(
    "POST",
    `/api/class-sessions/${sessionId}/board-pushes/${boardId}/dismiss-request`
  );
}

/**
 * POST /api/class-sessions/:id/board-pushes/:bpId/dismiss-approve (teacher)
 */
export async function classBoardDismissApprove(
  sessionId: string,
  boardId: string
): Promise<{ ok: true; dismissed_at?: string }> {
  return request(
    "POST",
    `/api/class-sessions/${sessionId}/board-pushes/${boardId}/dismiss-approve`
  );
}

/**
 * POST /api/class-sessions/:id/tab-visibility (student)
 * REST mirror của socket class:tab-visibility event.
 */
export async function classTabVisibility(
  sessionId: string,
  event: "visible" | "hidden",
  visibleMs?: number
): Promise<{ ok: true }> {
  return request("POST", `/api/class-sessions/${sessionId}/tab-visibility`, {
    event,
    visible_ms: visibleMs,
  });
}

/**
 * GET /api/class-sessions/:id/review (student/teacher)
 */
export async function classGetReview(
  sessionId: string
): Promise<{ review: ClassSessionReview | null; session_id: string }> {
  return request("GET", `/api/class-sessions/${sessionId}/review`);
}

/**
 * POST /api/debug/run-class-session-review-now (admin)
 * Debug endpoint để trigger review ngay.
 */
export async function debugRunClassSessionReviewNow(): Promise<{
  ok: true;
  processed: number;
}> {
  return request("POST", "/api/debug/run-class-session-review-now");
}
