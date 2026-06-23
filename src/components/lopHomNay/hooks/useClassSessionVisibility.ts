/**
 * src/components/lopHomNay/hooks/useClassSessionVisibility.ts
 *
 * Step 13b Phase 3 — Track document.visibilitychange → emit socket class:tab-visibility.
 *
 * GV dùng cái này để xem HS có đang focus tab "Lớp hôm nay" không.
 */

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";

export function useClassSessionVisibility(
  socket: Socket | null,
  classSessionId: string | null,
  enabled: boolean = true
): void {
  const lastChangeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled || !socket || !classSessionId) return;

    const send = (event: "visible" | "hidden") => {
      const now = Date.now();
      const visibleMs = now - lastChangeRef.current;
      lastChangeRef.current = now;
      socket.emit("class:tab-visibility", {
        classSessionId,
        event,
        visible_ms: event === "hidden" ? visibleMs : 0,
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        send("visible");
      } else if (document.visibilityState === "hidden") {
        send("hidden");
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [socket, classSessionId, enabled]);
}
