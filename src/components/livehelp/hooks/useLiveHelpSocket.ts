/**
 * src/components/livehelp/hooks/useLiveHelpSocket.ts
 *
 * Step 12b — Socket.IO client cho /live-help namespace.
 *
 * Lifecycle:
 *  - mount → connect to namespace with auth token
 *  - joinSession(id) → emit session:join, đợi session:joined
 *  - listen for hint:new, session:ended, highlight:show, highlight:clear
 *  - unmount → leave session + disconnect
 *
 * Pattern: 1 socket instance per useLiveHelpSocket call. Mỗi modal có
 * socket riêng (HS + Teacher pane cùng active sẽ có 2 sockets).
 *
 * Slice B: highlight events. Slice C: thêm call:* events cho WebRTC.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getToken } from "../../../api/client";

const NAMESPACE = "/live-help";

export interface HighlightEvent {
  id: string;
  session_id: string;
  teacher_id: string;
  selector: string;
  color: string;
  note: string | null;
  created_at: string;
}

export interface HintEvent {
  id: string;
  session_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "student" | "parent" | "teacher" | "admin";
  message: string;
  created_at: string;
}

export interface SessionEndedEvent {
  session_id: string;
  outcome: string;
  ended_by_role: string;
}

export interface UseLiveHelpSocketOptions {
  /** Session ID to join on mount (optional — có thể join sau). */
  sessionId?: string;
  /** Called khi nhận hint mới (realtime, không phải initial load). */
  onHint?: (hint: HintEvent) => void;
  /** Called khi session ended (realtime). */
  onSessionEnded?: (e: SessionEndedEvent) => void;
  /** Called khi teacher broadcast highlight. */
  onHighlight?: (h: HighlightEvent) => void;
  /** Called khi teacher clear highlight. */
  onHighlightClear?: () => void;
  /** Called khi socket connect thành công. */
  onConnected?: () => void;
}

export function useLiveHelpSocket(options: UseLiveHelpSocketOptions = {}) {
  const {
    sessionId: initialSessionId,
    onHint,
    onSessionEnded,
    onHighlight,
    onHighlightClear,
    onConnected,
  } = options;

  const [connected, setConnected] = useState(false);
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Refs để latest callbacks được dùng trong event handlers
  // (tránh stale closure khi options thay đổi)
  const callbacksRef = useRef({ onHint, onSessionEnded, onHighlight, onHighlightClear, onConnected });
  callbacksRef.current = { onHint, onSessionEnded, onHighlight, onHighlightClear, onConnected };

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    const token = getToken();
    if (!token) {
      console.warn("[useLiveHelpSocket] No auth token");
      return;
    }

    const socket = io(NAMESPACE, {
      auth: { token },
      transports: ["websocket", "polling"], // fallback nếu WS bị block
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    setSocket(socket);

    socket.on("connect", () => {
      setConnected(true);
      callbacksRef.current.onConnected?.();
      // Auto-join initial session nếu có
      if (initialSessionId) {
        socket.emit("session:join", { sessionId: initialSessionId });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[useLiveHelpSocket] disconnected:", reason);
      setConnected(false);
      setJoinedSessionId(null);
    });

    socket.on("connect_error", (err) => {
      console.warn("[useLiveHelpSocket] connect_error:", err.message);
    });

    socket.on("session:joined", ({ sessionId }: { sessionId: string }) => {
      setJoinedSessionId(sessionId);
    });

    socket.on("hint:new", (hint: HintEvent) => {
      callbacksRef.current.onHint?.(hint);
    });

    socket.on("session:ended", (e: SessionEndedEvent) => {
      callbacksRef.current.onSessionEnded?.(e);
    });

    socket.on("highlight:show", (h: HighlightEvent) => {
      callbacksRef.current.onHighlight?.(h);
    });

    socket.on("highlight:clear", () => {
      callbacksRef.current.onHighlightClear?.();
    });

    socket.on("error", (err: { message: string }) => {
      console.warn("[useLiveHelpSocket] error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      setJoinedSessionId(null);
    };
  }, [initialSessionId]);

  // Public actions
  const joinSession = useCallback((sessionId: string) => {
    socketRef.current?.emit("session:join", { sessionId });
  }, []);

  const leaveSession = useCallback((sessionId: string) => {
    socketRef.current?.emit("session:leave", { sessionId });
  }, []);

  const sendHighlight = useCallback(
    (sessionId: string, selector: string, color?: string, note?: string) => {
      socketRef.current?.emit("highlight:show", {
        sessionId,
        selector,
        color,
        note,
      });
    },
    []
  );

  const clearHighlight = useCallback((sessionId: string) => {
    socketRef.current?.emit("highlight:clear", { sessionId });
  }, []);

  return {
    socket,
    connected,
    joinedSessionId,
    joinSession,
    leaveSession,
    sendHighlight,
    clearHighlight,
  };
}