import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import {
  X,
  LogOut,
  Sparkles,
  AtSign,
  Shield,
  Target,
  Clock,
  KeyRound,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { UserProfile } from "../types";
import { ApiUser, changeMyPassword } from "../api/client";
import sound from "../utils/sound";
import { Field, inputStyle, inputClass } from "./ui/Field";

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
  const [showChangePw, setShowChangePw] = useState(false);

  const handleLogoutClick = () => {
    if (window.confirm("Đăng xuất khỏi tài khoản này?")) {
      onLogout();
    }
  };

  return (
    <>
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
              onClick={() => {
                sound.playClick();
                setShowChangePw(true);
              }}
              className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--primary-soft)",
                color: "var(--primary)",
                border: "1px solid var(--primary)",
              }}
            >
              <KeyRound className="w-4 h-4 shrink-0" /> Đổi mật khẩu
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

      {showChangePw && (
        <ChangePasswordModal onClose={() => setShowChangePw(false)} />
      )}
    </>
  );
}

// ============================================================
// ChangePasswordModal — voluntary password change (authenticated)
// Mounted on top of ProfileModal khi user click "Đổi mật khẩu".
// ============================================================

interface ChangePasswordModalProps {
  onClose: () => void;
}

function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current || !next || !confirm) {
      setError("Nhập đầy đủ các trường nhé!");
      return;
    }
    if (next.length < 4) {
      setError("Mật khẩu mới quá ngắn (tối thiểu 4 ký tự).");
      return;
    }
    if (next === current) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }
    if (next !== confirm) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setLoading(true);
    sound.playClick();
    try {
      await changeMyPassword(current, next);
      sound.playSuccess();
      setDone(true);
      // Auto-close sau 1.5s để user thấy được success message
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      sound.playIncorrect();
      setError(err?.error || "Đổi mật khẩu thất bại. Thử lại nhé!");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-[60]"
      style={{ backgroundColor: "var(--bg-overlay)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="max-w-md w-full rounded-3xl border p-6 relative space-y-5 shadow-2xl"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center pb-3 border-b"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">🔑</span>
            <span className="text-base font-extrabold">Đổi mật khẩu</span>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-xl transition-colors disabled:opacity-30"
            style={{ color: "var(--muted)" }}
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-12 h-12" style={{ color: "var(--success, #22c55e)" }} />
            <div className="font-extrabold text-base">Đổi mật khẩu thành công!</div>
            <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              Mật khẩu mới sẽ áp dụng cho lần đăng nhập sau.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Mật khẩu hiện tại">
              <PasswordInput
                value={current}
                onChange={setCurrent}
                show={showPwd}
                disabled={loading}
                autoFocus
                placeholder="Nhập mật khẩu bạn đang dùng"
              />
            </Field>

            <Field label="Mật khẩu mới" hint="Tối thiểu 4 ký tự, phải khác mật khẩu hiện tại">
              <PasswordInput
                value={next}
                onChange={setNext}
                show={showPwd}
                disabled={loading}
                placeholder="Ít nhất 4 ký tự"
              />
            </Field>

            <Field label="Xác nhận mật khẩu mới">
              <PasswordInput
                value={confirm}
                onChange={setConfirm}
                show={showPwd}
                disabled={loading}
                placeholder="Nhập lại mật khẩu mới"
              />
            </Field>

            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="text-[11px] font-bold flex items-center gap-1 transition-colors"
              style={{ color: "var(--muted)" }}
            >
              {showPwd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showPwd ? "Ẩn" : "Hiện"} mật khẩu
            </button>

            {error && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
                style={{
                  backgroundColor: "var(--danger-soft)",
                  color: "var(--danger)",
                  border: "1px solid var(--danger)",
                }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  color: "var(--muted)",
                }}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground, white)",
                }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <KeyRound className="w-4 h-4" />
                )}
                Đổi mật khẩu
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ============================================================
// PasswordInput — input với nút toggle show/hide, dùng cho ChangePasswordModal.
// ============================================================

interface PasswordInputProps {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

function PasswordInput({
  value,
  onChange,
  show,
  disabled,
  autoFocus,
  placeholder,
}: PasswordInputProps) {
  return (
    <input
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className={inputClass()}
      style={inputStyle}
      autoComplete="off"
    />
  );
}