/**
 * src/components/livehelp/ObserveIncomingModal.tsx
 *
 * Step 12d P3 — HS-side accept prompt when GV clicks "Vào xem".
 *
 * Hiển thị qua `<ModalShell>`. KHÔNG auto-dismiss — parent chịu trách nhiệm
 * clear state khi HS accept/reject (hoặc khi nhận observe:ended).
 */

import { Eye, ShieldCheck } from "lucide-react";
import { ModalShell } from "../ui/ModalShell";
import type { ObserveIncomingEvent } from "./hooks/useLiveHelpSocket";

export function ObserveIncomingModal({
  payload,
  onAccept,
  onReject,
}: {
  payload: ObserveIncomingEvent;
  onAccept: (sessionId: string) => void;
  onReject: (sessionId: string) => void;
}) {
  const teacherName = payload.teacher_name || "Giáo viên";

  return (
    <ModalShell
      title="GV muốn quan sát em"
      onClose={() => onReject(payload.session_id)}
      footer={
        <>
          <button
            onClick={() => onReject(payload.session_id)}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-extrabold"
            style={{
              backgroundColor: "var(--bg-soft)",
              color: "var(--muted-strong)",
            }}
          >
            Từ chối
          </button>
          <button
            onClick={() => onAccept(payload.session_id)}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2"
            style={{
              backgroundColor: "var(--success)",
              color: "#fff",
            }}
          >
            <Eye className="w-4 h-4" />
            Chấp nhận
          </button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-base font-extrabold"
          style={{
            backgroundColor: "var(--primary-soft)",
            color: "var(--primary)",
          }}
        >
          {teacherName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-base">{teacherName}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            muốn quan sát em lúc này
          </p>
        </div>
      </div>

      <div
        className="rounded-2xl p-3 text-xs space-y-1.5"
        style={{ backgroundColor: "var(--bg-soft)" }}
      >
        <p className="font-extrabold flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: "var(--success)" }} />
          Khi accept, GV sẽ:
        </p>
        <ul className="space-y-1 pl-5 list-disc" style={{ color: "var(--muted-strong)" }}>
          <li>Nghe và nói chuyện với em qua voice</li>
          <li>Xem bài em đang làm</li>
          <li>Vẽ trên bảng trắng để giải thích</li>
        </ul>
      </div>

      <p className="text-[10px]" style={{ color: "var(--muted)" }}>
        🦉 Em có thể kết thúc bất cứ lúc nào bằng nút "Kết thúc".
      </p>
    </ModalShell>
  );
}