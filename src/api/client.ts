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
 * PATCH /api/me/phone — Cập nhật SĐT cho user hiện tại (PH dùng để nhận Zalo report).
 * Body: { phone: string | null } — null để xóa
 */
export async function updateMyPhone(
  phone: string | null
): Promise<{ ok: boolean; phone: string | null }> {
  return request("PATCH", "/api/me/phone", { phone });
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
): Promise<{ ok: true }> {
  return request("DELETE", `/api/admin/parent-links/${parentId}/${studentId}`);
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
