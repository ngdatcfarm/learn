/**
 * src/components/livehelp/hooks/useLiveHelp.ts
 *
 * Quản lý state Live Help phía HS:
 *  - activeSession: session đang pending/active (null nếu không có)
 *  - messages: hint log của active session
 *  - poll mỗi 3s khi modal mở (Slice A trước khi có socket)
 *
 * Auto-fetch active session khi mount.
 * Slice B sẽ thay thế polling bằng socket realtime — interface giữ nguyên.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  liveHelpStudentMine,
  liveHelpMessages,
  liveHelpEnd,
  liveHelpSendHint,
  type LiveHelpSession,
  type LiveHelpHintMessage,
  type LiveHelpOutcome,
} from "../../../api/client";

const POLL_MS = 3000;

export interface UseLiveHelpReturn {
  activeSession: LiveHelpSession | null;
  messages: LiveHelpHintMessage[];
  loading: boolean;
  error: string | null;
  /** Send 1 message trong active session. Auto-refresh sau khi gửi. */
  sendHint: (message: string) => Promise<void>;
  /** End active session. */
  endSession: (outcome?: LiveHelpOutcome) => Promise<void>;
  /** Append 1 message realtime (từ socket). Dedup theo id. */
  appendMessage: (msg: LiveHelpHintMessage) => void;
  /** Reload cả session list + messages (vd: sau khi tạo session mới). */
  refresh: () => Promise<void>;
  /** Stop polling (khi modal đóng). */
  stopPolling: () => void;
  /** Start polling (khi modal mở). */
  startPolling: () => void;
}

export function useLiveHelp(autoStart = true): UseLiveHelpReturn {
  const [activeSession, setActiveSession] = useState<LiveHelpSession | null>(null);
  const [messages, setMessages] = useState<LiveHelpHintMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const { sessions } = await liveHelpStudentMine();
      const active = sessions.find(
        (s) => s.status === "pending" || s.status === "active"
      );
      setActiveSession(active ?? null);
      return active ?? null;
    } catch (e: any) {
      setError(e?.error || "Không tải được session.");
      return null;
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const { messages: msgs } = await liveHelpMessages(sessionId);
      setMessages(msgs);
    } catch (e: any) {
      console.warn("[useLiveHelp] loadMessages failed:", e);
    }
  }, []);

  const appendMessage = useCallback((msg: LiveHelpHintMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const active = await loadSession();
      if (active) {
        await loadMessages(active.id);
      } else {
        setMessages([]);
      }
    } finally {
      setLoading(false);
    }
  }, [loadSession, loadMessages]);

  const pollOnce = useCallback(async () => {
    const active = await loadSession();
    if (active) {
      if (!activeSession || activeSession.id !== active.id) {
        setActiveSession(active);
      }
      await loadMessages(active.id);
    } else if (activeSession) {
      // Vừa end → clear
      setActiveSession(null);
      setMessages([]);
    }
  }, [activeSession, loadSession, loadMessages]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollOnce(); // fetch ngay
    pollingRef.current = setInterval(pollOnce, POLL_MS);
  }, [pollOnce, stopPolling]);

  // Auto-load 1 lần khi mount (để biết có session active không cho indicator)
  useEffect(() => {
    if (autoStart) {
      loadSession().then((active) => {
        if (active) setActiveSession(active);
      });
    }
    return () => stopPolling();
  }, [autoStart, loadSession, stopPolling]);

  const sendHint = useCallback(
    async (message: string) => {
      const sess = activeSession;
      if (!sess) throw new Error("Không có session active.");
      await liveHelpSendHint(sess.id, message);
      await pollOnce(); // refresh ngay (không đợi 3s)
    },
    [activeSession, pollOnce]
  );

  const endSession = useCallback(
    async (outcome?: LiveHelpOutcome) => {
      const sess = activeSession;
      if (!sess) return;
      await liveHelpEnd(sess.id, outcome);
      // pollOnce sẽ clear activeSession vì status=ended
      await pollOnce();
    },
    [activeSession, pollOnce]
  );

  return {
    activeSession,
    messages,
    loading,
    error,
    sendHint,
    endSession,
    appendMessage,
    refresh,
    stopPolling,
    startPolling,
  };
}