import { motion } from "motion/react";
import { X, LogOut, Sparkles, AtSign, Shield, Target, Clock } from "lucide-react";
import { UserProfile } from "../types";
import { ApiUser } from "../api/client";
import sound from "../utils/sound";

interface ProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
  onLogout: () => void;
  user: ApiUser;
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

const roleLabel: Record<ApiUser["role"], string> = {
  student: "Học sinh",
  parent: "Phụ huynh",
  teacher: "Giáo viên",
  admin: "Quản trị viên",
};

const roleEmoji: Record<ApiUser["role"], string> = {
  student: "🎓",
  parent: "👨‍👩‍👧",
  teacher: "👩‍🏫",
  admin: "🛡️",
};

const goalLabel: Record<string, string> = {
  IELTS: "IELTS",
  "Giao tiếp": "Giao tiếp",
  "Học thuật": "Học thuật",
  "Tổng quát": "Tổng quát",
};

export default function ProfileModal({ profile, onClose, onLogout, user }: ProfileModalProps) {
  const handleLogoutClick = () => {
    if (window.confirm("Đăng xuất khỏi tài khoản này?")) {
      onLogout();
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
          {/* Avatar + tên + role */}
          <div
            className="flex items-center gap-3.5 p-4 rounded-2xl border"
            style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-extrabold shadow-sm"
              style={{
                background: "linear-gradient(135deg, var(--primary), var(--accent))",
                color: "white",
              }}
            >
              {profile.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-base truncate">{profile.name}</div>
              <div
                className="text-[11px] mt-0.5 font-bold flex items-center gap-1"
                style={{ color: "var(--muted)" }}
              >
                <span>{roleEmoji[user.role]}</span>
                <span>{roleLabel[user.role]}</span>
                {profile.stars > 0 && (
                  <>
                    <span>•</span>
                    <span>{profile.stars} ⭐</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Info rows — readonly */}
          <div
            className="rounded-2xl border divide-y"
            style={{ borderColor: "var(--border-soft)" }}
          >
            {/* Username */}
            <div className="flex items-center gap-3 px-4 py-3">
              <AtSign
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--muted)" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-extrabold uppercase tracking-wide"
                  style={{ color: "var(--muted-strong)" }}
                >
                  Tên đăng nhập
                </div>
                <div className="text-sm font-bold truncate">{user.username}</div>
              </div>
            </div>

            {/* Role */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Shield
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--muted)" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-extrabold uppercase tracking-wide"
                  style={{ color: "var(--muted-strong)" }}
                >
                  Vai trò
                </div>
                <div className="text-sm font-bold">
                  {roleEmoji[user.role]} {roleLabel[user.role]}
                </div>
              </div>
            </div>

            {/* Level */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Sparkles
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--muted)" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-extrabold uppercase tracking-wide"
                  style={{ color: "var(--muted-strong)" }}
                >
                  Trình độ
                </div>
                <div className="text-sm font-bold flex items-center gap-1.5 flex-wrap">
                  <span>
                    {levelEmoji[profile.level]} {profile.level}
                  </span>
                  {profile.cefrLevel && (
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-extrabold"
                      style={{
                        backgroundColor: "var(--primary-soft)",
                        color: "var(--primary)",
                      }}
                    >
                      {profile.cefrLevel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Goal */}
            {profile.goal && (
              <div className="flex items-center gap-3 px-4 py-3">
                <Target
                  className="w-4 h-4 shrink-0"
                  style={{ color: "var(--muted)" }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[10px] font-extrabold uppercase tracking-wide"
                    style={{ color: "var(--muted-strong)" }}
                  >
                    Mục tiêu
                  </div>
                  <div className="text-sm font-bold">
                    {goalLabel[profile.goal] || profile.goal}
                  </div>
                </div>
              </div>
            )}

            {/* Daily goal */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Clock
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--muted)" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-extrabold uppercase tracking-wide"
                  style={{ color: "var(--muted-strong)" }}
                >
                  Mục tiêu mỗi ngày
                </div>
                <div className="text-sm font-bold">{profile.dailyGoalMinutes} phút</div>
              </div>
            </div>
          </div>

          {/* Hint */}
          <p
            className="text-[11px] leading-relaxed flex items-start gap-1.5"
            style={{ color: "var(--muted)" }}
          >
            <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
            <span>
              Thông tin do trung tâm quản lý. Cần sửa? Nhờ thầy cô nhé!
            </span>
          </p>
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
            onClick={handleLogoutClick}
            className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--danger-soft)",
              color: "var(--danger)",
              border: "1px solid var(--danger)",
            }}
          >
            <LogOut className="w-4 h-4 shrink-0" /> Đăng xuất
          </button>
        </div>
      </motion.div>
    </div>
  );
}
