/**
 * src/components/lopHomNay/ClassSessionView.tsx
 *
 * Step 13b Phase 3 + 4 — HS view khi class_sessions.status='active'.
 *
 * Composition:
 *  - useLiveHelpSocket (lấy socket cho /live-help namespace)
 *  - useClassSessionSocket (class:* events → state)
 *  - useClassSessionVisibility (emit class:tab-visibility on visibilitychange)
 *  - useVoiceCall khi voiceSessionId set (GV claim hand-up → 1-1 voice)
 *  - ClassSessionControls (mic toggle, hand-up button)
 *  - ClassBoardOverlay (forced-focus)
 */

import { useCallback, useEffect, useState } from "react";
import { useLiveHelpSocket } from "../livehelp/hooks/useLiveHelpSocket";
import { useVoiceCall } from "../livehelp/hooks/useVoiceCall";
import {
  useClassSessionSocket,
  ClassBoardPush,
} from "./hooks/useClassSessionSocket";
import { useClassSessionVisibility } from "./hooks/useClassSessionVisibility";
import ClassSessionControls from "./ClassSessionControls";
import ClassBoardOverlay from "./ClassBoardOverlay";
import sound from "../../utils/sound";
import {
  classHandUp,
  classBoardDismissRequest,
} from "../../api/client";

interface Props {
  classSessionId: string;
  classId?: string;
}

export default function ClassSessionView({ classSessionId }: Props) {
  const { socket, connected } = useLiveHelpSocket();
  const classSession = useClassSessionSocket(socket, classSessionId);
  const [handUpPending, setHandUpPending] = useState(false);
  const [hasActiveHandup, setHasActiveHandup] = useState(false);
  const [dismissPending, setDismissPending] = useState(false);
  const [micPermissionRequested, setMicPermissionRequested] = useState(false);

  // Re-emit visibility change
  useClassSessionVisibility(socket, classSessionId, connected);

  // 1-1 voice call khi voiceSessionId set
  const voice = useVoiceCall({
    socket,
    sessionId: classSession.voiceSessionId || undefined,
    autoAnswer: true,
    initialMuted: true,
  });

  // Khi GV claim hand-up của HS này → toast "Cho phép dùng micro" (user gesture)
  useEffect(() => {
    if (classSession.voiceSessionId && !micPermissionRequested) {
      // voice call đã bắt đầu (GV side) — HS cần user gesture để init getUserMedia.
      // Hiển thị toast inline ở đây.
      setMicPermissionRequested(true);
    }
  }, [classSession.voiceSessionId, micPermissionRequested]);

  const handleHandUp = useCallback(async () => {
    if (handUpPending || hasActiveHandup) return;
    setHandUpPending(true);
    sound.playClick();
    try {
      await classHandUp(classSessionId, {});
      setHasActiveHandup(true);
    } catch (e) {
      console.warn("classHandUp failed:", e);
    } finally {
      setHandUpPending(false);
    }
  }, [classSessionId, handUpPending, hasActiveHandup]);

  const handleRequestDismiss = useCallback(
    async (boardId: string) => {
      if (dismissPending) return;
      setDismissPending(true);
      try {
        await classBoardDismissRequest(classSessionId, boardId);
        sound.playClick();
      } catch (e) {
        console.warn("dismiss-request failed:", e);
      } finally {
        setDismissPending(false);
      }
    },
    [classSessionId, dismissPending]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="p-5 rounded-3xl border flex items-center gap-3"
        style={{
          background:
            "linear-gradient(120deg, var(--success-soft) 0%, var(--bg-card) 100%)",
          borderColor: "var(--success)",
        }}
      >
        <div className="floaty w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-xl shadow-md">
          🎓
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-extrabold">Buổi học đang diễn ra</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            GV đang online — tập trung nào!
          </p>
        </div>
      </div>

      {/* Voice connection toast — HS cần click để cấp quyền mic */}
      {classSession.voiceSessionId && micPermissionRequested && voice.status === "incoming" && (
        <button
          onClick={() => voice.acceptCall()}
          className="w-full p-4 rounded-2xl border-2 text-left flex items-center gap-3 transition-all"
          style={{
            backgroundColor: "var(--accent-soft)",
            borderColor: "var(--accent)",
          }}
        >
          <span className="text-2xl">🎙️</span>
          <div className="flex-1">
            <p className="text-sm font-extrabold" style={{ color: "var(--accent)" }}>
              GV muốn nói chuyện với em
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Bấm để bật mic và nghe GV.
            </p>
          </div>
        </button>
      )}

      {/* Voice audio element (chỉ render khi connected) */}
      {voice.remoteStream && (
        <audio autoPlay playsInline ref={(el) => {
          if (el && voice.remoteStream) el.srcObject = voice.remoteStream;
        }} />
      )}

      {/* Controls */}
      <ClassSessionControls
        voiceStatus={voice.status}
        muted={voice.muted}
        onToggleMute={voice.toggleMute}
        onHandUp={handleHandUp}
        handUpPending={handUpPending}
        hasActiveHandup={hasActiveHandup}
      />

      {/* Forced board overlay */}
      <ClassBoardOverlay
        board={classSession.activeBoardPush as ClassBoardPush | null}
        teacherName="GV"
        onRequestDismiss={handleRequestDismiss}
        dismissRequestPending={dismissPending}
      />

      {/* Debug info */}
      <p
        className="text-[10px] font-mono text-center"
        style={{ color: "var(--muted)" }}
      >
        socket: {connected ? "✓" : "✗"} · session: {classSessionId.slice(0, 8)}…
      </p>
    </div>
  );
}
