import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Flame, 
  Sparkles, 
  Bot, 
  Layers, 
  Volume2, 
  VolumeX, 
  UserSquare2, 
  HelpCircle,
  Trophy,
  LayoutDashboard
} from "lucide-react";
import { UserProfile } from "./types";
import sound from "./utils/sound";

// Import custom high school modular tab components
import Dashboard from "./components/Dashboard";
import CoursesTab from "./components/CoursesTab";
import AILabTab from "./components/AILabTab";
import ProfileModal from "./components/ProfileModal";

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
    dailyGoalProgress: 40
  }
};

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [activeTab, setActiveTab] = useState<"dashboard" | "courses" | "ailab">("dashboard");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem("apex_student_profile");
      if (savedProfile) {
        setProfile(JSON.parse(savedProfile));
      }
      
      const savedSoundState = localStorage.getItem("apex_sound_enabled");
      if (savedSoundState !== null) {
        const enabled = savedSoundState === "true";
        setSoundEnabled(enabled);
        sound.enabled = enabled;
      }
    } catch (e) {
      console.error("Failed to load local storage profile state:", e);
    }
  }, []);

  // Save profile helper
  const handleUpdateProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem("apex_student_profile", JSON.stringify(newProfile));
    } catch (e) {
      console.error("Failed to save local storage profile state:", e);
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

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#F1F5F9] antialiased flex flex-col justify-between select-none relative pb-20 md:pb-6">
      
      {/* 1. Header - Modern, Flat & Technical (No big cartoon avatars) */}
      <header className="border-b border-slate-800 bg-[#0C1220]/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
        <div className="w-full max-w-5xl mx-auto flex justify-between items-center">
          
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab("dashboard")}>
            {/* Minimal High-End Vector Logo */}
            <div className="w-8.5 h-8.5 rounded-lg bg-teal-500 flex items-center justify-center font-black text-xs text-[#090D16]">
              AP
            </div>
            <div>
              <div className="text-sm font-black text-white tracking-widest uppercase">APEX AI</div>
              <div className="text-[9px] text-[#55F0D0] tracking-wide font-bold">EDTECH PORTAL</div>
            </div>
          </div>

          {/* Settings / Controls */}
          <div className="flex items-center gap-2">
            
            {/* Direct Sound Toggle */}
            <button
              onClick={handleToggleSound}
              className="p-1.5 md:p-2 bg-slate-900 border border-slate-805 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-teal-400 transition-colors cursor-pointer"
              title="Toggle Sound Synthesizer"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-teal-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {/* Profile Config key */}
            <button
              onClick={() => {
                sound.playClick();
                setIsProfileOpen(true);
              }}
              className="p-1.5 md:p-2 bg-slate-900 border border-slate-805 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              title="Quản lý Hồ sơ"
            >
              <UserSquare2 className="w-4 h-4" />
              <span className="text-[10px] md:text-xs font-bold text-slate-350 hidden sm:inline">
                {profile.name} (Lớp {profile.level})
              </span>
            </button>

          </div>
        </div>
      </header>

      {/* 2. Main App Content Pane */}
      <main className="flex-grow w-full max-w-5xl mx-auto px-4 py-6 md:py-8 flex flex-col justify-start">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Dashboard 
                profile={profile} 
                setProfile={handleUpdateProfile} 
                onNavigate={setActiveTab}
              />
            </motion.div>
          )}

          {activeTab === "courses" && (
            <motion.div
              key="courses"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <CoursesTab 
                onStartChat={() => setActiveTab("ailab")}
              />
            </motion.div>
          )}

          {activeTab === "ailab" && (
            <motion.div
              key="ailab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <AILabTab 
                profile={profile} 
                setProfile={handleUpdateProfile}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 3. Understated Bottom Nav Bar (Home, Courses, AI Lab) */}
      <nav className="fixed bottom-0 inset-x-0 bg-[#0C1220]/95 backdrop-blur-lg border-t border-slate-800/80 px-6 py-2.5 md:py-3.5 z-40 relative md:bottom-auto md:border-b-0 md:bg-transparent md:pointer-events-none md:hidden">
        <div className="w-full max-w-md mx-auto flex justify-around items-center">
          
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab("dashboard");
            }}
            className={`flex flex-col items-center gap-1 cursor-pointer select-none transition-colors ${
              activeTab === "dashboard" ? "text-teal-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <LayoutDashboard className="w-5 h-5 stroke-[2]" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Dashboard</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setActiveTab("courses");
            }}
            className={`flex flex-col items-center gap-1 cursor-pointer select-none transition-colors ${
              activeTab === "courses" ? "text-teal-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Layers className="w-5 h-5 stroke-[2]" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Khóa Học</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setActiveTab("ailab");
            }}
            className={`flex flex-col items-center gap-1 cursor-pointer select-none transition-colors relative ${
              activeTab === "ailab" ? "text-teal-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Bot className="w-5 h-5 stroke-[2]" />
            <span className="text-[9px] font-bold uppercase tracking-wider">AI Lab</span>
          </button>

        </div>
      </nav>

      {/* Large screen navigational support sidebar-tabs displayed in a floating layout */}
      <div className="hidden md:flex fixed left-6 top-1/2 -translate-y-1/2 flex-col gap-4 bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-slate-800/80 z-40 self-center">
        <button
          onClick={() => {
            sound.playClick();
            setActiveTab("dashboard");
          }}
          className={`p-3 rounded-xl transition-colors cursor-pointer select-none flex flex-col items-center gap-1 ${
            activeTab === "dashboard" ? "bg-teal-500/10 text-teal-400 border border-teal-500/20" : "text-slate-500 hover:text-slate-300"
          }`}
          title="Dashboard / Lộ trình"
        >
          <LayoutDashboard className="w-5.5 h-5.5" />
          <span className="text-[8px] font-extrabold uppercase">Home</span>
        </button>

        <button
          onClick={() => {
            sound.playClick();
            setActiveTab("courses");
          }}
          className={`p-3 rounded-xl transition-colors cursor-pointer select-none flex flex-col items-center gap-1 ${
            activeTab === "courses" ? "bg-teal-500/10 text-teal-400 border border-teal-505/20" : "text-slate-500 hover:text-slate-300"
          }`}
          title="Khóa Học Chuyên Sâu"
        >
          <Layers className="w-5.5 h-5.5" />
          <span className="text-[8px] font-extrabold uppercase">G.Trình</span>
        </button>

        <button
          onClick={() => {
            sound.playClick();
            setActiveTab("ailab");
          }}
          className={`p-3 rounded-xl transition-colors cursor-pointer select-none flex flex-col items-center gap-1` + (
            activeTab === "ailab" ? " bg-teal-500/10 text-teal-400 border border-teal-500/20" : " text-slate-505 hover:text-slate-300"
          )}
          title="Tương Tác Live AI Lab"
        >
          <Bot className="w-5.5 h-5.5" />
          <span className="text-[8px] font-extrabold uppercase">AI Lab</span>
        </button>
      </div>

      {/* 4. Edit profile Popup modal */}
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
  );
}
