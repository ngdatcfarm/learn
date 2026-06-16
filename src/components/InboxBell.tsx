/**
 * src/components/InboxBell.tsx — Bell icon với red-dot indicator
 *
 * Dùng bởi App.tsx (header) cho TẤT CẢ roles (HS / PH / GV / Admin).
 * Click → mở InboxPopup. Khi `unread > 0` thì có chấm đỏ trên bell.
 */

import { Bell } from "lucide-react";

interface InboxBellProps {
  unreadCount: number;
  onClick: () => void;
  theme: "dark" | "light";
}

export function InboxBell({ unreadCount, onClick, theme }: InboxBellProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Hộp thư"
      title={unreadCount > 0 ? `${unreadCount} tin nhắn chưa đọc` : "Hộp thư"}
      className="relative p-2 rounded-full transition-all hover:scale-110"
      style={{
        backgroundColor: "var(--surface-2)",
        color: "var(--text)",
        border: "1px solid var(--border)",
      }}
    >
      <Bell size={18} />
      {unreadCount > 0 && (
        <span
          className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: "var(--danger)",
            border: `2px solid var(${theme === "dark" ? "--bg" : "--surface"})`,
          }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
