import { type ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

/**
 * ModalShell — Shared modal wrapper dùng bởi AdminUserModals + InboxSection (Step 7).
 * Pattern: fixed overlay + motion.div max-w-md rounded-3xl.
 * Footer slot: 1 row flex với border-top.
 */
export function ModalShell({
  title,
  onClose,
  children,
  footer,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ backgroundColor: "var(--bg-overlay)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={`${maxWidth} w-full rounded-3xl border p-6 relative space-y-4 shadow-2xl`}
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex justify-between items-center pb-3 border-b"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <span className="text-base font-extrabold">{title}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl transition-colors"
            style={{ color: "var(--muted)" }}
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3.5">{children}</div>
        {footer && (
          <div
            className="flex gap-2.5 pt-2 border-t"
            style={{ borderColor: "var(--border-soft)" }}
          >
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}
