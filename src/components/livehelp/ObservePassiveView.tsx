/**
 * src/components/livehelp/ObservePassiveView.tsx
 *
 * Step 12d P3 — HS-side full-screen panel rendered while being observed.
 *
 * Voice auto-connects via `useVoiceCall({ autoAnswer: true })`. The hook
 * answers GV's call:offer automatically the moment it arrives.
 *
 * Cleanup: HS click "Kết thúc" → emit `observe:end` → parent clears state.
 */

import { Eye, Phone, PhoneOff, Mic, MicOff, Loader2, PhoneMissed, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { useVoiceCall } from "./hooks/useVoiceCall";
import type { Socket } from "socket.io-client";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ObservePassiveView({
  socket,
  sessionId,
  teacherName,
  onEnd,
}: {
  socket: Socket | null;
  sessionId: string;
  teacherName: string;
  onEnd: () => void;
}) {
  const {
    status,
    muted,
    error,
    durationSec,
    endCall,
    toggleMute,
  } = useVoiceCall({ socket, sessionId, autoAnswer: true });

  const handleEnd = () => {
    // emit observe:end → server sẽ broadcast observe:ended, parent clears state
    socket?.emit("observe:end", { sessionId, outcome: "understood" });
    endCall();
    onEnd();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        className="max-w-md w-full rounded-3xl border p-6 space-y-5 shadow-2xl"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-base font-extrabold"
              style={{
                backgroundColor: "var(--primary-soft)",
                color: "var(--primary)",
              }}
            >
              <Eye className="w-6 h-6" />
            </div>
            <div
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--success)" }}
              title="Đang được quan sát"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-base">
              GV {teacherName} đang quan sát em
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Voice + screen view đang kết nối
            </p>
          </div>
        </div>

        {/* Notice */}
        <div
          className="rounded-2xl p-3 text-xs space-y-1"
          style={{ backgroundColor: "var(--bg-soft)" }}
        >
          <p className="font-extrabold">Em có thể tiếp tục làm bài bình thường.</p>
          <p style={{ color: "var(--muted-strong)" }}>
            GV sẽ quan sát và giúp đỡ qua voice. Khi em hiểu bài, bấm "Kết thúc"
            để rời observe mode.
          </p>
        </div>

        {/* Voice status pills (inline — chúng ta không dùng VoiceCallPanel vì
            cần custom layout + tránh redundant hook lifecycle). */}
        <div
          className="rounded-2xl p-3 space-y-2"
          style={{ backgroundColor: "var(--bg-soft)" }}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            🎙️ Voice
          </p>
          {status === "idle" && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" style={{ color: "var(--muted)" }} />
              <span className="text-xs" style={{ color: "var(--muted-strong)" }}>
                Đang chờ GV kết nối...
              </span>
            </div>
          )}
          {status === "calling" && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--primary)" }} />
              <span className="text-xs font-extrabold" style={{ color: "var(--primary)" }}>
                Đang kết nối với GV...
              </span>
            </div>
          )}
          {status === "connected" && (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold"
                style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}
              >
                {teacherName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-xs font-extrabold" style={{ color: "var(--success)" }}>
                  Đang nói chuyện với GV
                </span>
                <span className="text-[10px] tabular-nums" style={{ color: "var(--muted)" }}>
                  {formatDuration(durationSec)}
                </span>
              </div>
              <button
                onClick={toggleMute}
                className="p-2 rounded-xl"
                style={{
                  backgroundColor: "var(--bg-card)",
                  color: muted ? "var(--warning)" : "var(--muted-strong)",
                }}
                title={muted ? "Bật mic" : "Tắt mic"}
              >
                {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
          )}
          {status === "ended" && (
            <div className="flex items-center gap-2">
              <PhoneMissed className="w-4 h-4" style={{ color: "var(--muted)" }} />
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Cuộc gọi đã kết thúc
              </span>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" style={{ color: "var(--error)" }} />
              <span className="text-[11px] truncate" style={{ color: "var(--error)" }}>
                {error || "Lỗi voice"}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={handleEnd}
          className="w-full px-3 py-2.5 rounded-2xl text-sm font-extrabold flex items-center justify-center gap-2"
          style={{
            backgroundColor: status === "connected" ? "var(--error)" : "var(--bg-soft)",
            color: status === "connected" ? "#fff" : "var(--muted-strong)",
          }}
        >
          <PhoneOff className="w-4 h-4" />
          Kết thúc observe
        </button>
      </motion.div>
    </motion.div>
  );
}