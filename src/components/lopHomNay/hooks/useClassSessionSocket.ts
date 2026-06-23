/**
 * src/components/lopHomNay/hooks/useClassSessionSocket.ts
 *
 * Step 13b Phase 3 — Owns `/live-help` socket listeners for class session events.
 *
 * Returns state for the LopHomNay tab: current session, hand-ups (teacher),
 * board pushes (student), voice session id, suspicious flags (teacher).
 *
 * Single source of truth: re-uses the existing `useLiveHelpSocket` socket instance
 * (pass vào prop). Re-emits class events ra cho consumers.
 */

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export interface ClassSessionState {
  class_session_id: string;
  status: "planned" | "active" | "ended" | "cancelled";
  class_id?: string;
  teacher_id?: string;
}

export interface ClassHandupNew {
  handup_id: string;
  class_session_id: string;
  student_id: string;
  student_name: string;
  question_id: string | null;
  message: string | null;
  queue_position: number;
  created_at: string;
}

export interface ClassHandupClaimed {
  handup_id: string;
  student_id: string;
  live_help_session_id: string;
}

export interface ClassBoardPush {
  board_id: string;
  class_session_id: string;
  student_id: string;
  question_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ClassBoardDismissRequest {
  board_id: string;
  student_id: string;
  student_name: string;
  requested_at: string;
}

export interface ClassTabStateChanged {
  student_id: string;
  event: "visible" | "hidden";
  occurred_at: string;
  visible_ms?: number;
}

export interface ClassSuspiciousAnswer {
  student_id: string;
  question_id: string;
  time_ms: number;
}

export interface UseClassSessionSocketReturn {
  /** Latest state for the joined class session. */
  state: ClassSessionState | null;
  /** Most recent hand-up received (teacher). */
  lastHandup: ClassHandupNew | null;
  /** When a hand-up is claimed (student). */
  lastClaimed: ClassHandupClaimed | null;
  /** Live help session id khi GV claim hand-up của HS → dùng cho voice call. */
  voiceSessionId: string | null;
  /** Forced-focus board push hiện tại. */
  activeBoardPush: ClassBoardPush | null;
  /** Yêu cầu dismiss board mới nhất (GV nhận). */
  lastDismissRequest: ClassBoardDismissRequest | null;
  /** Tab visibility changes (teacher). */
  tabChanges: ClassTabStateChanged[];
  /** Suspicious answer events (teacher). */
  suspiciousAnswers: ClassSuspiciousAnswer[];
  /** Hand-up queue (teacher) — append khi nhận hand-up-new. */
  handupQueue: ClassHandupNew[];
  /** Clear current board push (called by student khi dismiss-approve nhận). */
  clearBoardPush: () => void;
  /** Replay state hiện tại cho class session (reconnect). */
  refreshState: () => void;
}

export function useClassSessionSocket(
  socket: Socket | null,
  classSessionId: string | null
): UseClassSessionSocketReturn {
  const [state, setState] = useState<ClassSessionState | null>(null);
  const [lastHandup, setLastHandup] = useState<ClassHandupNew | null>(null);
  const [lastClaimed, setLastClaimed] = useState<ClassHandupClaimed | null>(null);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [activeBoardPush, setActiveBoardPush] = useState<ClassBoardPush | null>(null);
  const [lastDismissRequest, setLastDismissRequest] =
    useState<ClassBoardDismissRequest | null>(null);
  const [tabChanges, setTabChanges] = useState<ClassTabStateChanged[]>([]);
  const [suspiciousAnswers, setSuspiciousAnswers] = useState<ClassSuspiciousAnswer[]>([]);
  const [handupQueue, setHandupQueue] = useState<ClassHandupNew[]>([]);

  const joinedRef = useRef<string | null>(null);

  // Join class room khi mount / khi classSessionId thay đổi
  useEffect(() => {
    if (!socket || !classSessionId) return;
    if (joinedRef.current === classSessionId) return;

    socket.emit("class:join", { classSessionId });
    joinedRef.current = classSessionId;

    return () => {
      socket.emit("class:leave", { classSessionId });
      joinedRef.current = null;
    };
  }, [socket, classSessionId]);

  // Listen for class:* events
  useEffect(() => {
    if (!socket) return;

    const onState = (payload: ClassSessionState) => {
      if (payload.class_session_id !== classSessionId) return;
      setState(payload);
    };
    const onHandupNew = (payload: ClassHandupNew) => {
      if (payload.class_session_id !== classSessionId) return;
      setLastHandup(payload);
      setHandupQueue((prev) => [...prev, payload]);
    };
    const onHandupClaimed = (payload: ClassHandupClaimed) => {
      setLastClaimed(payload);
      // For HS: this is THEIR claim → use voiceSessionId
      setVoiceSessionId(payload.live_help_session_id);
      // For teacher: clear this from queue
      setHandupQueue((prev) => prev.filter((h) => h.handup_id !== payload.handup_id));
    };
    const onBoardPush = (payload: ClassBoardPush) => {
      if (payload.class_session_id !== classSessionId) return;
      setActiveBoardPush(payload);
    };
    const onBoardClear = (payload: { board_id: string; student_id: string }) => {
      setActiveBoardPush((cur) =>
        cur && cur.board_id === payload.board_id ? null : cur
      );
    };
    const onBoardDismissReq = (payload: ClassBoardDismissRequest) => {
      setLastDismissRequest(payload);
    };
    const onTabStateChanged = (payload: ClassTabStateChanged) => {
      setTabChanges((prev) => [...prev, payload].slice(-50));
    };
    const onSuspicious = (payload: ClassSuspiciousAnswer) => {
      setSuspiciousAnswers((prev) => [payload, ...prev].slice(0, 20));
    };

    socket.on("class:state", onState);
    socket.on("class:hand-up-new", onHandupNew);
    socket.on("class:hand-up-claimed", onHandupClaimed);
    socket.on("class:board-push", onBoardPush);
    socket.on("class:board-clear", onBoardClear);
    socket.on("class:board-dismiss-request", onBoardDismissReq);
    socket.on("class:tab-state-changed", onTabStateChanged);
    socket.on("class:suspicious-answer", onSuspicious);

    return () => {
      socket.off("class:state", onState);
      socket.off("class:hand-up-new", onHandupNew);
      socket.off("class:hand-up-claimed", onHandupClaimed);
      socket.off("class:board-push", onBoardPush);
      socket.off("class:board-clear", onBoardClear);
      socket.off("class:board-dismiss-request", onBoardDismissReq);
      socket.off("class:tab-state-changed", onTabStateChanged);
      socket.off("class:suspicious-answer", onSuspicious);
    };
  }, [socket, classSessionId]);

  return {
    state,
    lastHandup,
    lastClaimed,
    voiceSessionId,
    activeBoardPush,
    lastDismissRequest,
    tabChanges,
    suspiciousAnswers,
    handupQueue,
    clearBoardPush: () => setActiveBoardPush(null),
    refreshState: () => {
      if (socket && classSessionId) socket.emit("class:state-req", { classSessionId });
    },
  };
}
