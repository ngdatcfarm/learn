/**
 * src/components/livehelp/TeacherLiveHelpPane.tsx
 *
 * Teacher chat pane — mở khi click vào 1 session trong TeacherDashboard.
 * Tương tự LiveHelpModal nhưng:
 *  - Header: tên HS (thay vì tên GV)
 *  - Default status = 'active' khi mở
 *  - Button "Kết thúc" thay vì "Tôi hiểu rồi"
 *  - Quick-reply buttons (3 snippet gợi ý nhanh)
 *
 * Polling 3s khi mount. Slice B sẽ chuyển sang socket realtime.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, X, Loader2, MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { Field, inputStyle, inputClass } from "../ui/Field";
import {
  liveHelpMessages,
  liveHelpSendHint,
  liveHelpEnd,
  type LiveHelpSession,
  type LiveHelpHintMessage,
  type LiveHelpOutcome,
} from "../../api/client";

const POLL_MS = 3000;

const QUICK_REPLIES = [
  "💪 Cố lên em! Đọc kỹ đề rồi thử lại nhé.",
  "💡 Gợi ý: Chú ý từ khoá trong câu hỏi.",
  "⏸️ Em nghỉ 1 phút, GV quay lại ngay.",
];

export interface TeacherLiveHelpPaneProps {
  session: LiveHelpSession;
  onClose: () => void;
  onEnded?: () => void;
}

export function TeacherLiveHelpPane({ session, onClose, onEnded }: TeacherLiveHelpPaneProps) {
  const [messages, setMessages] = useState<LiveHelpHintMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    try {
      const { messages: msgs } = await liveHelpMessages(session.id);
      setMessages(msgs);
    } catch (e) {
      console.warn("[TeacherLiveHelpPane] loadMessages failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // Initial load + polling
  useEffect(() => {
    loadMessages();
    const tick = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(tick);
  }, [session.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submitHint = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await liveHelpSendHint(session.id, text);
      setDraft("");
      await loadMessages();
    } catch (e) {
      console.error("[TeacherLiveHelpPane] sendHint failed:", e);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitHint(draft);
  };

  const handleEnd = async (outcome: LiveHelpOutcome) => {
    if (!confirm("Kết thúc phiên hỗ trợ này?")) return;
    setEnding(true);
    try {
      await liveHelpEnd(session.id, outcome);
      onEnded?.();
      onClose();
    } catch (e) {
      console.error("[TeacherLiveHelpPane] end failed:", e);
    } finally {
      setEnding(false);
    }
  };

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      className="fixed right-0 top-0 bottom-0 w-[360px] z-40 shadow-2xl flex flex-col"
      style={{ backgroundColor: "var(--bg-card)", borderLeft: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 p-4 border-b"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-xs"
          style={{
            backgroundColor: "var(--primary-soft)",
            color: "var(--primary)",
          }}
        >
          {session.student_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-sm truncate">{session.student_name}</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            {session.class_name ? `${session.class_name} · ` : ""}
            <span
              style={{
                color: session.status === "pending" ? "var(--warning)" : "var(--success)",
              }}
            >
              {session.status === "pending" ? "Chờ phản hồi" : "Đang hoạt động"}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl"
          style={{ color: "var(--muted)" }}
          title="Đóng"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ backgroundColor: "var(--bg-soft)" }}
      >
        {loading && messages.length === 0 && (
          <div
            className="text-center text-xs py-4 flex items-center justify-center gap-2"
            style={{ color: "var(--muted)" }}
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Đang tải...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-xs py-4" style={{ color: "var(--muted)" }}>
            Chưa có tin nhắn nào. Hãy gửi gợi ý cho HS nhé!
          </div>
        )}
        {messages.map((m) => (
          <TeacherMessageBubble key={m.id} msg={m} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies */}
      {session.status !== "ended" && (
        <div className="px-3 py-2 flex gap-1.5 flex-wrap border-t" style={{ borderColor: "var(--border-soft)" }}>
          {QUICK_REPLIES.map((qr, i) => (
            <button
              key={i}
              onClick={() => submitHint(qr)}
              disabled={sending}
              className="px-2 py-1 rounded-full text-[10px] font-bold disabled:opacity-50"
              style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted-strong)" }}
              title="Click để gửi nhanh"
            >
              {qr.slice(0, 28)}...
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      {session.status !== "ended" ? (
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 p-3 border-t"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <div className="flex-1">
            <Field label="">
              <input
                type="text"
                className={inputClass()}
                style={inputStyle}
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Gõ gợi ý cho HS..."
                disabled={sending}
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="p-2.5 rounded-xl disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "#fff" }}
            title="Gửi"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <div
          className="p-3 text-center text-xs"
          style={{ color: "var(--muted)", borderTop: "1px solid var(--border-soft)" }}
        >
          Phiên đã kết thúc.
        </div>
      )}

      {/* End buttons */}
      {session.status !== "ended" && (
        <div
          className="flex gap-2 p-3 border-t"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <button
            onClick={() => handleEnd("teacher_left")}
            disabled={ending}
            className="flex-1 px-3 py-2 rounded-xl text-xs font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted-strong)" }}
          >
            Rời phiên
          </button>
          <button
            onClick={() => handleEnd("understood")}
            disabled={ending}
            className="flex-1 px-3 py-2 rounded-xl text-xs font-extrabold disabled:opacity-50 flex items-center justify-center gap-1"
            style={{ backgroundColor: "var(--success)", color: "#fff" }}
          >
            <MessageCircle className="w-3 h-3" />
            {ending ? "..." : "Đã giúp xong"}
          </button>
        </div>
      )}
    </motion.div>
  );
}

function TeacherMessageBubble({ msg }: { msg: LiveHelpHintMessage; key?: string | number }) {
  const isTeacher = msg.sender_role === "teacher" || msg.sender_role === "admin";
  return (
    <div className={`flex ${isTeacher ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-2 rounded-2xl text-xs"
        style={{
          backgroundColor: isTeacher ? "var(--primary)" : "var(--bg-card)",
          color: isTeacher ? "#fff" : "var(--foreground)",
          border: isTeacher ? "none" : "1px solid var(--border)",
        }}
      >
        <div className="font-extrabold text-[10px] mb-0.5 opacity-70">
          {msg.sender_name}
        </div>
        <div className="whitespace-pre-wrap break-words">{msg.message}</div>
      </div>
    </div>
  );
}