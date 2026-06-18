/**
 * src/components/LoginScreen.tsx — Màn hình đăng nhập
 *
 * 2 bước flow:
 *   1. User nhập username + password → POST /api/auth/login
 *      - Bình thường:  nhận token → vào app
 *      - mustChangePassword=true: KHÔNG có token, hiện form "Đổi mật khẩu lần đầu"
 *   2. User nhập currentPassword (đã điền sẵn) + newPassword + confirm
 *      → POST /api/auth/change-password-first → nhận token → vào app
 *
 * Themed theo CSS variables — tự light/dark theo data-theme.
 */

import { useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { LogIn, AlertCircle, Loader2, Sparkles, ShieldCheck, KeyRound } from "lucide-react";
import { login, changePasswordFirst, ApiUser } from "../api/client";
import { inputStyle } from "./ui/Field";
import sound from "../utils/sound";

interface LoginScreenProps {
  onLoginSuccess: (user: ApiUser) => void;
}

type Mode = "login" | "changePassword";

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); // step 1: login, step 2: currentPassword
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Nhập đầy đủ tên đăng nhập và mật khẩu nhé!");
      return;
    }
    setError(null);
    setLoading(true);
    sound.playClick();
    try {
      const res = await login(username.trim(), password);
      if (res.mustChangePassword) {
        // Không có token → chuyển sang form đổi pass lần đầu
        // Giữ `password` làm currentPassword cho bước 2
        setMode("changePassword");
        setNewPassword("");
        setConfirmPassword("");
        setError(null);
        setLoading(false);
        return;
      }
      sound.playSuccess();
      onLoginSuccess(res.user);
    } catch (err: any) {
      sound.playIncorrect();
      setError(err?.error || "Đăng nhập thất bại. Thử lại nhé!");
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setError("Nhập đầy đủ mật khẩu mới và xác nhận nhé!");
      return;
    }
    if (newPassword.length < 4) {
      setError("Mật khẩu mới quá ngắn (tối thiểu 4 ký tự).");
      return;
    }
    if (newPassword === password) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setError(null);
    setLoading(true);
    sound.playClick();
    try {
      const { user } = await changePasswordFirst(
        username.trim(),
        password,
        newPassword
      );
      sound.playSuccess();
      onLoginSuccess(user);
    } catch (err: any) {
      sound.playIncorrect();
      setError(err?.error || "Đổi mật khẩu thất bại. Thử lại nhé!");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10 antialiased"
      style={{ backgroundColor: "var(--bg)", color: "var(--foreground)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Logo + Mascot */}
        <div className="flex flex-col items-center text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="floaty w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-400 via-violet-500 to-orange-400 flex items-center justify-center shadow-lg mb-4"
          >
            <span className="text-4xl">
              {mode === "changePassword" ? "🔐" : "🦉"}
            </span>
          </motion.div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Tiếng Anh của mình
          </h1>
          <p
            className="text-sm mt-1.5 font-semibold flex items-center gap-1.5"
            style={{ color: "var(--primary)" }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Học vui mỗi ngày
          </p>
        </div>

        {/* Card */}
        {mode === "login" ? (
          <LoginForm
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            error={error}
            loading={loading}
            onSubmit={handleLogin}
          />
        ) : (
          <ChangePasswordForm
            username={username}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            error={error}
            loading={loading}
            onSubmit={handleChangePassword}
          />
        )}

        {/* Footer hint */}
        <p
          className="text-center text-xs mt-6 font-semibold"
          style={{ color: "var(--muted)" }}
        >
          {mode === "login"
            ? "Tài khoản do trung tâm cấp. Quên mật khẩu? Hỏi thầy cô nhé!"
            : "Mật khẩu mới sẽ được dùng cho những lần đăng nhập sau."}
        </p>
      </motion.div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

const labelStyle = { color: "var(--muted-strong)" } as const;

interface LoginFormProps {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string | null;
  loading: boolean;
  onSubmit: (e: FormEvent) => void;
}

function LoginForm({
  username,
  setUsername,
  password,
  setPassword,
  error,
  loading,
  onSubmit,
}: LoginFormProps) {
  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="rounded-3xl border p-6 md:p-8 shadow-lg backdrop-blur-sm"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      <h2 className="text-lg font-extrabold mb-1">Chào bạn! 👋</h2>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Đăng nhập để tiếp tục hành trình học của bạn.
      </p>

      <ErrorBox error={error} />

      {/* Username */}
      <Field
        id="username"
        label="Tên đăng nhập"
        autoComplete="username"
        autoFocus
        value={username}
        onChange={setUsername}
        disabled={loading}
        placeholder="vd: nguyen"
      />

      {/* Password */}
      <Field
        id="password"
        label="Mật khẩu"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        disabled={loading}
        placeholder="••••••••"
        className="mb-6"
      />

      <SubmitButton loading={loading} icon={<LogIn className="w-4 h-4" />}>
        Vào học nào!
      </SubmitButton>
    </motion.form>
  );
}

interface ChangePasswordFormProps {
  username: string;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  error: string | null;
  loading: boolean;
  onSubmit: (e: FormEvent) => void;
}

function ChangePasswordForm({
  username,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  error,
  loading,
  onSubmit,
}: ChangePasswordFormProps) {
  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="rounded-3xl border p-6 md:p-8 shadow-lg backdrop-blur-sm"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck
          className="w-5 h-5"
          style={{ color: "var(--primary)" }}
        />
        <h2 className="text-lg font-extrabold">Đổi mật khẩu lần đầu 🔑</h2>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Tài khoản <strong>{username}</strong> đang dùng mật khẩu mặc định. Hãy
        đặt mật khẩu mới để bảo vệ tài khoản của bạn nhé!
      </p>

      <ErrorBox error={error} />

      {/* New password */}
      <Field
        id="new-password"
        label="Mật khẩu mới"
        type="password"
        autoComplete="new-password"
        autoFocus
        value={newPassword}
        onChange={setNewPassword}
        disabled={loading}
        placeholder="Tối thiểu 4 ký tự"
      />

      {/* Confirm new password */}
      <Field
        id="confirm-password"
        label="Nhập lại mật khẩu mới"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        disabled={loading}
        placeholder="Khớp với mật khẩu ở trên"
        className="mb-6"
      />

      <SubmitButton loading={loading} icon={<KeyRound className="w-4 h-4" />}>
        Xác nhận và vào học
      </SubmitButton>
    </motion.form>
  );
}

// ============================================================
// Reusable bits
// ============================================================

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 p-3 rounded-2xl border flex items-start gap-2 text-sm"
      style={{
        backgroundColor: "var(--danger-soft)",
        borderColor: "var(--danger)",
        color: "var(--danger)",
      }}
    >
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span className="font-semibold">{error}</span>
    </motion.div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  className?: string;
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
  autoComplete,
  autoFocus,
  className = "mb-4",
}: FieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-xs font-bold uppercase tracking-wide mb-1.5"
        style={labelStyle}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-2xl border text-sm font-semibold transition-colors disabled:opacity-50"
        style={inputStyle}
      />
    </div>
  );
}

interface SubmitButtonProps {
  loading: boolean;
  icon: ReactNode;
  children: ReactNode;
}

function SubmitButton({ loading, icon, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-3 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
      style={{
        backgroundColor: "var(--primary)",
        color: "var(--on-primary)",
      }}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang xử lý...
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
