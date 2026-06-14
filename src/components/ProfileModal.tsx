import { useState } from "react";
import { motion } from "motion/react";
import { UserSquare2, X, Check, Trash2, Sparkles } from "lucide-react";
import { UserProfile } from "../types";
import sound from "../utils/sound";

interface ProfileModalProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onClose: () => void;
}

const levelEmoji: Record<string, string> = {
  Beginner: "🌱",
  Intermediate: "🌿",
  Advanced: "🌳",
};

const levelDesc: Record<string, string> = {
  Beginner: "Bạn mới bắt đầu — mình sẽ giúp bạn từ từ nhé!",
  Intermediate: "Bạn đang ổn rồi — cùng nâng cấp nào!",
  Advanced: "Bạn giỏi lắm — mình sẽ thử thách bạn thêm!",
};

export default function ProfileModal({ profile, setProfile, onClose }: ProfileModalProps) {
  const [tempName, setTempName] = useState(profile.name);
  const [tempLevel, setTempLevel] = useState(profile.level);

  const handleSave = () => {
    sound.playSuccess();
    setProfile({
      ...profile,
      name: tempName || "Bạn",
      level: tempLevel,
    });
    onClose();
  };

  const handleClearStats = () => {
    sound.playClick();
    if (window.confirm("Bạn muốn bắt đầu lại từ đầu? Toàn bộ tiến trình sẽ được đặt về mặc định.")) {
      setProfile({
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
      });
      setTempName("Nguyên");
      setTempLevel("Intermediate");
      alert("Đã đặt lại! Bạn có thể bắt đầu hành trình mới 🌱");
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ backgroundColor: "var(--bg-overlay)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="max-w-md w-full rounded-3xl border p-6 relative space-y-5 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center pb-3 border-b"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <span className="text-base font-extrabold">Hồ sơ của bạn</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl transition-colors"
            style={{ color: "var(--muted)" }}
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 relative">
          {/* Avatar preview */}
          <div
            className="flex items-center gap-3.5 p-3.5 rounded-2xl border"
            style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-extrabold shadow-sm"
              style={{
                background: "linear-gradient(135deg, var(--primary), var(--accent))",
                color: "white",
              }}
            >
              {(tempName || "B").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="font-extrabold text-sm">{profile.name || "Bạn"}</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                {levelEmoji[profile.level]} {profile.level} • {profile.stars} ⭐
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                className="text-xs font-extrabold uppercase tracking-wide block"
                style={{ color: "var(--muted-strong)" }}
              >
                Tên của bạn
              </label>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                maxLength={25}
                className="w-full rounded-xl px-4 py-3 text-sm transition-colors"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  borderColor: "var(--border)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
                placeholder="Nhập tên của bạn..."
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-extrabold uppercase tracking-wide block"
                style={{ color: "var(--muted-strong)" }}
              >
                Trình độ của bạn
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["Beginner", "Intermediate", "Advanced"] as const).map((l) => {
                  const isActive = tempLevel === l;
                  return (
                    <button
                      key={l}
                      onClick={() => {
                        sound.playClick();
                        setTempLevel(l);
                      }}
                      className="p-3 rounded-xl border text-center text-xs font-extrabold transition-colors"
                      style={
                        isActive
                          ? {
                              backgroundColor: "var(--primary-soft)",
                              borderColor: "var(--primary)",
                              color: "var(--primary)",
                            }
                          : {
                              backgroundColor: "var(--bg-soft)",
                              borderColor: "var(--border)",
                              color: "var(--muted)",
                            }
                      }
                    >
                      <div className="text-xl mb-1">{levelEmoji[l]}</div>
                      {l === "Beginner" ? "Mới" : l === "Intermediate" ? "Trung bình" : "Nâng cao"}
                    </button>
                  );
                })}
              </div>
              <p
                className="text-xs leading-relaxed pt-1 flex items-center gap-1"
                style={{ color: "var(--muted)" }}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>{levelDesc[tempLevel]}</span>
              </p>
            </div>
          </div>

          {/* Reset */}
          <div className="pt-2 border-t" style={{ borderColor: "var(--border-soft)" }}>
            <button
              onClick={handleClearStats}
              className="text-xs font-extrabold flex items-center gap-1 transition-colors"
              style={{ color: "var(--danger)" }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Bắt đầu lại từ đầu
            </button>
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex gap-2.5 pt-2 border-t"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-colors"
            style={{
              backgroundColor: "var(--bg-soft)",
              color: "var(--muted)",
            }}
          >
            Đóng
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--on-primary)",
            }}
          >
            <Check className="w-4 h-4 shrink-0" /> Lưu lại
          </button>
        </div>
      </motion.div>
    </div>
  );
}
