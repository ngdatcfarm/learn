/**
 * src/components/livehelp/LiveHelpModal.tsx
 *
 * HS view khi có session active (pending hoặc active).
 *
 * Realtime (Step 12b):
 *  - hint:new socket event → append message immediately
 *  - session:ended socket event → auto-close modal
 *  - highlight:show socket event → render HighlightOverlay (yellow banner)
 *
 * Polling fallback (Step 12a):
 *  - useLiveHelp polling 3s vẫn chạy song song, dedupe bằng message id
 *  - Đảm bảo message arrive dù socket disconnect
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { ModalShell } from "../ui/ModalShell";
import { Field, inputStyle, inputClass } from "../ui/Field";
import { useLiveHelp } from "./hooks/useLiveHelp";
import { useLiveHelpSocket, type HighlightEvent } from "./hooks/useLiveHelpSocket";
import { HighlightOverlay } from "./HighlightOverlay";
import { VoiceCallPanel } from "./VoiceCallPanel";
import type { LiveHelpHintMessage } from "../../api/client";

export interface LiveHelpModalProps {
  onClose: () => void;
}

export function LiveHelpModal({ onClose }: LiveHelpModalProps) {
  const { activeSession, messages, loading, error, sendHint, endSession, appendMessage, startPolling, stopPolling } =
    useLiveHelp(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [highlight, setHighlight] = useState<HighlightEvent | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Polling fallback
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Realtime socket
  const { socket } = useLiveHelpSocket({
    sessionId: activeSession?.id,
    onHint: (h) => {
      // Append realtime message; hook sẽ dedupe theo id
      appendMessage({
        id: h.id,
        session_id: h.session_id,
        sender_id: h.sender_id,
        sender_name: h.sender_name,
        sender_role: h.sender_role,
        message: h.message,
        created_at: h.created_at,
      });
    },
    onSessionEnded: () => {
      // Realtime close (không đợi poll detect)
      onClose();
    },
    onHighlight: (h) => {
      setHighlight(h);
    },
    onHighlightClear: () => {
      setHighlight(null);
    },
  });

  // Auto-close khi session kết thúc (poll detect, socket fallback)
  useEffect(() => {
    if (activeSession && activeSession.status === "ended") {
      onClose();
    }
  }, [activeSession, onClose]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submitHint = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      await sendHint(text);
    } catch (e: any) {
      setDraft(text);
      console.error("[LiveHelpModal] sendHint failed:", e);
    } finally {
      setSending(false);
    }
  };

  const handleEnd = async () => {
    if (!confirm("Bạn xác nhận đã hiểu bài và kết thúc phiên hỗ trợ?")) return;
    setEnding(true);
    try {
      await endSession("understood");
      onClose();
    } catch (e: any) {
      console.error("[LiveHelpModal] end failed:", e);
    } finally {
      setEnding(false);
    }
  };

  return (
    <>
      <ModalShell
        title={
          activeSession?.status === "pending"
            ? "⏳ Đang chờ GV..."
            : "💬 Hỗ trợ trực tiếp"
        }
        onClose={onClose}
        maxWidth="max-w-md"
      >
        {/* Teacher info bar */}
        {activeSession && (
          <div
            className="px-3 py-2 rounded-xl text-xs flex items-center gap-2"
            style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted-strong)" }}
          >
            <span>👨‍🏫</span>
            <span className="font-bold">{activeSession.teacher_name}</span>
            {activeSession.class_name && (
              <span style={{ color: "var(--muted)" }}>· {activeSession.class_name}</span>
            )}
            {activeSession.status === "active" && (
              <span
                className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-extrabold"
                style={{ backgroundColor: "var(--success-soft)", color: "var(--success)" }}
              >
                ● Đang hoạt động
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div
          className="rounded-xl p-3 space-y-2 max-h-[300px] overflow-y-auto"
          style={{ backgroundColor: "var(--bg-soft)" }}
        >
          {loading && messages.length === 0 && (
            <div
              className="text-center text-xs py-4 flex items-center justify-center gap-2"
              style={{ color: "var(--muted)" }}
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Đang tải tin nhắn...
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div
              className="text-center text-xs py-4"
              style={{ color: "var(--muted)" }}
            >
              {activeSession?.status === "pending"
                ? "Chưa có tin nhắn nào. GV sẽ sớm phản hồi!"
                : "Chưa có tin nhắn nào."}
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div
            className="text-xs px-3 py-2 rounded-xl font-bold"
            style={{ backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}
          >
            {error}
          </div>
        )}

        {/* Input */}
        <form onSubmit={submitHint} className="flex gap-2 items-end">
          <div className="flex-1">
            <Field label="">
              <input
                type="text"
                className={inputClass()}
                style={inputStyle}
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Nhập tin nhắn..."
                disabled={sending || activeSession?.status === "ended"}
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="p-2.5 rounded-xl disabled:opacity-50 transition"
            style={{ backgroundColor: "var(--primary)", color: "#fff" }}
            title="Gửi"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* End session button */}
        <div
          className="flex justify-between items-center pt-2 border-t"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
            GV có thể thấy mọi tin nhắn em gửi.
          </span>
          <button
            onClick={handleEnd}
            disabled={ending}
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 disabled:opacity-50"
            style={{ backgroundColor: "var(--success)", color: "#fff" }}
          >
            <Check className="w-3 h-3" />
            {ending ? "Đang kết thúc..." : "Tôi hiểu rồi"}
          </button>
        </div>

        {/* Voice call (Step 12c) */}
        {activeSession && activeSession.status !== "ended" && (
          <VoiceCallPanel
            socket={socket}
            sessionId={activeSession.id}
            selfRole="student"
            selfName={activeSession.student_name}
            peerName={activeSession.teacher_name}
          />
        )}
      </ModalShell>

      {/* Highlight overlay (realtime from teacher) */}
      <HighlightOverlay
        highlight={highlight}
        teacherName={activeSession?.teacher_name}
        onDismiss={() => setHighlight(null)}
      />
    </>
  );
}

function MessageBubble({ msg }: { msg: LiveHelpHintMessage; key?: string | number }) {
  const isTeacher = msg.sender_role === "teacher" || msg.sender_role === "admin";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isTeacher ? "justify-start" : "justify-end"}`}
    >
      <div
        className="max-w-[80%] px-3 py-2 rounded-2xl text-xs"
        style={{
          backgroundColor: isTeacher ? "var(--bg-card)" : "var(--primary)",
          color: isTeacher ? "var(--foreground)" : "#fff",
          border: isTeacher ? "1px solid var(--border)" : "none",
          borderBottomLeftRadius: isTeacher ? 4 : 16,
          borderBottomRightRadius: isTeacher ? 16 : 4,
        }}
      >
        <div className="font-extrabold text-[10px] mb-0.5 opacity-70">
          {msg.sender_name}
        </div>
        <div className="whitespace-pre-wrap break-words">{msg.message}</div>
      </div>
    </motion.div>
  );
}