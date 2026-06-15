/**
 * src/components/LoginScreen.tsx — Màn hình đăng nhập
 *
 * Gọi POST /api/auth/login, lưu token vào localStorage, báo cho App biết.
 * Themed theo CSS variables — tự light/dark theo data-theme.
 */

import { useState, FormEvent } from "react";
import { motion } from "motion/react";
import { LogIn, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { login, ApiUser } from "../api/client";
import sound from "../utils/sound";

interface LoginScreenProps {
  onLoginSuccess: (user: ApiUser) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Nhập đầy đủ tên đăng nhập và mật khẩu nhé!");
      return;
    }
    setError(null);
    setLoading(true);
    sound.playClick();
    try {
      const { user } = await login(username.trim(), password);
      sound.playSuccess();
      onLoginSuccess(user);
    } catch (err: any) {
      sound.playIncorrect();
      setError(err?.error || "Đăng nhập thất bại. Thử lại nhé!");
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
            <span className="text-4xl">🦉</span>
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
        <motion.form
          onSubmit={handleSubmit}
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
          <p
            className="text-sm mb-6"
            style={{ color: "var(--muted)" }}
          >
            Đăng nhập để tiếp tục hành trình học của bạn.
          </p>

          {/* Error */}
          {error && (
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
          )}

          {/* Username */}
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-xs font-bold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--muted-strong)" }}
            >
              Tên đăng nhập
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              placeholder="vd: nguyen"
              className="w-full px-4 py-3 rounded-2xl border text-sm font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-xs font-bold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--muted-strong)" }}
            >
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-2xl border text-sm font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* Submit */}
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
                Đang vào...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Vào học nào!
              </>
            )}
          </button>
        </motion.form>

        {/* Footer hint */}
        <p
          className="text-center text-xs mt-6 font-semibold"
          style={{ color: "var(--muted)" }}
        >
          Tài khoản do trung tâm cấp. Quên mật khẩu? Hỏi thầy cô nhé!
        </p>
      </motion.div>
    </div>
  );
}
