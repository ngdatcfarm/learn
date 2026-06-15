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

export interface ClassDashboard {
  class: { id: string; name: string; schedule: string | null; description: string | null };
  students: Array<ApiUser & { skills: SkillsResponse["skills"]; engagement: SkillsResponse["engagement"] }>;
  count: number;
}

export interface ParentDashboard {
  children: Array<ApiUser & { skills: SkillsResponse["skills"]; engagement: SkillsResponse["engagement"] }>;
  count: number;
}

export async function getTeacherDashboard(
  classId: string
): Promise<ClassDashboard> {
  return request<ClassDashboard>("GET", `/api/dashboard/teacher/${classId}`);
}

export async function getParentDashboard(): Promise<ParentDashboard> {
  return request<ParentDashboard>("GET", "/api/dashboard/parent");
}
