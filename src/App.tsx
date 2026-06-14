import { useState, useEffect, createContext, useContext } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Flame,
  Sparkles,
  Bot,
  Layers,
  Volume2,
  VolumeX,
  UserSquare2,
  Sun,
  Moon,
  LayoutDashboard,
} from "lucide-react";
import { UserProfile } from "./types";
import sound from "./utils/sound";

import Dashboard from "./components/Dashboard";
import CoursesTab from "./components/CoursesTab";
import AILabTab from "./components/AILabTab";
import ProfileModal from "./components/ProfileModal";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

const DEFAULT_PROFILE: UserProfile = {
  name: "Nguyên",
  avatar: "N",
  level: "Intermediate",
  stars: 120,
  streak: 5,
  isLoggedIn: true,
  stats: {
    wordsLearned: 14,
    chatsCompleted: 2,
    studyMinutes: 45,
    dailyGoalProgress: 40,
  },
};

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [activeTab, setActiveTab] = useState<"dashboard" | "courses" | "ailab">("dashboard");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");

  // Load persisted state on mount
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem("apex_student_profile");
      if (savedProfile) setProfile(JSON.parse(savedProfile));

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
      console.error("Failed to load saved state:", e);
    }
  }, []);

  const handleUpdateProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem("apex_student_profile", JSON.stringify(newProfile));
    } catch (e) {
      console.error("Failed to save profile:", e);
    }
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
                <Dashboard profile={profile} setProfile={handleUpdateProfile} onNavigate={setActiveTab} />
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
                <CoursesTab onStartChat={() => setActiveTab("ailab")} />
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
                <AILabTab profile={profile} setProfile={handleUpdateProfile} />
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
              const Icon = item.icon;
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
            const Icon = item.icon;
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
              setProfile={handleUpdateProfile}
              onClose={() => setIsProfileOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </ThemeContext.Provider>
  );
}
