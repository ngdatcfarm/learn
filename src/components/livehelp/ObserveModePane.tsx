/**
 * src/components/livehelp/ObserveModePane.tsx
 *
 * Step 12d P3 — GV-side full-screen pane mở khi GV click "Vào xem" trên 1 HS row.
 *
 * Layout:
 *  - Top bar: student avatar+name, status pill, duration timer, X close.
 *  - Body 2-col (60/40):
 *    - Left (60%): <ObserveScreenView state={latestScreenState} />
 *    - Right (40%): 3 sections — assignment+questions, whiteboard, voice.
 *  - Bottom bar: "Kết thúc observe" button.
 *
 * Auto-connect: useEffect khi observeStatus="ready" → gọi startCall() →
 * useVoiceCall tạo peer với initiator=true → emit call:offer → HS (autoAnswer)
 * accept ngay → voice connect.
 *
 * Cleanup: unmount + status ready/waiting-hs → emit observe:end.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import {
  X,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Loader2,
  AlertCircle,
  Eye,
  ListChecks,
  Brush,
  ArrowRight,
  Clock,
} from "lucide-react";
import type { ActiveStudent, StudentCurrentSession } from "../../api/client";
import { getStudentCurrentSession } from "../../api/client";
import {
  useLiveHelpSocket,
  type ScreenStateEvent,
  type WhiteboardOpenEvent,
} from "./hooks/useLiveHelpSocket";
import { useVoiceCall, type CallStatus } from "./hooks/useVoiceCall";
import { ObserveScreenView } from "./ObserveScreenView";

const STALE_TIMEOUT_MS = 30_000; // 30s chờ HS accept trước khi báo timeout

type ObserveStatus =
  | "starting"        // đã emit observe:start, chờ server response
  | "waiting-hs"      // server đã tạo session, HS chưa accept
  | "ready"           // HS đã accept, voice đang/connecting
  | "ended"           // session ended (clean)
  | "rejected"        // HS từ chối
  | "error";          // server báo lỗi

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const STATUS_LABEL: Record<ObserveStatus, string> = {
  starting: "Đang khởi tạo...",
  "waiting-hs": "Chờ HS chấp nhận...",
  ready: "Đang quan sát",
  ended: "Đã kết thúc",
  rejected: "HS đã từ chối",
  error: "Lỗi",
};

const STATUS_COLOR: Record<ObserveStatus, string> = {
  starting: "var(--muted)",
  "waiting-hs": "var(--warning)",
  ready: "var(--success)",
  ended: "var(--muted)",
  rejected: "var(--warning)",
  error: "var(--error)",
};

export function ObserveModePane({
  student,
  onClose,
}: {
  student: ActiveStudent;
  onClose: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [context, setContext] = useState<StudentCurrentSession | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [observeStatus, setObserveStatus] = useState<ObserveStatus>("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latestScreenState, setLatestScreenState] = useState<ScreenStateEvent | null>(null);
  const [whiteboardOpen, setWhiteboardOpen] = useState<WhiteboardOpenEvent | null>(null);
  const [whiteboardStrokeCount, setWhiteboardStrokeCount] = useState<number>(0);
  const startedAtRef = useRef<string | null>(null);
  const staleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we already emitted observe:end (to avoid double-emit on remount).
  const endedRef = useRef(false);

  // ============================================================
  // Initial: fetch student context + start observe
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ctx = await getStudentCurrentSession(student.id);
        if (!cancelled) setContext(ctx);
      } catch (e) {
        console.warn("[ObserveModePane] getStudentCurrentSession failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [student.id]);

  // ============================================================
  // Socket: observe + screen + whiteboard events
  // ============================================================
  const {
    socket,
    emitObserveStart,
    emitObserveEnd,
    emitWhiteboardOpen,
    emitWhiteboardClose,
  } = useLiveHelpSocket({
    onObserveStarted: (e) => {
      setSessionId(e.session_id);
      startedAtRef.current = e.started_at;
      setObserveStatus("waiting-hs");
      // 30s stale timer — nếu HS không accept, cảnh báo + auto-cleanup.
      if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
      staleTimeoutRef.current = setTimeout(() => {
        setObserveStatus((s) => {
          if (s === "waiting-hs") {
            setErrorMsg("HS không phản hồi trong 30s. Tự động kết thúc.");
            emitObserveEnd(e.session_id, "timeout");
            endedRef.current = true;
            return "ended";
          }
          return s;
        });
      }, STALE_TIMEOUT_MS);
    },
    onObserveReady: (e) => {
      if (staleTimeoutRef.current) {
        clearTimeout(staleTimeoutRef.current);
        staleTimeoutRef.current = null;
      }
      setSessionId(e.session_id);
      setObserveStatus("ready");
    },
    onObserveEnded: () => {
      setObserveStatus("ended");
      endedRef.current = true;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      // Toast rồi đóng pane sau 1.5s.
      closeTimerRef.current = setTimeout(() => onClose(), 1500);
    },
    onObserveRejected: () => {
      setObserveStatus("rejected");
      endedRef.current = true;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => onClose(), 3000);
    },
    onObserveError: (e) => {
      setObserveStatus("error");
      setErrorMsg(e.message);
      endedRef.current = true;
      // GV thấy lỗi → đóng pane sau 4s (cho đọc message).
      closeTimerRef.current = setTimeout(() => onClose(), 4000);
    },
    onScreenState: (e) => {
      setLatestScreenState(e);
    },
    onWhiteboardOpen: (e) => {
      setWhiteboardOpen(e);
      setWhiteboardStrokeCount(0);
    },
    onWhiteboardStroke: () => {
      setWhiteboardStrokeCount((n) => n + 1);
    },
    onWhiteboardClear: () => {
      setWhiteboardStrokeCount(0);
    },
    onWhiteboardClose: () => {
      setWhiteboardOpen(null);
      setWhiteboardStrokeCount(0);
    },
  });

  // ============================================================
  // Voice call (chỉ dùng khi observeStatus=ready)
  // ============================================================
  const {
    status: callStatus,
    muted,
    durationSec,
    error: callError,
    startCall,
    endCall,
    toggleMute,
  } = useVoiceCall({ socket, sessionId: sessionId ?? undefined, autoAnswer: false });

  // Auto-start call khi HS accept
  useEffect(() => {
    if (observeStatus === "ready" && sessionId && callStatus === "idle") {
      startCall().catch((e) => console.warn("[ObserveModePane] startCall failed:", e));
    }
  }, [observeStatus, sessionId, callStatus, startCall]);

  // Emit observe:start ONCE on mount (khi socket connect).
  useEffect(() => {
    if (socket && !sessionId && !endedRef.current && observeStatus === "starting") {
      emitObserveStart({ studentId: student.id });
    }
  }, [socket, sessionId, observeStatus, emitObserveStart, student.id]);

  // ============================================================
  // Cleanup on unmount
  // ============================================================
  const handleClose = useCallback(() => {
    // Cleanup voice first
    if (callStatus === "connected" || callStatus === "calling") {
      endCall();
    }
    // Emit observe:end nếu session vẫn active
    if (sessionId && !endedRef.current && (observeStatus === "ready" || observeStatus === "waiting-hs")) {
      emitObserveEnd(sessionId, "teacher_left");
      endedRef.current = true;
    }
    onClose();
  }, [callStatus, sessionId, observeStatus, emitObserveEnd, endCall, onClose]);

  useEffect(() => {
    return () => {
      if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      // Final cleanup — emit nếu chưa
      // (state captured at unmount via ref trick không cần — server idempotent)
    };
  }, []);

  // ============================================================
  // Render
  // ============================================================
  const statusColor = STATUS_COLOR[observeStatus];
  const statusLabel = STATUS_LABEL[observeStatus];
  const showTimer = callStatus === "connected";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "var(--bg)" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-card)" }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold"
          style={{ backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}
        >
          {student.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" style={{ color: "var(--primary)" }} />
            <p className="font-extrabold text-sm truncate">
              Đang quan sát: {student.name}
            </p>
          </div>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            @{student.username} • {student.class_name || "Chưa có lớp"}
          </p>
        </div>
        <div
          className="px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1.5"
          style={{ backgroundColor: statusColor, color: "#fff" }}
        >
          {observeStatus === "ready" && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"
              style={{ animationDuration: "1.5s" }}
            />
          )}
          {statusLabel}
        </div>
        {showTimer && (
          <div
            className="px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 tabular-nums"
            style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted-strong)" }}
          >
            <Clock className="w-3 h-3" />
            {formatDuration(durationSec)}
          </div>
        )}
        <button
          onClick={handleClose}
          className="p-1.5 rounded-xl"
          style={{ color: "var(--muted)" }}
          title="Đóng"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body 2-col */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3 p-3 min-h-0 overflow-hidden">
        {/* Left: screen view (60%) */}
        <div className="md:col-span-3 min-h-0">
          <ObserveScreenView state={latestScreenState} />
        </div>

        {/* Right: questions + whiteboard + voice (40%) */}
        <div className="md:col-span-2 flex flex-col gap-3 min-h-0 overflow-y-auto">
          {/* Bài đang làm */}
          <section
            className="rounded-2xl border p-3 space-y-2"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted-strong)" }}>
              <ListChecks className="w-3.5 h-3.5" />
              Bài đang làm
            </div>
            {context?.has_assignment && context.assignment ? (
              <>
                <p className="text-xs font-extrabold">{context.assignment.title}</p>
                {context.assignment.questions.length > 0 ? (
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {context.assignment.questions.map((q, idx) => {
                      const isSelected = selectedQuestionId === q.id;
                      return (
                        <li key={q.id}>
                          <button
                            onClick={() => {
                              setSelectedQuestionId(q.id);
                              if (sessionId) {
                                emitWhiteboardOpen(sessionId, q.id, idx);
                              }
                            }}
                            className="w-full text-left text-[11px] px-2 py-1.5 rounded-lg flex items-start gap-1.5 transition-colors"
                            style={{
                              backgroundColor: isSelected ? "var(--primary-soft)" : "var(--bg-soft)",
                              color: isSelected ? "var(--primary)" : "var(--muted-strong)",
                              border: isSelected ? "1px solid var(--primary)" : "1px solid transparent",
                            }}
                          >
                            <span className="font-extrabold">{idx + 1}.</span>
                            <span className="line-clamp-2 flex-1">{q.text}</span>
                            <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "var(--muted)" }} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                    Bài này chưa có câu hỏi.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                HS chưa mở bài nào.
              </p>
            )}
          </section>

          {/* Bảng trắng (placeholder cho P5) */}
          <section
            className="rounded-2xl border p-3 space-y-2"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted-strong)" }}>
                <Brush className="w-3.5 h-3.5" />
                Bảng trắng
              </div>
              {whiteboardOpen && (
                <button
                  onClick={() => {
                    if (sessionId) emitWhiteboardClose(sessionId);
                  }}
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-md"
                  style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted-strong)" }}
                >
                  Đóng
                </button>
              )}
            </div>
            <div
              className="h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-1 p-3"
              style={{ borderColor: "var(--border-soft)" }}
            >
              <Brush className="w-5 h-5" style={{ color: "var(--muted)" }} />
              {whiteboardOpen ? (
                <>
                  <p className="text-[11px] font-extrabold" style={{ color: "var(--muted-strong)" }}>
                    Đang mở câu {whiteboardOpen.question_idx != null ? whiteboardOpen.question_idx + 1 : "?"}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                    {whiteboardStrokeCount} nét vẽ
                  </p>
                </>
              ) : (
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  Click 1 câu hỏi ở trên để mở bảng trắng.
                  <br />
                  P5 sẽ render canvas thật ở đây.
                </p>
              )}
            </div>
          </section>

          {/* Voice */}
          <section
            className="rounded-2xl border p-3 space-y-2"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted-strong)" }}>
              🎙️ Voice
            </div>
            {observeStatus !== "ready" && (
              <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
                <Loader2 className="w-3 h-3 animate-spin" />
                {observeStatus === "waiting-hs"
                  ? "Voice sẽ tự kết nối khi HS accept..."
                  : "Đang khởi tạo session..."}
              </div>
            )}
            {observeStatus === "ready" && callStatus === "idle" && (
              <button
                onClick={() => startCall().catch(() => {})}
                className="w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2"
                style={{ backgroundColor: "var(--success)", color: "#fff" }}
              >
                <Phone className="w-3.5 h-3.5" />
                Gọi HS
              </button>
            )}
            {callStatus === "calling" && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--primary)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Đang kết nối HS...
                <button
                  onClick={endCall}
                  className="ml-auto px-2 py-1 rounded-lg text-[10px] font-extrabold"
                  style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted-strong)" }}
                >
                  Huỷ
                </button>
              </div>
            )}
            {callStatus === "connected" && (
              <div className="flex items-center gap-2">
                <div className="flex flex-col flex-1">
                  <span className="text-xs font-extrabold" style={{ color: "var(--success)" }}>
                    🎙️ Đang nói chuyện với {student.name}
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--muted)" }}>
                    {formatDuration(durationSec)}
                  </span>
                </div>
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-xl"
                  style={{
                    backgroundColor: "var(--bg-soft)",
                    color: muted ? "var(--warning)" : "var(--muted-strong)",
                  }}
                  title={muted ? "Bật mic" : "Tắt mic"}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  onClick={endCall}
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: "var(--error)", color: "#fff" }}
                  title="Kết thúc voice"
                >
                  <PhoneOff className="w-4 h-4" />
                </button>
              </div>
            )}
            {callStatus === "ended" && (
              <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
                Cuộc gọi đã kết thúc.
                <button
                  onClick={() => startCall().catch(() => {})}
                  className="ml-auto px-2 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1"
                  style={{ backgroundColor: "var(--success)", color: "#fff" }}
                >
                  <Phone className="w-3 h-3" />
                  Gọi lại
                </button>
              </div>
            )}
            {callError && (
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--error)" }}>
                <AlertCircle className="w-3 h-3" />
                {callError}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-t"
        style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-card)" }}
      >
        {errorMsg && (
          <div className="flex items-center gap-1.5 text-xs flex-1" style={{ color: "var(--error)" }}>
            <AlertCircle className="w-3.5 h-3.5" />
            {errorMsg}
          </div>
        )}
        {!errorMsg && observeStatus === "waiting-hs" && (
          <p className="text-xs flex-1" style={{ color: "var(--muted)" }}>
            ⏳ Đang chờ HS chấp nhận observe (timeout 30s)...
          </p>
        )}
        {!errorMsg && observeStatus === "ready" && (
          <p className="text-xs flex-1" style={{ color: "var(--muted)" }}>
            🟢 Voice đang kết nối. Click "Kết thúc" để rời observe mode.
          </p>
        )}
        {!errorMsg && observeStatus === "rejected" && (
          <p className="text-xs flex-1" style={{ color: "var(--warning)" }}>
            HS đã từ chối. Pane sẽ tự đóng sau 3s.
          </p>
        )}
        {!errorMsg && observeStatus === "starting" && (
          <p className="text-xs flex-1" style={{ color: "var(--muted)" }}>
            Đang khởi tạo session...
          </p>
        )}
        <button
          onClick={handleClose}
          className="px-4 py-2 rounded-xl text-sm font-extrabold flex items-center gap-2"
          style={{
            backgroundColor: "var(--error)",
            color: "#fff",
          }}
        >
          <X className="w-4 h-4" />
          Kết thúc observe
        </button>
      </div>
    </motion.div>
  );
}

// Re-export ActiveStudent type cho TeacherDashboard import dễ.
export type { ActiveStudent };