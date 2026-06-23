/**
 * src/components/lopHomNay/LopHomNayTab.tsx
 *
 * Step 13b Phase 2 — Main tab "Lớp hôm nay" cho HS.
 *
 * State machine:
 *   - loading       → spinner
 *   - no-class      → greeting + countdown + ClassReviewView + "AI luyện tập" button
 *   - in-class      → <ClassSessionView /> (Phase 3)
 *   - error         → error message + retry
 *
 * On mount: GET /api/class-sessions/today → check `session` field (student shape).
 */

import { useEffect, useState } from "react";
import { GraduationCap, Sparkles, Clock, AlertTriangle } from "lucide-react";
import sound from "../../utils/sound";
import {
  getClassSessionToday,
  ClassSessionTodayStudent,
} from "../../api/client";
import ClassReviewView from "./ClassReviewView";
import ClassSessionView from "./ClassSessionView";

interface Props {
  /** Open AI chat popup (Phase 7). */
  onOpenAiChat?: () => void;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "no-class"; data: ClassSessionTodayStudent }
  | { kind: "in-class"; sessionId: string; classId: string }
  | { kind: "error"; message: string };

export default function LopHomNayTab({ onOpenAiChat }: Props) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await getClassSessionToday()) as ClassSessionTodayStudent;
        if (cancelled) return;
        if (res.session && res.session.status === "active" && res.session.id) {
          setState({
            kind: "in-class",
            sessionId: res.session.id,
            classId: res.class_id || "",
          });
        } else {
          setState({ kind: "no-class", data: res });
        }
      } catch (e: any) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: e?.message || "Không tải được lớp hôm nay.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center p-12">
        <div
          className="text-sm font-bold"
          style={{ color: "var(--muted)" }}
        >
          Đang tải...
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="p-5 rounded-2xl border flex items-start gap-3"
        style={{
          backgroundColor: "var(--danger-soft)",
          borderColor: "var(--danger)",
        }}
      >
        <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: "var(--danger)" }} />
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>
            Có lỗi
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--foreground)" }}>
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "in-class") {
    return <ClassSessionView classSessionId={state.sessionId} classId={state.classId} />;
  }

  // no-class
  const { data } = state;
  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div
        className="relative overflow-hidden p-6 md:p-7 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-5"
        style={{
          background:
            "linear-gradient(120deg, var(--bg-card) 0%, var(--accent-soft) 50%, var(--bg-card) 100%)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-4 relative z-10">
          <div className="floaty w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-400 to-sky-500 flex items-center justify-center text-2xl shadow-md">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
              Lớp hôm nay
            </h1>
            <p
              className="text-sm font-bold mt-1"
              style={{ color: "var(--muted)" }}
            >
              {data.countdown?.label || "GV chưa mở lớp — chờ nhé!"}
            </p>
          </div>
        </div>

        {data.countdown && data.countdown.approx_minutes > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-xl border shrink-0"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border)",
            }}
          >
            <Clock className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="text-xs font-extrabold">
              ~{Math.round(data.countdown.approx_minutes / 60)}h tới buổi
            </span>
          </div>
        )}
      </div>

      {/* AI practice CTA */}
      {onOpenAiChat && (
        <button
          onClick={() => {
            sound.playClick();
            onOpenAiChat();
          }}
          className="w-full p-4 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all hover:scale-[1.01]"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--accent)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦊</span>
            <div>
              <p className="text-sm font-extrabold">AI luyện tập</p>
              <p
                className="text-xs"
                style={{ color: "var(--muted)" }}
              >
                Chat với AI để ôn từ vựng, luyện câu.
              </p>
            </div>
          </div>
          <Sparkles className="w-5 h-5" style={{ color: "var(--accent)" }} />
        </button>
      )}

      {/* Review hôm qua */}
      <section>
        <h2 className="text-base font-extrabold mb-3 flex items-center gap-2">
          📝 Review buổi trước
        </h2>
        <ClassReviewView review={data.review} />
      </section>
    </div>
  );
}
