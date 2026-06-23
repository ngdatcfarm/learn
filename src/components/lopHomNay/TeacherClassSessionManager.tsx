/**
 * src/components/lopHomNay/TeacherClassSessionManager.tsx
 *
 * Step 13b Phase 6 — GV-side pane cho "Lớp hôm nay".
 *
 * Render ngay dưới LiveStudentsSection trong TeacherDashboard.
 *
 * 3 modes:
 *  - idle   (no active session) → "▶ Mở lớp" button (gọi POST /api/class-sessions)
 *  - active (session running)   → student list với exit_count + suspicious badge,
 *                                 hand-up queue với "Vào hỗ trợ" → claim
 *                                 → mở TeacherLiveHelpPane (qua callback)
 *  - ended                      → session bị end từ socket → revert idle
 *
 * Realtime:
 *  - useLiveHelpSocket → socket instance
 *  - useClassSessionSocket → suspicious + tab changes + hand-ups + claimed
 *  - REST poll mỗi 30s để bắt active session từ server-side start (defensive)
 *
 * Suspicious flow:
 *  - server/engagement.ts emits `class:suspicious-answer` cho từng task_done nhanh
 *  - hook lưu vào suspiciousAnswers (slice 0..20)
 *  - Manager aggregate theo student_id → badge "⚠ N" trên row tương ứng
 *
 * Exit-count flow:
 *  - server phát `class:tab-state-changed` khi HS switch tab
 *  - Manager count các event 'hidden' theo student_id → badge "🚪 N"
 *
 * Hand-up claim flow:
 *  - GV bấm "Vào hỗ trợ" → POST /api/class-sessions/:id/hand-ups/:huId/claim
 *  - Server tạo live_help_sessions row với trigger='class_session'
 *  - Server emit `class:hand-up-claimed` về GV socket
 *  - Manager fetch liveHelpTeacherQueue() → tìm session mới → setActiveHelpSession
 *  - TeacherDashboard render <TeacherLiveHelpPane session={activeHelpSession} />
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  Play,
  Square,
  Hand,
  Users,
  AlertTriangle,
  DoorOpen,
  Loader2,
} from "lucide-react";
import sound from "../../utils/sound";
import {
  getClassSessionToday,
  startClassSession,
  endClassSession,
  classClaimHandUp,
  liveHelpTeacherQueue,
  ClassSessionLite,
  ClassSessionTodayTeacher,
  type LiveHelpSession,
  type StudentWithStats,
} from "../../api/client";
import { useLiveHelpSocket } from "../livehelp/hooks/useLiveHelpSocket";
import { useClassSessionSocket } from "./hooks/useClassSessionSocket";

interface Props {
  /** Lớp hiện tại GV đang xem (từ TeacherDashboard). */
  classId: string;
  /** Danh sách HS (từ getTeacherDashboard). */
  students: StudentWithStats[];
  /** Mở TeacherLiveHelpPane khi claim hand-up. */
  onOpenHelpSession: (session: LiveHelpSession) => void;
}

export default function TeacherClassSessionManager({
  classId,
  students,
  onOpenHelpSession,
}: Props) {
  const [activeSession, setActiveSession] = useState<ClassSessionLite | null>(null);
  const [pollLoading, setPollLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [claimingHandupId, setClaimingHandupId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { socket, connected } = useLiveHelpSocket();
  const classSession = useClassSessionSocket(socket, activeSession?.id || null);

  // ============================================================
  // Poll active session status (defensive — server is source of truth)
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = (await getClassSessionToday()) as ClassSessionTodayTeacher;
        if (cancelled) return;
        setActiveSession(res.active_session ?? null);
      } catch (e) {
        // Silent — không block UI
        console.warn("[TeacherClassSessionManager] poll failed:", e);
      } finally {
        if (!cancelled) setPollLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ============================================================
  // Khi server broadcast session ended → revert to idle
  // ============================================================
  useEffect(() => {
    if (classSession.state?.status === "ended" || classSession.state?.status === "cancelled") {
      setActiveSession(null);
    }
  }, [classSession.state?.status]);

  // ============================================================
  // Aggregate suspicious flags per student
  // ============================================================
  const suspiciousCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const sa of classSession.suspiciousAnswers) {
      m.set(sa.student_id, (m.get(sa.student_id) ?? 0) + 1);
    }
    return m;
  }, [classSession.suspiciousAnswers]);

  // ============================================================
  // Aggregate tab visibility (exit) count per student
  // ============================================================
  const exitCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of classSession.tabChanges) {
      if (t.event === "hidden") {
        m.set(t.student_id, (m.get(t.student_id) ?? 0) + 1);
      }
    }
    return m;
  }, [classSession.tabChanges]);

  // ============================================================
  // Actions
  // ============================================================
  const handleStart = useCallback(async () => {
    setStarting(true);
    setActionError(null);
    try {
      const res = await startClassSession(classId);
      sound.playClick();
      setActiveSession({
        id: res.session_id,
        class_id: classId,
        started_at: res.started_at,
        status: "active",
      });
    } catch (e: any) {
      setActionError(e?.error || "Không mở được lớp.");
    } finally {
      setStarting(false);
    }
  }, [classId]);

  const handleEnd = useCallback(async () => {
    if (!activeSession) return;
    if (!confirm("Kết thúc buổi học? HS sẽ thấy tab chuyển về chế độ review.")) return;
    setEnding(true);
    setActionError(null);
    try {
      await endClassSession(activeSession.id);
      sound.playClick();
      setActiveSession(null);
    } catch (e: any) {
      setActionError(e?.error || "Không kết thúc được buổi học.");
    } finally {
      setEnding(false);
    }
  }, [activeSession]);

  const handleClaim = useCallback(
    async (handupId: string) => {
      if (!activeSession || claimingHandupId) return;
      setClaimingHandupId(handupId);
      setActionError(null);
      try {
        const res = await classClaimHandUp(activeSession.id, handupId);
        sound.playClick();
        // Server emit class:hand-up-claimed → hook xóa khỏi queue.
        // Fetch live help queue để tìm LiveHelpSession vừa tạo → mở pane.
        const { sessions } = await liveHelpTeacherQueue();
        const opened =
          sessions.find((s) => s.id === res.live_help_session_id) ??
          sessions.find(
            (s) => s.class_id === activeSession.class_id && s.status !== "ended"
          ) ??
          null;
        if (opened) {
          onOpenHelpSession(opened);
        }
      } catch (e: any) {
        setActionError(e?.error || "Không claim được hand-up.");
      } finally {
        setClaimingHandupId(null);
      }
    },
    [activeSession, claimingHandupId, onOpenHelpSession]
  );

  // ============================================================
  // Render
  // ============================================================
  if (pollLoading) {
    return (
      <div
        className="p-5 rounded-3xl border flex items-center gap-3"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <Loader2 className="w-4 h-4 spin-once" style={{ color: "var(--muted)" }} />
        <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          Đang tải lớp hôm nay...
        </span>
      </div>
    );
  }

  // ============================================================
  // IDLE — không có session active
  // ============================================================
  if (!activeSession) {
    return (
      <div
        className="p-5 rounded-3xl border flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background:
                "linear-gradient(135deg, var(--primary-soft) 0%, var(--accent-soft) 100%)",
            }}
          >
            <GraduationCap className="w-6 h-6" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <p className="text-sm font-extrabold">Mở lớp hôm nay</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              HS sẽ thấy tab "Lớp hôm nay" chuyển sang realtime · bạn giám sát ở đây.
            </p>
            {actionError && (
              <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
                {actionError}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleStart}
          disabled={starting}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold shrink-0"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--on-primary)",
            opacity: starting ? 0.6 : 1,
          }}
        >
          {starting ? (
            <Loader2 className="w-3.5 h-3.5 spin-once" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {starting ? "Đang mở..." : "Mở lớp"}
        </button>
      </div>
    );
  }

  // ============================================================
  // ACTIVE — session đang chạy
  // ============================================================
  return (
    <div className="space-y-3">
      {/* Header card */}
      <div
        className="p-5 rounded-3xl border flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        style={{
          background:
            "linear-gradient(120deg, var(--success-soft) 0%, var(--bg-card) 100%)",
          borderColor: "var(--success)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-xl shadow-sm"
            style={{
              background: "linear-gradient(135deg, var(--success) 0%, var(--primary) 100%)",
              color: "#fff",
            }}
          >
            🎓
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-extrabold">Buổi học đang diễn ra</p>
              <span
                className="text-[10px] font-extrabold px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: connected ? "var(--success)" : "var(--warning)",
                  color: "#fff",
                  borderColor: connected ? "var(--success)" : "var(--warning)",
                }}
              >
                ● {connected ? "LIVE" : "RECONNECT..."}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              HS trong lớp đang xem tab "Lớp hôm nay" realtime.
            </p>
            {actionError && (
              <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
                {actionError}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleEnd}
          disabled={ending}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold border shrink-0"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--danger)",
            color: "var(--danger)",
            opacity: ending ? 0.6 : 1,
          }}
        >
          {ending ? (
            <Loader2 className="w-3.5 h-3.5 spin-once" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
          {ending ? "Đang kết thúc..." : "Kết thúc lớp"}
        </button>
      </div>

      {/* Student list with badges */}
      <div
        className="p-5 rounded-3xl border space-y-2.5"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <h3 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "var(--primary)" }} />
            HS trong lớp
          </h3>
          <span className="text-[10px] font-extrabold" style={{ color: "var(--muted)" }}>
            {students.length} em
          </span>
        </div>

        {students.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>
            Lớp chưa có HS nào.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {students.map((s) => {
              const sus = suspiciousCount.get(s.id) ?? 0;
              const exits = exitCount.get(s.id) ?? 0;
              const displayName = s.name || s.username || "?";
              const initial = displayName[0]?.toUpperCase() ?? "?";
              const taskDone = s.today?.task_done_today ?? 0;
              const todayHint =
                taskDone > 0
                  ? `${taskDone} bài hôm nay`
                  : "Chưa làm bài nào hôm nay";
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border"
                  style={{
                    borderColor: sus > 0 ? "var(--danger-soft)" : "var(--border-soft)",
                    backgroundColor: sus > 0 ? "var(--danger-soft)" : "var(--bg-soft)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      color: "var(--foreground)",
                    }}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold truncate">{displayName}</p>
                    <p
                      className="text-[10px] truncate"
                      style={{ color: "var(--muted)" }}
                    >
                      {todayHint}
                    </p>
                  </div>
                  {sus > 0 && (
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                      style={{ backgroundColor: "var(--danger)", color: "#fff" }}
                      title={`${sus} câu trả lời đáng ngờ (quá nhanh)`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {sus}
                    </span>
                  )}
                  {exits > 0 && (
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                      style={{ backgroundColor: "var(--warning)", color: "#fff" }}
                      title={`${exits} lần rời tab`}
                    >
                      <DoorOpen className="w-3 h-3" />
                      {exits}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Hand-up queue */}
      <div
        className="p-5 rounded-3xl border space-y-2.5"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <h3 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
            <Hand className="w-4 h-4" style={{ color: "var(--accent)" }} />
            HS giơ tay
          </h3>
          <span className="text-[10px] font-extrabold" style={{ color: "var(--muted)" }}>
            {classSession.handupQueue.length} em đang chờ
          </span>
        </div>

        {classSession.handupQueue.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>
            Chưa có ai giơ tay — GV chủ động push câu hỏi cho HS nếu cần.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {classSession.handupQueue.map((h) => {
              const isClaiming = claimingHandupId === h.handup_id;
              return (
                <li
                  key={h.handup_id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border"
                  style={{ borderColor: "var(--border-soft)" }}
                >
                  <span className="text-lg">✋</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold truncate">{h.student_name}</p>
                    {h.message && (
                      <p
                        className="text-[10px] truncate italic"
                        style={{ color: "var(--muted)" }}
                      >
                        "{h.message}"
                      </p>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--bg-soft)",
                      color: "var(--muted)",
                    }}
                    title="Vị trí trong hàng đợi"
                  >
                    #{h.queue_position}
                  </span>
                  <button
                    onClick={() => handleClaim(h.handup_id)}
                    disabled={!!claimingHandupId}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold shrink-0"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--on-primary)",
                      opacity: !!claimingHandupId ? 0.6 : 1,
                    }}
                  >
                    {isClaiming && <Loader2 className="w-3 h-3 spin-once" />}
                    {isClaiming ? "Đang vào..." : "Vào hỗ trợ"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Recent suspicious log (collapsed by default) */}
      {classSession.suspiciousAnswers.length > 0 && (
        <details
          className="p-4 rounded-2xl border"
          style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
        >
          <summary
            className="text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
            style={{ color: "var(--foreground-soft)" }}
          >
            <AlertTriangle className="w-3 h-3" style={{ color: "var(--danger)" }} />
            {classSession.suspiciousAnswers.length} suspicious flag gần nhất
          </summary>
          <ul className="mt-2 space-y-1">
            {classSession.suspiciousAnswers.slice(0, 10).map((sa, i) => {
              const stu = students.find((s) => s.id === sa.student_id);
              const name =
                stu?.name || stu?.username || sa.student_id.slice(0, 8);
              const seconds = (sa.time_ms / 1000).toFixed(1);
              return (
                <li
                  key={`${sa.question_id}-${i}`}
                  className="text-[10px] font-mono flex items-center gap-2"
                  style={{ color: "var(--muted)" }}
                >
                  <span className="font-extrabold" style={{ color: "var(--danger)" }}>
                    ⚠ {seconds}s
                  </span>
                  <span className="truncate">{name}</span>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <span>q={sa.question_id.slice(0, 8)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
