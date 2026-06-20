/**
 * src/components/livehelp/ObserveScreenView.tsx
 *
 * Step 12d P3 — GV-side read-only JSON card rendering the HS's screen state.
 *
 * P3 chỉ hiển thị JSON state mà HS emit mỗi ~1.5s. Canvas drawing thật
 * (getDisplayMedia capture) deferred sang P6.
 *
 * Truncate ở ~500 chars để tránh quá tải UI khi state lớn.
 */

import { Monitor } from "lucide-react";
import type { ScreenStateEvent } from "./hooks/useLiveHelpSocket";

const MAX_LEN = 500;

export function ObserveScreenView({
  state,
}: {
  state: ScreenStateEvent | null;
}) {
  if (!state) {
    return (
      <div
        className="h-full rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-2 text-center"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <Monitor className="w-8 h-8" style={{ color: "var(--muted)" }} />
        <p className="text-sm font-extrabold" style={{ color: "var(--muted-strong)" }}>
          Chưa có screen state từ HS
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          HS sẽ gửi state JSON mỗi ~1.5s sau khi accept observe.
          <br />
          P6 sẽ render canvas thật từ <code>getDisplayMedia</code>.
        </p>
      </div>
    );
  }

  const json = JSON.stringify(state.state, null, 2);
  const truncated = json.length > MAX_LEN ? json.slice(0, MAX_LEN) + "\n…(truncated)" : json;

  return (
    <div
      className="h-full rounded-2xl border overflow-hidden flex flex-col"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 border-b text-[11px] font-extrabold uppercase tracking-wider"
        style={{ borderColor: "var(--border-soft)", color: "var(--muted-strong)" }}
      >
        <Monitor className="w-3.5 h-3.5" />
        Screen state (JSON snapshot)
      </div>
      <pre
        className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all"
        style={{ color: "var(--muted-strong)", backgroundColor: "var(--bg-soft)" }}
      >
        {truncated}
      </pre>
      <div
        className="px-3 py-1.5 text-[10px] border-t"
        style={{ borderColor: "var(--border-soft)", color: "var(--muted)" }}
      >
        Cập nhật lúc {new Date(state.received_at).toLocaleTimeString("vi-VN")}
      </div>
    </div>
  );
}