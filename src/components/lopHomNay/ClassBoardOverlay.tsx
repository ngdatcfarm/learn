/**
 * src/components/lopHomNay/ClassBoardOverlay.tsx
 *
 * Step 13b Phase 4 — Forced-focus board (GV push câu hỏi lên màn HS).
 *
 * Khác HighlightOverlay (Cấp 3):
 *  - KHÔNG có nút X (dismiss) — HS không tự tắt được
 *  - Có nút "Xin tắt" → gọi classBoardDismissRequest → chờ GV approve
 *  - Visual khác biệt (red/orange tint để báo "cần tập trung")
 */

import { motion, AnimatePresence } from "motion/react";
import { Hand, AlertOctagon } from "lucide-react";
import type { ClassBoardPush } from "./hooks/useClassSessionSocket";

interface Props {
  board: ClassBoardPush | null;
  teacherName?: string;
  onRequestDismiss: (boardId: string) => void;
  dismissRequestPending?: boolean;
}

export default function ClassBoardOverlay({
  board,
  teacherName = "GV",
  onRequestDismiss,
  dismissRequestPending = false,
}: Props) {
  const requested =
    board &&
    // requested_at is server-managed; we infer from this flag passed by parent
    // to avoid an extra server roundtrip
    Boolean((board as any).dismissed_requested_at);

  return (
    <AnimatePresence>
      {board && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)]"
        >
          <div
            className="flex flex-col gap-2 px-4 py-3 rounded-2xl shadow-2xl border-2"
            style={{
              backgroundColor: "rgba(254, 215, 170, 0.97)", // orange-200
              borderColor: "#fb923c", // orange-400
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#fb923c", color: "#7c2d12" }}
                >
                  <AlertOctagon className="w-4 h-4" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-extrabold uppercase tracking-wider mb-0.5"
                  style={{ color: "#7c2d12" }}
                >
                  🎯 {teacherName} đang focus em — đọc kỹ câu hỏi
                </div>
                {board.note && (
                  <div
                    className="text-sm font-extrabold whitespace-pre-wrap break-words"
                    style={{ color: "#431407" }}
                  >
                    {board.note}
                  </div>
                )}
                <div
                  className="text-[10px] mt-1 font-mono"
                  style={{ color: "#7c2d12" }}
                >
                  Question: {board.question_id || "—"}
                </div>
              </div>
            </div>
            <button
              onClick={() => onRequestDismiss(board.board_id)}
              disabled={dismissRequestPending || requested}
              className="w-full text-xs font-extrabold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
              style={{
                backgroundColor: requested ? "var(--success-soft)" : "var(--bg-elevated)",
                color: requested ? "var(--success)" : "#7c2d12",
                border: requested ? "1px solid var(--success)" : "1px solid #7c2d12",
              }}
            >
              <Hand className="w-3.5 h-3.5" />
              {requested
                ? "✓ Đã xin tắt — chờ GV duyệt"
                : dismissRequestPending
                ? "Đang gửi..."
                : "Xin tắt"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
