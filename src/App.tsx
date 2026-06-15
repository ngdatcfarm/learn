import { useState, useEffect, useRef, createContext, useContext } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  Layers,
  Volume2,
  VolumeX,
  UserSquare2,
  Sun,
  Moon,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import {
  UserProfile,
  DEFAULT_SKILLS,
  DEFAULT_ENGAGEMENT,
  LearnerSkills,
  EngagementMetrics,
  SkillId,
} from "./types";
import sound from "./utils/sound";
import {
  ApiUser,
  getToken,
  clearAuth,
  getMe,
  getMySkills,
  logout as apiLogout,
  trackEvent,
  SkillsResponse,
  SkillState,
} from "./api/client";

import Dashboard from "./components/Dashboard";
import CoursesTab from "./components/CoursesTab";
import AILabTab from "./components/AILabTab";
import ProfileModal from "./components/ProfileModal";
import LoginScreen from "./components/LoginScreen";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

// ============================================================
// Mappers: API shape → UI shape
// ============================================================

function mapSkillState(skillId: SkillId, s: SkillState | undefined): any {
  // Bắt đầu từ DEFAULT_SKILLS của skill đó (đảm bảo đủ fields + đúng type)
  const base: any = { ...(DEFAULT_SKILLS as any)[skillId] };
  if (!s) return base;
  // Merge các field numeric từ server vào
  for (const [k, v] of Object.entries(s)) {
    if (k === "trend") {
      base.trend = v;
    } else if (k === "lastMeasured") {
      base.lastMeasured = (v as string) || undefined;
    } else if (k === "attempts") {
      base.attempts = typeof v === "number" ? v : 0;
    } else {
      // metric khác (readSpeed, writeGrammar, …) — chỉ nhận number
      if (typeof v === "number") base[k] = v;
    }
  }
  return base;
}

function mapSkillsResponse(res: SkillsResponse): { skills: LearnerSkills; engagement: EngagementMetrics } {
  const skills: LearnerSkills = {
    read: mapSkillState("read", res.skills?.read) as LearnerSkills["read"],
    write: mapSkillState("write", res.skills?.write) as LearnerSkills["write"],
    listen: mapSkillState("listen", res.skills?.listen) as LearnerSkills["listen"],
    speak: mapSkillState("speak", res.skills?.speak) as LearnerSkills["speak"],
    learn: mapSkillState("learn", res.skills?.learn) as LearnerSkills["learn"],
  };
  const e = res.engagement || ({} as SkillsResponse["engagement"]);
  const engagement: EngagementMetrics = {
    streak: e.streak ?? 0,
    avgSessionMinutes: e.avgSessionMinutes ?? 0,
    retryRate: e.retryRate ?? 0,
    helpSeekingRate: e.helpSeekingRate ?? 0,
    dropoutPerTask: e.dropoutPerTask ?? 0,
    lastActive: e.lastActive || undefined,
  };
  return { skills, engagement };
}

function buildProfileFromUser(user: ApiUser, skills: LearnerSkills, engagement: EngagementMetrics): UserProfile {
  const level = (user.level as UserProfile["level"]) || "Beginner";
  const dailyGoal = ([5, 15, 30] as const).includes(user.dailyGoalMinutes as 5 | 15 | 30)
    ? (user.dailyGoalMinutes as 5 | 15 | 30)
    : 15;
  return {
    name: user.name,
    avatar: (user.name || user.username || "?").charAt(0).toUpperCase(),
    level,
    cefrLevel: user.cefrLevel as UserProfile["cefrLevel"],
    goal: user.goal as UserProfile["goal"],
    dailyGoalMinutes: dailyGoal,
    stars: 0,
    isLoggedIn: true,
    skills,
    engagement,
  };
}

export default function App() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "courses" | "ailab">("dashboard");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  // Ref track session start time cho session_end
  const sessionStartRef = useRef<number | null>(null);

  // ============================================================
  // Auth bootstrap: check localStorage token → verify → load skills
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const token = getToken();
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const me = await getMe();
        let skills: LearnerSkills = { ...DEFAULT_SKILLS };
        let engagement: EngagementMetrics = { ...DEFAULT_ENGAGEMENT };
        try {
          const res = await getMySkills();
          const mapped = mapSkillsResponse(res);
          skills = mapped.skills;
          engagement = mapped.engagement;
        } catch (e) {
          // skills endpoint fail → vẫn cho vào app với default
          console.warn("Không load được skills — dùng default:", e);
        }
        if (cancelled) return;
        setUser(me);
        setProfile(buildProfileFromUser(me, skills, engagement));
      } catch (e) {
        // Token hết hạn / invalid → clear và về login
        console.warn("Auth verify failed:", e);
        clearAuth();
        if (!cancelled) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // ============================================================
  // Local UI state (sound/theme) — load once
  // ============================================================
  useEffect(() => {
    try {
      const savedSoundState = localStorage.getItem("apex_sound_enabled");
      if (savedSoundState !== null) {
        const enabled = savedSoundState === "true";
        setSoundEnabled(enabled);
        sound.enabled = enabled;
      }

      const savedTheme = localStorage.getItem("apex_theme") as Theme | null;
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
        document.documentElement.setAttribute("data-theme", savedTheme);
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch (e) {
      console.error("Failed to load UI state:", e);
    }
  }, []);

  // ============================================================
  // Session tracking: trackEvent("session_start") khi user login,
  // trackEvent("session_end", minutes) khi tab ẩn / user logout
  //
  // Lưu ý: fetch keepalive KHÔNG gửi được custom header trên nhiều browser
  // → khi user đóng tab đột ngột, session_end có thể bị miss.
  // Server sẽ tự dedup + analytics sẽ bỏ qua session cuối cùng incomplete.
  // ============================================================
  useEffect(() => {
    if (!user) {
      sessionStartRef.current = null;
      return;
    }

    // Bắt đầu session
    sessionStartRef.current = Date.now();
    trackEvent("session_start").catch((e) =>
      console.warn("trackEvent session_start failed:", e)
    );

    const sendSessionEnd = (reason: "visibility" | "unload" | "logout") => {
      const start = sessionStartRef.current;
      if (start == null) return;
      const minutes = Math.max(0, Math.round((Date.now() - start) / 60000));
      sessionStartRef.current = null;
      // best-effort: nếu đang unload, dùng keepalive (có thể miss trên Safari)
      if (reason === "unload" && typeof fetch !== "undefined") {
        try {
          fetch("/api/engagement/track", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getToken() ?? ""}`,
            },
            body: JSON.stringify({ event: "session_end", value: minutes }),
            keepalive: true,
          }).catch(() => {});
        } catch {
          // ignore
        }
      } else {
        trackEvent("session_end", minutes).catch(() => {});
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendSessionEnd("visibility");
      } else if (document.visibilityState === "visible" && sessionStartRef.current == null) {
        // Tab visible lại sau khi đã end → bắt đầu session mới
        sessionStartRef.current = Date.now();
        trackEvent("session_start").catch(() => {});
      }
    };

    const onBeforeUnload = () => {
      sendSessionEnd("unload");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Cleanup khi user logout / unmount: gửi session_end
      sendSessionEnd("logout");
    };
  }, [user]);

  // ============================================================
  // refreshSkills: child components gọi sau khi recordMeasurement
  // → re-fetch skills + engagement từ server, merge vào profile
  // ============================================================
  const refreshSkills = async () => {
    try {
      const res = await getMySkills();
      const mapped = mapSkillsResponse(res);
      setProfile((prev) =>
        prev ? { ...prev, skills: mapped.skills, engagement: mapped.engagement } : prev
      );
    } catch (e) {
      console.warn("refreshSkills failed:", e);
    }
  };

  const handleLoginSuccess = (u: ApiUser) => {
    setUser(u);
    // Lúc này chưa load skills → dùng default trước, fetch song song
    setProfile(
      buildProfileFromUser(u, { ...DEFAULT_SKILLS }, { ...DEFAULT_ENGAGEMENT })
    );
    setAuthLoading(false);
    // Fetch skills rồi merge vào
    getMySkills()
      .then((res) => {
        const mapped = mapSkillsResponse(res);
        setProfile((prev) =>
          prev ? { ...prev, skills: mapped.skills, engagement: mapped.engagement } : prev
        );
      })
      .catch((e) => console.warn("Load skills after login failed:", e));
  };

  const handleLogout = async () => {
    sound.playClick();
    await apiLogout();
    setUser(null);
    setProfile(null);
    setIsProfileOpen(false);
  };

  const handleUpdateProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
  };

  const handleToggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    sound.enabled = nextState;
    sound.playClick();
    try {
      localStorage.setItem("apex_sound_enabled", String(nextState));
    } catch (e) {
      console.warn("Storage warning:", e);
    }
  };

  const handleToggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    sound.playClick();
    try {
      localStorage.setItem("apex_theme", nextTheme);
    } catch (e) {
      console.warn("Storage warning:", e);
    }
  };

  const navItems: { id: "dashboard" | "courses" | "ailab"; label: string; icon: any; emoji: string }[] = [
    { id: "dashboard", label: "Hôm nay", icon: LayoutDashboard, emoji: "🏠" },
    { id: "courses", label: "Khóa học", icon: Layers, emoji: "📚" },
    { id: "ailab", label: "Chat AI", icon: Bot, emoji: "💬" },
  ];

  // ============================================================
  // RENDER GATES
  // ============================================================

  // 1. Đang verify auth → spinner
  if (authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center antialiased"
        style={{ backgroundColor: "var(--bg)", color: "var(--foreground)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="floaty w-16 h-16 rounded-3xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center shadow-md">
            <span className="text-3xl">🦉</span>
          </div>
          <div
            className="text-sm font-bold"
            style={{ color: "var(--muted)" }}
          >
            Đang tải...
          </div>
        </motion.div>
      </div>
    );
  }

  // 2. Chưa đăng nhập → LoginScreen
  if (!user || !profile) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // 3. Đã đăng nhập → app chính
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: handleToggleTheme }}>
      <div
        className="min-h-screen flex flex-col justify-between relative pb-24 md:pb-6 antialiased"
        style={{ backgroundColor: "var(--bg)", color: "var(--foreground)" }}
      >
        {/* HEADER */}
        <header
          className="sticky top-0 z-40 px-4 py-3 border-b backdrop-blur-md"
          style={{
            backgroundColor: "var(--bg-overlay)",
            borderColor: "var(--border-soft)",
          }}
        >
          <div className="w-full max-w-5xl mx-auto flex justify-between items-center">
            {/* Logo */}
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => setActiveTab("dashboard")}
            >
              <div className="floaty w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center shadow-md">
                <span className="text-xl">🦉</span>
              </div>
              <div>
                <div className="text-base font-extrabold tracking-tight">
                  Tiếng Anh của mình
                </div>
                <div
                  className="text-[10px] font-bold tracking-wide"
                  style={{ color: "var(--primary)" }}
                >
                  ✨ Học vui mỗi ngày
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleToggleSound}
                className="p-2 rounded-xl border transition-colors"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  borderColor: "var(--border)",
                  color: soundEnabled ? "var(--primary)" : "var(--muted)",
                }}
                title={soundEnabled ? "Tắt âm thanh" : "Bật âm thanh"}
                aria-label="Toggle sound"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                onClick={handleToggleTheme}
                className="p-2 rounded-xl border transition-colors"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  borderColor: "var(--border)",
                  color: "var(--muted)",
                }}
                title={theme === "dark" ? "Chuyển sang sáng" : "Chuyển sang tối"}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setIsProfileOpen(true);
                }}
                className="p-2 rounded-xl border transition-colors flex items-center gap-1.5"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-soft)",
                }}
                title="Hồ sơ của bạn"
              >
                <UserSquare2 className="w-4 h-4" />
                <span className="text-xs font-bold hidden sm:inline">{profile.name}</span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN */}
        <main className="flex-grow w-full max-w-5xl mx-auto px-4 py-6 md:py-8 flex flex-col justify-start">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <Dashboard profile={profile} setProfile={handleUpdateProfile} onNavigate={setActiveTab} onMeasured={refreshSkills} />
              </motion.div>
            )}
            {activeTab === "courses" && (
              <motion.div
                key="courses"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <CoursesTab onStartChat={() => setActiveTab("ailab")} onMeasured={refreshSkills} />
              </motion.div>
            )}
            {activeTab === "ailab" && (
              <motion.div
                key="ailab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <AILabTab profile={profile} setProfile={handleUpdateProfile} onMeasured={refreshSkills} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* MOBILE BOTTOM NAV */}
        <nav
          className="fixed bottom-0 inset-x-0 z-40 px-3 py-2.5 border-t backdrop-blur-lg md:hidden"
          style={{
            backgroundColor: "var(--bg-overlay)",
            borderColor: "var(--border-soft)",
          }}
        >
          <div className="w-full max-w-md mx-auto flex justify-around items-center">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    sound.playClick();
                    setActiveTab(item.id);
                  }}
                  className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl transition-all"
                  style={{
                    color: isActive ? "var(--primary)" : "var(--muted)",
                    backgroundColor: isActive ? "var(--primary-soft)" : "transparent",
                  }}
                >
                  <span className="text-lg leading-none">{item.emoji}</span>
                  <span className="text-[10px] font-bold">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* DESKTOP FLOATING SIDE NAV */}
        <div
          className="hidden md:flex fixed left-5 top-1/2 -translate-y-1/2 flex-col gap-2 p-2 rounded-2xl border backdrop-blur-md z-40 shadow-lg"
          style={{
            backgroundColor: "var(--bg-overlay)",
            borderColor: "var(--border)",
          }}
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sound.playClick();
                  setActiveTab(item.id);
                }}
                className="p-3 rounded-xl transition-all flex flex-col items-center gap-0.5 min-w-[60px]"
                style={{
                  backgroundColor: isActive ? "var(--primary-soft)" : "transparent",
                  color: isActive ? "var(--primary)" : "var(--muted)",
                }}
                title={item.label}
              >
                <span className="text-lg leading-none">{item.emoji}</span>
                <span className="text-[9px] font-extrabold uppercase tracking-wide">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* PROFILE MODAL */}
        <AnimatePresence>
          {isProfileOpen && (
            <ProfileModal
              profile={profile}
              onClose={() => setIsProfileOpen(false)}
              onLogout={handleLogout}
              user={user}
            />
          )}
        </AnimatePresence>
      </div>
    </ThemeContext.Provider>
  );
}
