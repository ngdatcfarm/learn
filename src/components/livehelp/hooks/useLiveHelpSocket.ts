/**
 * src/components/livehelp/hooks/useLiveHelpSocket.ts
 *
 * Step 12b — Socket.IO client cho /live-help namespace.
 *
 * Lifecycle:
 *  - mount → connect to namespace with auth token
 *  - joinSession(id) → emit session:join, đợi session:joined
 *  - listen for hint:new, session:ended, highlight:show, highlight:clear,
 *    observe:*, screen:*, whiteboard:*, call:peer-left
 *  - unmount → leave session + disconnect
 *
 * Pattern: 1 socket instance per useLiveHelpSocket call. Mỗi modal có
 * socket riêng (HS + Teacher pane cùng active sẽ có 2 sockets).
 *
 * Slice B: highlight events.
 * Slice C: voice signaling (call:*).
 * Step 12d P3: GV-driven observe (observe:*, screen:*, whiteboard:*).
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

// ============================================================
// Step 12d — Observe mode event types
// ============================================================

export interface CallPeerLeftEvent {
  sessionId: string;
  user_id: string;
  role: string;
}

export interface ObserveStartedEvent {
  session_id: string;
  student_id: string;
  student_name: string;
  started_at: string;
}

export interface ObserveIncomingEvent {
  session_id: string;
  teacher_id: string;
  teacher_name: string;
  student_id: string;
  student_name: string;
  assignment_id: string | null;
  started_at: string;
}

export interface ObserveReadyEvent {
  session_id: string;
  student_id: string;
}

export interface ObserveRejectedEvent {
  session_id: string;
  student_id: string;
  reason: string | null;
}

export interface ObserveEndedEvent {
  session_id: string;
  outcome: string;
  ended_by_role: string;
  duration_sec: number | null;
}

export interface ObserveErrorEvent {
  message: string;
  session_id?: string;
}

export interface ScreenStateEvent {
  session_id: string;
  from: string;
  state: unknown;
  received_at: string;
}

export interface ScreenRequestCaptureEvent {
  session_id: string;
  from: string;
}

export interface WhiteboardOpenEvent {
  session_id: string;
  question_id: string;
  question_idx: number | null;
  from: string;
  opened_at: string;
}

export interface WhiteboardStrokeEvent {
  session_id: string;
  stroke: unknown;
  from: string;
}

export interface WhiteboardClearEvent {
  session_id: string;
  from: string;
}

export interface WhiteboardCloseEvent {
  session_id: string;
  from: string;
  closed_at: string;
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

  // ---- Observe mode (Step 12d P3) ----
  /** Peer (GV hoặc HS) disconnected from call/session room. */
  onCallPeerLeft?: (e: CallPeerLeftEvent) => void;
  /** GV: observe session created server-side, chờ HS accept. */
  onObserveStarted?: (e: ObserveStartedEvent) => void;
  /** HS: có GV muốn observe (show accept modal). */
  onObserveIncoming?: (e: ObserveIncomingEvent) => void;
  /** Cả 2 bên: HS đã accept, voice auto-call bắt đầu. */
  onObserveReady?: (e: ObserveReadyEvent) => void;
  /** GV: HS từ chối observe. */
  onObserveRejected?: (e: ObserveRejectedEvent) => void;
  /** Cả 2 bên: observe session ended. */
  onObserveEnded?: (e: ObserveEndedEvent) => void;
  /** Lỗi observe (lock conflict, invalid session, etc). */
  onObserveError?: (e: ObserveErrorEvent) => void;

  // ---- Screen view (HS → GV) ----
  /** GV: nhận screen:state JSON snapshot từ HS. */
  onScreenState?: (e: ScreenStateEvent) => void;
  /** HS: GV yêu cầu capture màn hình thật (getDisplayMedia). */
  onScreenRequestCapture?: (e: ScreenRequestCaptureEvent) => void;

  // ---- Whiteboard (GV → HS) ----
  onWhiteboardOpen?: (e: WhiteboardOpenEvent) => void;
  onWhiteboardStroke?: (e: WhiteboardStrokeEvent) => void;
  onWhiteboardClear?: (e: WhiteboardClearEvent) => void;
  onWhiteboardClose?: (e: WhiteboardCloseEvent) => void;
}

export function useLiveHelpSocket(options: UseLiveHelpSocketOptions = {}) {
  const {
    sessionId: initialSessionId,
    onHint,
    onSessionEnded,
    onHighlight,
    onHighlightClear,
    onConnected,
    onCallPeerLeft,
    onObserveStarted,
    onObserveIncoming,
    onObserveReady,
    onObserveRejected,
    onObserveEnded,
    onObserveError,
    onScreenState,
    onScreenRequestCapture,
    onWhiteboardOpen,
    onWhiteboardStroke,
    onWhiteboardClear,
    onWhiteboardClose,
  } = options;

  const [connected, setConnected] = useState(false);
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Refs để latest callbacks được dùng trong event handlers
  // (tránh stale closure khi options thay đổi)
  const callbacksRef = useRef({
    onHint,
    onSessionEnded,
    onHighlight,
    onHighlightClear,
    onConnected,
    onCallPeerLeft,
    onObserveStarted,
    onObserveIncoming,
    onObserveReady,
    onObserveRejected,
    onObserveEnded,
    onObserveError,
    onScreenState,
    onScreenRequestCapture,
    onWhiteboardOpen,
    onWhiteboardStroke,
    onWhiteboardClear,
    onWhiteboardClose,
  });
  callbacksRef.current = {
    onHint,
    onSessionEnded,
    onHighlight,
    onHighlightClear,
    onConnected,
    onCallPeerLeft,
    onObserveStarted,
    onObserveIncoming,
    onObserveReady,
    onObserveRejected,
    onObserveEnded,
    onObserveError,
    onScreenState,
    onScreenRequestCapture,
    onWhiteboardOpen,
    onWhiteboardStroke,
    onWhiteboardClear,
    onWhiteboardClose,
  };

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

    socket.on("call:peer-left", (e: CallPeerLeftEvent) => {
      callbacksRef.current.onCallPeerLeft?.(e);
    });

    // ---- Observe events (Step 12d P3) ----
    socket.on("observe:started", (e: ObserveStartedEvent) => {
      callbacksRef.current.onObserveStarted?.(e);
    });

    socket.on("observe:incoming", (e: ObserveIncomingEvent) => {
      callbacksRef.current.onObserveIncoming?.(e);
    });

    socket.on("observe:ready", (e: ObserveReadyEvent) => {
      callbacksRef.current.onObserveReady?.(e);
    });

    socket.on("observe:rejected", (e: ObserveRejectedEvent) => {
      callbacksRef.current.onObserveRejected?.(e);
    });

    socket.on("observe:ended", (e: ObserveEndedEvent) => {
      callbacksRef.current.onObserveEnded?.(e);
    });

    socket.on("observe:error", (e: ObserveErrorEvent) => {
      callbacksRef.current.onObserveError?.(e);
    });

    // ---- Screen events ----
    socket.on("screen:state", (e: ScreenStateEvent) => {
      callbacksRef.current.onScreenState?.(e);
    });

    socket.on("screen:request-capture", (e: ScreenRequestCaptureEvent) => {
      callbacksRef.current.onScreenRequestCapture?.(e);
    });

    // ---- Whiteboard events ----
    socket.on("whiteboard:open", (e: WhiteboardOpenEvent) => {
      callbacksRef.current.onWhiteboardOpen?.(e);
    });

    socket.on("whiteboard:stroke", (e: WhiteboardStrokeEvent) => {
      callbacksRef.current.onWhiteboardStroke?.(e);
    });

    socket.on("whiteboard:clear", (e: WhiteboardClearEvent) => {
      callbacksRef.current.onWhiteboardClear?.(e);
    });

    socket.on("whiteboard:close", (e: WhiteboardCloseEvent) => {
      callbacksRef.current.onWhiteboardClose?.(e);
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

  // ---- Observe mode (Step 12d P3) ----
  const emitObserveStart = useCallback(
    (payload: { studentId: string; assignmentId?: string }) => {
      socketRef.current?.emit("observe:start", payload);
    },
    []
  );

  const emitObserveAccept = useCallback((sessionId: string) => {
    socketRef.current?.emit("observe:accept", { sessionId });
  }, []);

  const emitObserveReject = useCallback(
    (sessionId: string, reason?: string) => {
      socketRef.current?.emit("observe:reject", { sessionId, reason });
    },
    []
  );

  const emitObserveEnd = useCallback(
    (sessionId: string, outcome?: string) => {
      socketRef.current?.emit("observe:end", { sessionId, outcome });
    },
    []
  );

  // ---- Screen ----
  const emitScreenState = useCallback(
    (sessionId: string, state: unknown) => {
      socketRef.current?.emit("screen:state", { sessionId, state });
    },
    []
  );

  const emitScreenRequestCapture = useCallback((sessionId: string) => {
    socketRef.current?.emit("screen:request-capture", { sessionId });
  }, []);

  // ---- Whiteboard ----
  const emitWhiteboardOpen = useCallback(
    (sessionId: string, questionId: string, questionIdx?: number) => {
      socketRef.current?.emit("whiteboard:open", {
        sessionId,
        questionId,
        questionIdx,
      });
    },
    []
  );

  const emitWhiteboardStroke = useCallback(
    (sessionId: string, stroke: unknown) => {
      socketRef.current?.emit("whiteboard:stroke", { sessionId, stroke });
    },
    []
  );

  const emitWhiteboardClear = useCallback((sessionId: string) => {
    socketRef.current?.emit("whiteboard:clear", { sessionId });
  }, []);

  const emitWhiteboardClose = useCallback((sessionId: string) => {
    socketRef.current?.emit("whiteboard:close", { sessionId });
  }, []);

  return {
    socket,
    connected,
    joinedSessionId,
    joinSession,
    leaveSession,
    sendHighlight,
    clearHighlight,
    // Observe mode
    emitObserveStart,
    emitObserveAccept,
    emitObserveReject,
    emitObserveEnd,
    // Screen
    emitScreenState,
    emitScreenRequestCapture,
    // Whiteboard
    emitWhiteboardOpen,
    emitWhiteboardStroke,
    emitWhiteboardClear,
    emitWhiteboardClose,
  };
}