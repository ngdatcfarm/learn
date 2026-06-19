/**
 * src/components/livehelp/HighlightOverlay.tsx
 *
 * Step 12b — Floating yellow banner hiển thị trên màn hình HS khi GV
 * broadcast highlight qua socket.
 *
 * UX:
 *  - Fixed position, top-center (dưới header)
 *  - Yellow background + note + "GV đang chỉ" badge
 *  - Dismiss button (HS có thể tắt nếu muốn)
 *  - Tự động ẩn khi nhận highlight:clear event
 *
 * Note: đây là "highlight" dạng banner overlay (slice B scope). Highlight
 * lên câu cụ thể trong bài HS đang làm (CSS selector) sẽ là scope mở rộng.
 */

import { motion, AnimatePresence } from "motion/react";
import { X, Highlighter } from "lucide-react";
import type { HighlightEvent } from "./hooks/useLiveHelpSocket";

export interface HighlightOverlayProps {
  highlight: HighlightEvent | null;
  teacherName?: string;
  onDismiss?: () => void;
}

export function HighlightOverlay({
  highlight,
  teacherName = "GV",
  onDismiss,
}: HighlightOverlayProps) {
  return (
    <AnimatePresence>
      {highlight && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md"
        >
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl border-2"
            style={{
              backgroundColor: "rgba(254, 240, 138, 0.95)", // yellow-200
              borderColor: "#facc15", // yellow-400
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="shrink-0 mt-0.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#facc15", color: "#713f12" }}
              >
                <Highlighter className="w-4 h-4" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[10px] font-extrabold uppercase tracking-wider mb-0.5"
                style={{ color: "#713f12" }}
              >
                💡 {teacherName} đang chỉ em
              </div>
              <div
                className="text-sm font-extrabold whitespace-pre-wrap break-words"
                style={{ color: "#422006" }}
              >
                {highlight.note || highlight.selector}
              </div>
              {highlight.selector && highlight.note && (
                <div
                  className="text-[10px] mt-1 italic opacity-70"
                  style={{ color: "#713f12" }}
                >
                  Selector: {highlight.selector}
                </div>
              )}
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="shrink-0 p-1 rounded-lg transition-colors"
                style={{ color: "#713f12" }}
                title="Tắt highlight"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}