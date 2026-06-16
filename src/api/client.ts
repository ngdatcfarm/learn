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

export async function login(
  username: string,
  password: string
): Promise<{ token: string; user: ApiUser }> {
  const data = await request<{ token: string; user: ApiUser }>(
    "POST",
    "/api/auth/login",
    { username, password }
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
  children: Array<ApiUser & { skills: SkillsResponse["skills"]; engagement: SkillsResponse["engagement"] }>;
  count: number;
}

/**
 * GET /api/dashboard/teacher — server auto-resolves lớp đầu tiên của GV (admin → lớp bất kỳ).
 * Nếu muốn explicit classId (multi-class GV), dùng /api/dashboard/teacher/:classId sau.
 */
export async function getTeacherDashboard(): Promise<TeacherDashboardResponse> {
  return request<TeacherDashboardResponse>("GET", "/api/dashboard/teacher");
}

export async function getParentDashboard(): Promise<ParentDashboard> {
  return request<ParentDashboard>("GET", "/api/dashboard/parent");
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
}

export interface PatchUserPayload {
  name?: string;
  level?: string | null;
  cefr_level?: string | null;
  goal?: string | null;
  daily_goal_minutes?: DailyGoalMinutes | null;
}

export async function adminOverview(): Promise<AdminOverview> {
  return request<AdminOverview>("GET", "/api/admin/overview");
}

export async function adminListUsers(opts: {
  role?: string;
  search?: string;
  includeDeleted?: boolean;
} = {}): Promise<{ users: AdminUser[] }> {
  const params = new URLSearchParams();
  if (opts.role) params.set("role", opts.role);
  if (opts.search) params.set("search", opts.search);
  if (opts.includeDeleted) params.set("deleted", "1");
  const q = params.toString();
  return request("GET", `/api/admin/users${q ? `?${q}` : ""}`);
}

export async function adminGetUser(id: string): Promise<{
  user: AdminUser;
  classes: any[];
  children: any[];
  parents: any[];
}> {
  return request("GET", `/api/admin/users/${id}`);
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
