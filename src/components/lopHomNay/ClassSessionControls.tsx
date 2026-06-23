/**
 * src/components/lopHomNay/ClassSessionControls.tsx
 *
 * Step 13b Phase 3 — Student controls trong ClassSessionView.
 *
 *  - Mic toggle (mặc định muted khi join — chỉ bật khi được GV claim voice)
 *  - "Giơ tay" button → call classHandUp REST + emit (server broadcast)
 *  - Voice status indicator (idle / connected / incoming / etc.)
 */

import { Mic, MicOff, Hand } from "lucide-react";
import { motion } from "motion/react";
import type { CallStatus } from "../livehelp/hooks/useVoiceCall";

interface Props {
  /** Voice call state (from useVoiceCall). */
  voiceStatus: CallStatus;
  /** Mic muted flag (from useVoiceCall). */
  muted: boolean;
  /** Toggle mic on/off. */
  onToggleMute: () => void;
  /** Submit hand-up request. */
  onHandUp: () => void;
  /** Whether hand-up already queued (prevent double-submit). */
  handUpPending: boolean;
  /** Whether HS đã có hand-up trong queue. */
  hasActiveHandup: boolean;
}

export default function ClassSessionControls({
  voiceStatus,
  muted,
  onToggleMute,
  onHandUp,
  handUpPending,
  hasActiveHandup,
}: Props) {
  const voiceActive = voiceStatus === "connected";
  const voiceIncoming = voiceStatus === "incoming";
  const voiceCalling = voiceStatus === "calling";

  const voiceLabel =
    voiceActive
      ? "Đang nói chuyện với GV"
      : voiceIncoming
      ? "GV đang gọi — sẵn sàng"
      : voiceCalling
      ? "Đang kết nối..."
      : "Sẵn sàng — chờ khi cần";

  return (
    <div className="flex flex-col gap-3">
      {/* Voice status bar */}
      <div
        className="px-4 py-3 rounded-2xl border flex items-center gap-3"
        style={{
          backgroundColor: voiceActive ? "var(--success-soft)" : "var(--bg-card)",
          borderColor: voiceActive ? "var(--success)" : "var(--border)",
        }}
      >
        <motion.div
          animate={voiceActive ? { scale: [1, 1.15, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.4 }}
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor: voiceActive
              ? "var(--success)"
              : voiceIncoming
              ? "var(--accent)"
              : "var(--muted)",
          }}
        />
        <span
          className="text-sm font-bold flex-1"
          style={{
            color: voiceActive ? "var(--success)" : "var(--foreground)",
          }}
        >
          {voiceLabel}
        </span>
        {voiceActive && (
          <button
            onClick={onToggleMute}
            className="p-2 rounded-xl border"
            style={{
              backgroundColor: muted ? "var(--danger-soft)" : "var(--bg-elevated)",
              borderColor: muted ? "var(--danger)" : "var(--border)",
              color: muted ? "var(--danger)" : "var(--foreground)",
            }}
            title={muted ? "Bật mic" : "Tắt mic"}
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Hand-up button */}
      <button
        onClick={onHandUp}
        disabled={handUpPending || hasActiveHandup}
        className="w-full py-3.5 px-4 rounded-2xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        style={{
          backgroundColor: hasActiveHandup
            ? "var(--accent-soft)"
            : "var(--accent)",
          color: hasActiveHandup ? "var(--accent)" : "white",
          border: hasActiveHandup ? "2px solid var(--accent)" : "none",
        }}
      >
        <Hand className="w-4 h-4" />
        {handUpPending
          ? "Đang gửi..."
          : hasActiveHandup
          ? "Đã giơ tay — chờ GV"
          : "Giơ tay xin hỗ trợ"}
      </button>
    </div>
  );
}
