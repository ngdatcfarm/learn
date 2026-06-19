/**
 * src/components/livehelp/ScreenSharePanel.tsx
 *
 * Step 12c Phase 2 — Screen share UI.
 *
 * Layout:
 *  - HS side: nút "📺 Chia sẻ màn hình" / "Dừng chia sẻ"
 *  - GV side: <video> element render remote screen
 *  - Cả 2: status indicator (idle/requesting/connected/stopped/error)
 *
 * Self-view: HS có thể xem chính màn hình mình đang share (optional) — để confirm
 * đúng tab/window đã được capture.
 */

import { useEffect, useRef, useState } from "react";
import { Monitor, MonitorOff, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Socket } from "socket.io-client";
import { useScreenShare } from "./hooks/useScreenShare";

export interface ScreenSharePanelProps {
  socket: Socket | null;
  sessionId?: string;
  /** "HS" hoặc "GV" — HS được start, GV chỉ nhận. */
  selfRole: "student" | "teacher";
  /** Hiển thị self-view cho HS (xem chính màn hình đang share). */
  showSelfView?: boolean;
}

export function ScreenSharePanel({
  socket,
  sessionId,
  selfRole,
  showSelfView = true,
}: ScreenSharePanelProps) {
  const isInitiator = selfRole === "student";
  const { status, error, localStream, remoteStream, startShare, stopShare } = useScreenShare({
    socket,
    sessionId,
    isInitiator,
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach stream phù hợp với role
  useEffect(() => {
    if (!videoRef.current) return;
    if (isInitiator) {
      // HS: dùng local stream (self-view) — mute để không nghe audio chính mình
      if (localStream) {
        videoRef.current.srcObject = localStream;
        videoRef.current.muted = true;
        videoRef.current.play().catch((e) => console.warn("[ScreenSharePanel] autoplay failed:", e));
      }
    } else {
      // GV: dùng remote stream
      if (remoteStream) {
        videoRef.current.srcObject = remoteStream;
        videoRef.current.play().catch((e) => console.warn("[ScreenSharePanel] autoplay failed:", e));
      }
    }
  }, [localStream, remoteStream, isInitiator]);

  if (!isInitiator) {
    // GV: chỉ render video element, không có controls
    return (
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-soft)" }}
      >
        <AnimatePresence>
          {status === "connected" && (
            <motion.div
              key="video"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={false}
                controls
                className="w-full max-h-[300px] object-contain"
                style={{ backgroundColor: "#000" }}
              />
              <div
                className="absolute top-2 left-2 px-2 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1"
                style={{ backgroundColor: "rgba(0,0,0,0.7)", color: "#fff" }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                HS đang chia sẻ màn hình
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {(status === "idle" || status === "stopped") && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3 text-center text-xs"
              style={{ color: "var(--muted)" }}
            >
              📺 HS chưa chia sẻ màn hình
            </motion.div>
          )}
          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3 text-center text-xs flex items-center justify-center gap-1"
              style={{ color: "var(--error)" }}
            >
              <AlertCircle className="w-3 h-3" />
              {error || "Lỗi screen share"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // HS: render controls + optional self-view
  return (
    <div
      className="rounded-xl p-2.5 space-y-2"
      style={{ backgroundColor: "var(--bg-soft)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--muted-strong)" }}>
          📺 Màn hình
        </span>
        {status === "idle" && (
          <button
            onClick={startShare}
            disabled={!socket || !sessionId}
            className="ml-auto px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "#fff" }}
            title="Chia sẻ màn hình với GV"
          >
            <Monitor className="w-3 h-3" />
            Chia sẻ
          </button>
        )}
        {status === "requesting" && (
          <div className="ml-auto flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            Đang chọn màn hình...
          </div>
        )}
        {status === "connected" && (
          <>
            <span className="ml-auto text-[10px] flex items-center gap-1" style={{ color: "var(--success)" }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "var(--success)" }} />
              Đang chia sẻ
            </span>
            <button
              onClick={stopShare}
              className="px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1"
              style={{ backgroundColor: "var(--error)", color: "#fff" }}
            >
              <MonitorOff className="w-3 h-3" />
              Dừng
            </button>
          </>
        )}
        {status === "stopped" && (
          <button
            onClick={startShare}
            disabled={!socket || !sessionId}
            className="ml-auto px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "#fff" }}
          >
            <Monitor className="w-3 h-3" />
            Chia sẻ lại
          </button>
        )}
        {status === "error" && (
          <div className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: "var(--error)" }}>
            <AlertCircle className="w-3 h-3" />
            {error || "Lỗi"}
            <button
              onClick={startShare}
              className="px-2 py-0.5 rounded text-[10px] font-extrabold ml-1"
              style={{ backgroundColor: "var(--primary)", color: "#fff" }}
            >
              Thử lại
            </button>
          </div>
        )}
      </div>

      {/* HS self-view: optional, có thể tắt nếu thấy redundant */}
      {showSelfView && status === "connected" && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full max-h-[180px] rounded-lg object-contain"
          style={{ backgroundColor: "#000" }}
        />
      )}
    </div>
  );
}
