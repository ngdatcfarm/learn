/**
 * src/components/livehelp/VoiceCallPanel.tsx
 *
 * Step 12c — Voice call UI panel.
 *
 * Hiển thị trong cả LiveHelpModal (HS) + TeacherLiveHelpPane (GV). 4 trạng thái:
 *  - idle:      Hiện nút "Bắt đầu voice" / "Gọi GV" / "Gọi HS"
 *  - calling:   "Đang kết nối..." (chờ peer accept)
 *  - incoming:  "Cuộc gọi đến" + nút Chấp nhận/Từ chối
 *  - connected: Avatar + duration + nút Mute/Hangup
 *  - ended:     "Đã kết thúc" + nút Gọi lại
 *  - error:     Lỗi message + nút Thử lại
 *
 * Audio: tự play qua hidden <audio> element (useVoiceCall tạo sẵn, không cần render).
 *        Browser autoplay policy yêu cầu user gesture trước — nút "Chấp nhận" đủ rồi.
 */

import { useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, PhoneIncoming, PhoneMissed, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useVoiceCall, type CallStatus } from "./hooks/useVoiceCall";
import type { Socket } from "socket.io-client";

export interface VoiceCallPanelProps {
  socket: Socket | null;
  sessionId?: string;
  /** "HS" hoặc "GV" — ảnh hưởng label nút + hiển thị peer. */
  selfRole: "student" | "teacher";
  /** Tên peer (HS hoặc GV ở phía bên kia). */
  peerName: string;
  /** Tên của mình (HS hoặc GV ở phía này). */
  selfName: string;
  /** Auto-answer incoming call (default false). */
  autoAnswer?: boolean;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function VoiceCallPanel({
  socket,
  sessionId,
  selfRole,
  peerName,
  selfName,
  autoAnswer = false,
}: VoiceCallPanelProps) {
  const {
    status,
    muted,
    error,
    durationSec,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
  } = useVoiceCall({ socket, sessionId, autoAnswer });

  const peerLabel = selfRole === "student" ? "GV" : "HS";
  const startLabel = selfRole === "student" ? `📞 Gọi ${peerLabel}` : `📞 Gọi HS`;

  return (
    <div
      className="rounded-xl p-2.5 flex items-center gap-2"
      style={{ backgroundColor: "var(--bg-soft)" }}
    >
      <AnimatePresence mode="wait">
        {status === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 w-full"
          >
            <span className="text-xs" style={{ color: "var(--muted-strong)" }}>
              🎙️ Voice
            </span>
            <button
              onClick={startCall}
              disabled={!socket || !sessionId}
              className="ml-auto px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 disabled:opacity-50"
              style={{ backgroundColor: "var(--success)", color: "#fff" }}
              title="Bắt đầu voice call"
            >
              <Phone className="w-3 h-3" />
              {startLabel}
            </button>
          </motion.div>
        )}

        {status === "calling" && (
          <motion.div
            key="calling"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 w-full"
          >
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--primary)" }} />
            <span className="text-xs font-extrabold" style={{ color: "var(--primary)" }}>
              Đang kết nối {peerLabel.toLowerCase()}...
            </span>
            <button
              onClick={endCall}
              className="ml-auto px-2 py-1 rounded-lg text-[10px] font-extrabold"
              style={{ backgroundColor: "var(--bg-card)", color: "var(--muted-strong)" }}
            >
              Huỷ
            </button>
          </motion.div>
        )}

        {status === "incoming" && (
          <motion.div
            key="incoming"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 w-full"
          >
            <PhoneIncoming className="w-4 h-4 animate-pulse" style={{ color: "var(--success)" }} />
            <span className="text-xs font-extrabold" style={{ color: "var(--success)" }}>
              📞 {peerName} đang gọi
            </span>
            <button
              onClick={acceptCall}
              className="ml-auto px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1"
              style={{ backgroundColor: "var(--success)", color: "#fff" }}
            >
              <Phone className="w-3 h-3" />
              Chấp nhận
            </button>
            <button
              onClick={rejectCall}
              className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1"
              style={{ backgroundColor: "var(--bg-card)", color: "var(--muted-strong)" }}
            >
              <PhoneMissed className="w-3 h-3" />
              Từ chối
            </button>
          </motion.div>
        )}

        {status === "connected" && (
          <motion.div
            key="connected"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 w-full"
          >
            <div className="relative">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold"
                style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}
              >
                {peerName.charAt(0).toUpperCase()}
              </div>
              <div
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: "var(--success)" }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-extrabold" style={{ color: "var(--success)" }}>
                🎙️ Đang gọi {peerName}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: "var(--muted)" }}>
                {formatDuration(durationSec)}
              </span>
            </div>
            <button
              onClick={toggleMute}
              className="ml-auto p-1.5 rounded-lg"
              style={{
                backgroundColor: muted ? "var(--bg-card)" : "var(--bg-card)",
                color: muted ? "var(--warning)" : "var(--muted-strong)",
              }}
              title={muted ? "Bật mic" : "Tắt mic"}
            >
              {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={endCall}
              className="px-2 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1"
              style={{ backgroundColor: "var(--error)", color: "#fff" }}
              title="Kết thúc"
            >
              <PhoneOff className="w-3 h-3" />
              Kết thúc
            </button>
          </motion.div>
        )}

        {status === "ended" && (
          <motion.div
            key="ended"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 w-full"
          >
            <PhoneMissed className="w-3 h-3" style={{ color: "var(--muted)" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Cuộc gọi đã kết thúc
            </span>
            <button
              onClick={startCall}
              disabled={!socket || !sessionId}
              className="ml-auto px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 disabled:opacity-50"
              style={{ backgroundColor: "var(--success)", color: "#fff" }}
            >
              <Phone className="w-3 h-3" />
              Gọi lại
            </button>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 w-full"
          >
            <AlertCircle className="w-3 h-3" style={{ color: "var(--error)" }} />
            <span className="text-[10px] truncate" style={{ color: "var(--error)" }}>
              {error || "Lỗi voice call"}
            </span>
            <button
              onClick={startCall}
              className="ml-auto px-2.5 py-1 rounded-lg text-xs font-extrabold"
              style={{ backgroundColor: "var(--primary)", color: "#fff" }}
            >
              Thử lại
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
