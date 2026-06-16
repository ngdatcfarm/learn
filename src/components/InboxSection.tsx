/**
 * src/components/InboxSection.tsx — Shared inbox UI (Step 7)
 *
 * Dùng bởi ParentDashboard, TeacherDashboard, AdminDashboard.
 * - role="parent" | "teacher"   : 2 sub-tabs "Tin nhắn" + "Thông báo"
 *                                 (chỉ xem broadcast ở tab Thông báo, không compose)
 *                                 → compose: direct tới eligible recipients
 * - role="admin"                : cùng 2 sub-tabs, nhưng compose cho phép broadcast
 *                                 (subject + target_role + target_class_id + body)
 *
 * Polling: 30s setInterval + visibilitychange pause (snappy enough cho badge).
 */

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Send,
  RefreshCw,
  Inbox as InboxIcon,
  Megaphone,
  Users as UsersIcon,
} from "lucide-react";
import {
  listThreads,
  listEligibleRecipients,
  getThread,
  createDirectThread,
  createBroadcast,
  sendMessage,
  markThreadRead,
  getUnreadCount,
  MessageThread,
  Message,
  ApiUser,
} from "../api/client";
import sound from "../utils/sound";
import { formatMessageTime } from "../utils/format";
import { ROLE_LABEL, ROLE_EMOJI } from "../utils/roles";
import { ModalShell } from "./ui/ModalShell";
import { Field, inputStyle, inputClass } from "./ui/Field";

type SubTab = "messages" | "announcements";

const POLL_MS = 30_000;

interface InboxSectionProps {
  role: "parent" | "teacher" | "admin";
  classes?: Array<{ id: string; name: string }>;
  onUnreadChange?: (count: number) => void;
}

export default function InboxSection({
  role,
  classes = [],
  onUnreadChange,
}: InboxSectionProps) {
  const [subTab, setSubTab] = useState<SubTab>("messages");
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notify parent of unread count for badge
  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  // ─── Load threads + unread count ──────────────────────────────
  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [t, u] = await Promise.all([listThreads(), getUnreadCount()]);
      setThreads(t.threads);
      setUnreadCount(u.count);
    } catch (e: any) {
      console.warn("inbox load failed:", e);
      setError(e?.error || "Không tải được hộp thư.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Polling: 30s + visibilitychange pause
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") load(false);
    };
    const id = setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    load(true);
  }, [load]);

  const handleRefresh = () => {
    sound.playClick();
    setRefreshing(true);
    load(false);
  };

  // Filter threads theo sub-tab
  const directThreads = threads.filter((t) => t.type === "direct");
  const broadcastThreads = threads.filter((t) => t.type === "broadcast");
  const visibleThreads = subTab === "messages" ? directThreads : broadcastThreads;
  const selectedThread = threads.find((t) => t.id === selectedId) || null;

  // ─── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="p-12 rounded-3xl border text-center space-y-3"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-3xl floaty">📬</div>
        <div className="text-sm font-bold" style={{ color: "var(--muted)" }}>
          Đang tải hộp thư...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: sub-tab nav + Compose button + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-1.5 p-1 rounded-2xl border"
          style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
        >
          <button
            onClick={() => {
              sound.playClick();
              setSubTab("messages");
              setSelectedId(null);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
            style={{
              backgroundColor: subTab === "messages" ? "var(--bg-card)" : "transparent",
              color: subTab === "messages" ? "var(--primary)" : "var(--muted)",
              boxShadow: subTab === "messages" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <InboxIcon className="w-3.5 h-3.5" />
            Tin nhắn
            {directThreads.some((t) => t.unread_count > 0) && (
              <span
                className="ml-0.5 px-1.5 py-0.5 text-[9px] font-extrabold rounded-full"
                style={{ backgroundColor: "var(--danger)", color: "white" }}
              >
                {directThreads.reduce((s, t) => s + t.unread_count, 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setSubTab("announcements");
              setSelectedId(null);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
            style={{
              backgroundColor: subTab === "announcements" ? "var(--bg-card)" : "transparent",
              color: subTab === "announcements" ? "var(--primary)" : "var(--muted)",
              boxShadow:
                subTab === "announcements" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Megaphone className="w-3.5 h-3.5" />
            Thông báo
            {broadcastThreads.some((t) => t.unread_count > 0) && (
              <span
                className="ml-0.5 px-1.5 py-0.5 text-[9px] font-extrabold rounded-full"
                style={{ backgroundColor: "var(--danger)", color: "white" }}
              >
                {broadcastThreads.reduce((s, t) => s + t.unread_count, 0)}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl border"
            style={{
              backgroundColor: "var(--bg-soft)",
              borderColor: "var(--border)",
              color: "var(--muted)",
            }}
            title="Làm mới"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "spin-once" : ""}`} />
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setComposeOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--on-primary)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            {subTab === "messages"
              ? "Soạn tin nhắn"
              : role === "admin" || role === "teacher"
              ? "Gửi thông báo"
              : "Soạn tin nhắn"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="p-3 rounded-xl border text-xs font-medium"
          style={{
            backgroundColor: "var(--danger-soft)",
            borderColor: "var(--danger)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* 2-pane layout (md+): list left, thread right */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ThreadList
          threads={visibleThreads}
          selectedId={selectedId}
          onSelect={(id) => {
            sound.playClick();
            setSelectedId(id);
          }}
          emptyHint={
            subTab === "messages"
              ? "Chưa có cuộc trò chuyện nào. Bấm '+ Soạn tin nhắn' để bắt đầu."
              : "Chưa có thông báo nào — admin sẽ gửi thông báo tới bạn khi có cập nhật."
          }
        />

        <div className="md:col-span-2">
          {selectedThread ? (
            <ThreadView
              key={selectedThread.id}
              threadId={selectedThread.id}
              onAfterSend={() => load(false)}
            />
          ) : (
            <EmptyPane subTab={subTab} />
          )}
        </div>
      </div>

      {/* Compose modal */}
      <AnimatePresence>
        {composeOpen && (
          <ComposeModal
            role={role}
            subTab={subTab}
            classes={classes}
            onClose={() => setComposeOpen(false)}
            onSent={() => {
              setComposeOpen(false);
              load(false);
              sound.playSuccess();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Thread list
// ============================================================

function ThreadList({
  threads,
  selectedId,
  onSelect,
  emptyHint,
}: {
  threads: MessageThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
}) {
  if (threads.length === 0) {
    return (
      <div
        className="p-6 rounded-3xl border text-center space-y-2 md:col-span-1"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-2xl">📭</div>
        <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <ul className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
        {threads.map((t) => {
          const isActive = t.id === selectedId;
          const titleText =
            t.type === "broadcast"
              ? t.subject || "(không có tiêu đề)"
              : t.participants.length > 0
              ? t.participants.map((p) => p.name).join(" & ")
              : t.created_by_name;
          const preview = t.last_message?.body ?? "—";
          const time = formatMessageTime(t.last_message_at || t.created_at);
          return (
            <li key={t.id}>
              <button
                onClick={() => onSelect(t.id)}
                className="w-full text-left p-3 flex items-start gap-2.5 transition-colors"
                style={{
                  backgroundColor: isActive
                    ? "var(--primary-soft)"
                    : "transparent",
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0"
                  style={{
                    background: t.type === "broadcast"
                      ? "linear-gradient(135deg, var(--accent), var(--secondary))"
                      : "linear-gradient(135deg, var(--primary), var(--accent))",
                    color: "white",
                  }}
                >
                  {t.type === "broadcast" ? "📢" : (titleText || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold truncate">
                      {titleText}
                    </div>
                    <div
                      className="text-[9px] shrink-0 font-bold"
                      style={{ color: "var(--muted)" }}
                    >
                      {time}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {t.type === "broadcast" && t.target_class_name && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-md font-extrabold shrink-0"
                        style={{
                          backgroundColor: "var(--bg-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        🏫 {t.target_class_name}
                      </span>
                    )}
                    <div
                      className="text-[10px] truncate flex-1"
                      style={{ color: "var(--muted)" }}
                    >
                      {preview}
                    </div>
                  </div>
                </div>
                {t.unread_count > 0 && (
                  <span
                    className="px-1.5 py-0.5 text-[9px] font-extrabold rounded-full shrink-0"
                    style={{ backgroundColor: "var(--danger)", color: "white" }}
                  >
                    {t.unread_count > 99 ? "99+" : t.unread_count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// Thread view (load full + send reply)
// ============================================================

function ThreadView({
  threadId,
  onAfterSend,
}: {
  threadId: string;
  onAfterSend: () => void;
  // Allow `key` from React (see Debugging tips in MEMORY.md — TS+JSX sub-component
  // + `.map()` requires this for typecheck, React strips it at runtime)
  key?: string | number;
}) {
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const me = JSON.parse(localStorage.getItem("apex_auth_user") || "{}") as ApiUser;

  const loadThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getThread(threadId);
      setThread(res.thread);
      setMessages(res.messages);
    } catch (e: any) {
      setError(e?.error || "Không tải được thread.");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Auto-scroll xuống cuối khi load
  useEffect(() => {
    if (!loading && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [loading, messages.length]);

  // Re-mark read nếu user focus thread (defensive — getThread đã auto-mark)
  useEffect(() => {
    if (!loading) markThreadRead(threadId).catch(() => {});
  }, [threadId, loading]);

  const handleSend = async () => {
    const text = replyBody.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await sendMessage(threadId, text);
      setMessages((prev) => [...prev, res.message]);
      setReplyBody("");
      sound.playSuccess();
      onAfterSend();
    } catch (e: any) {
      setError(e?.error || "Gửi thất bại.");
      sound.playIncorrect();
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div
        className="p-12 rounded-3xl border text-center"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-2xl floaty">⏳</div>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="p-6 rounded-3xl border text-center space-y-2"
        style={{
          backgroundColor: "var(--danger-soft)",
          borderColor: "var(--danger)",
        }}
      >
        <p className="text-xs font-bold" style={{ color: "var(--danger)" }}>
          {error}
        </p>
        <button
          onClick={loadThread}
          className="px-3 py-1.5 rounded-xl text-xs font-extrabold"
          style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (!thread) return null;

  const isBroadcast = thread.type === "broadcast";
  const canReply = !isBroadcast || me.role === "admin" || thread.created_by === me.id;
  const titleText = isBroadcast
    ? thread.subject || "(không có tiêu đề)"
    : thread.participants.length > 0
    ? thread.participants.map((p) => p.name).join(" & ")
    : thread.created_by_name;

  return (
    <div
      className="rounded-3xl border flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2.5"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0"
          style={{
            background: isBroadcast
              ? "linear-gradient(135deg, var(--accent), var(--secondary))"
              : "linear-gradient(135deg, var(--primary), var(--accent))",
            color: "white",
          }}
        >
          {isBroadcast ? "📢" : (titleText || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold truncate">{titleText}</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            {isBroadcast
              ? `${ROLE_LABEL[me.role] || "Bạn"} · Thông báo`
              : thread.participants
                  .map((p) => `${ROLE_EMOJI[p.role]} ${p.name}`)
                  .join(" · ")}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
        style={{ minHeight: 240, maxHeight: 480, backgroundColor: "var(--bg-soft)" }}
      >
        {messages.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: "var(--muted)" }}>
            Chưa có tin nhắn nào.
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_id === me.id;
            return (
              <div
                key={m.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[78%] px-3 py-2 rounded-2xl text-xs"
                  style={{
                    backgroundColor: isMine ? "var(--primary)" : "var(--bg-card)",
                    color: isMine ? "var(--on-primary)" : "var(--foreground)",
                    borderTopRightRadius: isMine ? 4 : 16,
                    borderTopLeftRadius: isMine ? 16 : 4,
                    border: isMine ? "none" : "1px solid var(--border-soft)",
                  }}
                >
                  {!isMine && (
                    <div
                      className="text-[9px] font-extrabold mb-0.5"
                      style={{
                        color: isMine ? "var(--on-primary)" : "var(--muted)",
                        opacity: 0.85,
                      }}
                    >
                      {ROLE_EMOJI[m.sender_role]} {m.sender_name}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div
                    className="text-[9px] mt-1 font-bold"
                    style={{
                      color: isMine ? "var(--on-primary)" : "var(--muted)",
                      opacity: 0.7,
                    }}
                  >
                    {formatMessageTime(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reply box (hoặc hint cho broadcast viewer không phải creator/admin) */}
      {canReply ? (
        <div
          className="p-3 border-t flex items-end gap-2"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={isBroadcast ? "Soạn thông báo tiếp theo..." : "Nhập tin nhắn..."}
            className={inputClass("resize-none")}
            style={{ ...inputStyle, minHeight: 38, maxHeight: 96 }}
            rows={1}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !replyBody.trim()}
            className="p-2.5 rounded-xl disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
            title="Gửi"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div
          className="p-3 border-t text-[10px] text-center"
          style={{ color: "var(--muted)", borderColor: "var(--border-soft)" }}
        >
          Bạn chỉ có thể xem thông báo này. Để liên hệ người gửi, bấm "Soạn tin nhắn" ở trên.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Empty pane
// ============================================================

function EmptyPane({ subTab }: { subTab: SubTab }) {
  return (
    <div
      className="p-12 rounded-3xl border text-center space-y-2"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="text-3xl">{subTab === "messages" ? "💬" : "📢"}</div>
      <p className="text-sm font-extrabold">
        {subTab === "messages" ? "Chọn cuộc trò chuyện" : "Chọn thông báo"}
      </p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Bấm vào 1 thread ở danh sách bên trái để xem nội dung.
      </p>
    </div>
  );
}

// ============================================================
// Compose modal (direct + broadcast)
// ============================================================

function ComposeModal({
  role,
  subTab,
  classes,
  onClose,
  onSent,
}: {
  role: "parent" | "teacher" | "admin";
  subTab: SubTab;
  classes: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSent: () => void;
}) {
  const isBroadcastMode = subTab === "announcements" && (role === "admin" || role === "teacher");

  const [recipients, setRecipients] = useState<ApiUser[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [targetRole, setTargetRole] = useState<"parent" | "teacher" | "all">("parent");
  const [targetClassId, setTargetClassId] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isBroadcastMode) return;
    let mounted = true;
    listEligibleRecipients()
      .then((res) => {
        if (mounted) setRecipients(res.recipients);
      })
      .catch((e) => console.warn("eligible recipients failed:", e));
    return () => {
      mounted = false;
    };
  }, [isBroadcastMode]);

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("Vui lòng nhập nội dung.");
      return;
    }
    if (isBroadcastMode) {
      if (!subject.trim()) {
        setError("Vui lòng nhập tiêu đề thông báo.");
        return;
      }
    } else {
      if (!recipientId) {
        setError("Vui lòng chọn người nhận.");
        return;
      }
    }
    setSubmitting(true);
    try {
      if (isBroadcastMode) {
        await createBroadcast({
          type: "broadcast",
          subject: subject.trim(),
          target_role: targetRole,
          target_class_id: targetClassId || null,
          body: body.trim(),
        });
      } else {
        await createDirectThread({
          recipient_id: recipientId,
          body: body.trim(),
        });
      }
      onSent();
    } catch (e: any) {
      setError(e?.error || "Gửi thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={isBroadcastMode ? "Gửi thông báo" : "Soạn tin nhắn mới"}
      onClose={onClose}
      maxWidth={isBroadcastMode ? "max-w-lg" : "max-w-md"}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold"
            style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted)" }}
          >
            Hủy
          </button>
          <button
            type="submit"
            form="compose-form"
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            {submitting ? "Đang gửi..." : isBroadcastMode ? "Gửi thông báo" : "Gửi"}
          </button>
        </>
      }
    >
      <form id="compose-form" onSubmit={handleSubmit} className="space-y-3.5">
        {isBroadcastMode ? (
          <>
            <Field label="Tiêu đề">
              <input
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ví dụ: Lịch nghỉ Tết Nguyên Đán"
                className={inputClass()}
                style={inputStyle}
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Gửi tới"
                hint="Phạm vi người nhận"
              >
                <select
                  value={targetRole}
                  onChange={(e) =>
                    setTargetRole(e.target.value as "parent" | "teacher" | "all")
                  }
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option value="parent">👨‍👩‍👧 Phụ huynh</option>
                  {role === "admin" && <option value="teacher">👩‍🏫 Giáo viên</option>}
                  <option value="all">👥 Tất cả</option>
                </select>
              </Field>
              <Field label="Lớp (tuỳ chọn)" hint="Để trống = tất cả lớp">
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option value="">— Tất cả lớp —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        ) : (
          <Field label="Người nhận">
            <select
              required
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className={inputClass()}
              style={inputStyle}
              autoFocus
            >
              <option value="">— Chọn người nhận —</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {ROLE_EMOJI[r.role]} {r.name} ({ROLE_LABEL[r.role]})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={isBroadcastMode ? "Nội dung thông báo" : "Tin nhắn"}>
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              isBroadcastMode
                ? "Nhập nội dung thông báo gửi tới phụ huynh..."
                : "Nhập nội dung tin nhắn..."
            }
            className={inputClass("resize-none")}
            style={{ ...inputStyle, minHeight: 100, maxHeight: 240 }}
            disabled={submitting}
          />
        </Field>

        {error && (
          <div
            className="p-3 rounded-xl border text-xs font-medium"
            style={{
              backgroundColor: "var(--danger-soft)",
              borderColor: "var(--danger)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}
      </form>
    </ModalShell>
  );
}
