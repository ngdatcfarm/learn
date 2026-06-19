/**
 * src/components/livehelp/LiveHelpModal.tsx
 *
 * HS view khi có session active (pending hoặc active).
 * Hiển thị:
 *  - Header: status badge + teacher name + "Xin chờ GV..."
 *  - Chat log (hints từ GV + HS)
 *  - Input box: HS gõ reply
 *  - Footer: nút "Tôi hiểu rồi" → end session (outcome='understood')
 *
 * Polling 3s qua useLiveHelp hook (Slice A trước khi có socket).
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { ModalShell } from "../ui/ModalShell";
import { Field, inputStyle, inputClass } from "../ui/Field";
import { useLiveHelp } from "./hooks/useLiveHelp";
import type { LiveHelpHintMessage } from "../../api/client";

export interface LiveHelpModalProps {
  onClose: () => void;
}

export function LiveHelpModal({ onClose }: LiveHelpModalProps) {
  const { activeSession, messages, loading, error, sendHint, endSession, startPolling, stopPolling } =
    useLiveHelp(false); // Don't auto-start; we'll control manually

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

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
      setDraft(text); // restore on error
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
    </ModalShell>
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