/**
 * src/components/InboxPopup.tsx — Slide-out inbox popup (header bell → open)
 *
 * Dùng bởi App.tsx cho TẤT CẢ roles (HS / PH / GV / Admin).
 * Thay thế hoàn toàn cho "Hộp thư" section trong 3 dashboards.
 *
 * UI:
 *  - Backdrop mờ click-to-close (mobile + desktop)
 *  - Panel trượt từ phải: 420px (desktop), 100% (mobile)
 *  - Header: "Hộp thư" + close button
 *  - Tab pills: Tin nhắn | Thông báo
 *  - Compose inline: RecipientPicker (search + danh sách) hoặc BroadcastComposer
 *  - Thread list (Messenger-style) hoặc Thread view (bubble + day separator + reply)
 *  - 30s polling khi đang mở (pause khi tab ẩn)
 */

import { useState, useEffect, useCallback, useRef, type FormEvent, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Send,
  RefreshCw,
  ArrowLeft,
  Search,
  X,
  Inbox as InboxIcon,
  Megaphone,
} from "lucide-react";
import {
  listThreads,
  listEligibleRecipients,
  getThread,
  createDirectThread,
  createBroadcast,
  sendMessage,
  markThreadRead,
  MessageThread,
  Message,
  ApiUser,
} from "../api/client";
import sound from "../utils/sound";
import { formatMessageTime, formatDaySeparator, dateKey } from "../utils/format";
import { ROLE_LABEL, ROLE_EMOJI } from "../utils/roles";

type SubTab = "messages" | "announcements";
type ComposeMode = "closed" | "pick-recipient" | "compose-broadcast";

const POLL_MS = 30_000;
const GROUP_GAP_MS = 5 * 60 * 1000;

interface InboxPopupProps {
  open: boolean;
  onClose: () => void;
  user: ApiUser;
  classes?: Array<{ id: string; name: string }>;
  onUnreadChange?: (count: number) => void;
}

export default function InboxPopup({
  open,
  onClose,
  user,
  classes = [],
  onUnreadChange,
}: InboxPopupProps) {
  const [subTab, setSubTab] = useState<SubTab>("messages");
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode>("closed");
  const [error, setError] = useState<string | null>(null);

  // Notify parent of unread count for badge
  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  // ─── Load threads (chỉ khi popup mở) ─────────────────────────
  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const t = await listThreads();
      setThreads(t.threads);
    } catch (e: any) {
      console.warn("inbox load failed:", e);
      setError(e?.error || "Không tải được hộp thư.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Polling chỉ khi open
  useEffect(() => {
    if (!open) return;
    load(true);
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
  }, [open, load]);

  // Reset state khi popup đóng
  useEffect(() => {
    if (!open) {
      // Delay nhỏ để animation slide-out chạy mượt
      const t = setTimeout(() => {
        setSelectedId(null);
        setComposeMode("closed");
        setError(null);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [open]);

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

  const switchSubTab = (next: SubTab) => {
    sound.playClick();
    setSubTab(next);
    setSelectedId(null);
    setComposeMode("closed");
  };

  const handleSelectThread = (id: string) => {
    sound.playClick();
    setSelectedId(id);
    setComposeMode("closed");
  };

  const handleBackToList = () => {
    sound.playClick();
    setSelectedId(null);
  };

  const openCompose = () => {
    sound.playClick();
    setError(null);
    setSelectedId(null);
    if (subTab === "announcements" && (user.role === "admin" || user.role === "teacher")) {
      setComposeMode("compose-broadcast");
    } else {
      setComposeMode("pick-recipient");
    }
  };

  const closeCompose = () => {
    sound.playClick();
    setComposeMode("closed");
  };

  const handleNewConversation = async (recipientId: string) => {
    try {
      const res = await createDirectThread({
        recipient_id: recipientId,
        body: "👋",
      });
      sound.playSuccess();
      await load(false);
      setComposeMode("closed");
      setSelectedId(res.thread.id);
    } catch (e: any) {
      setError(e?.error || "Không tạo được cuộc trò chuyện.");
      sound.playIncorrect();
    }
  };

  const handleNewBroadcast = async (payload: {
    subject: string;
    target_role: "parent" | "teacher" | "student" | "all";
    target_class_id: string | null;
    body: string;
  }) => {
    try {
      const res = await createBroadcast({ type: "broadcast", ...payload });
      sound.playSuccess();
      await load(false);
      setComposeMode("closed");
      setSelectedId(res.thread.id);
    } catch (e: any) {
      setError(e?.error || "Không gửi được thông báo.");
      sound.playIncorrect();
    }
  };

  // Recompute unread count khi threads list thay đổi
  useEffect(() => {
    const total = threads.reduce((s, t) => s + t.unread_count, 0);
    setUnreadCount(total);
  }, [threads]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-full md:w-[420px] shadow-2xl"
            style={{
              backgroundColor: "var(--bg-card)",
              borderLeft: "1px solid var(--border)",
            }}
          >
            {/* Header */}
            <div
              className="px-4 py-3 border-b flex items-center gap-2.5 shrink-0"
              style={{ borderColor: "var(--border-soft)" }}
            >
              {selectedThread || composeMode !== "closed" ? (
                <button
                  onClick={selectedThread ? handleBackToList : closeCompose}
                  className="p-1 -ml-1 rounded-lg"
                  style={{ color: "var(--muted)" }}
                  title="Quay lại"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
                  📬
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-base font-extrabold truncate">
                  {selectedThread
                    ? selectedThread.type === "broadcast"
                      ? selectedThread.subject || "Thông báo"
                      : selectedThread.participants
                          .filter((p) => p.id !== user.id)
                          .map((p) => p.name)
                          .join(", ") || "Hộp thư"
                    : composeMode === "compose-broadcast"
                    ? "Thông báo mới"
                    : composeMode === "pick-recipient"
                    ? "Tin nhắn mới"
                    : "Hộp thư"}
                </div>
                {unreadCount > 0 && !selectedThread && composeMode === "closed" && (
                  <div className="text-[10px] font-bold" style={{ color: "var(--primary)" }}>
                    {unreadCount} chưa đọc
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg"
                style={{
                  color: "var(--muted)",
                  backgroundColor: "var(--bg-soft)",
                }}
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-tab nav + Compose (chỉ khi ở list view) */}
            {!selectedThread && composeMode === "closed" && (
              <div className="px-3 pt-2.5 pb-2 border-b shrink-0" style={{ borderColor: "var(--border-soft)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex gap-1 p-1 rounded-2xl border flex-1"
                    style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
                  >
                    <SubTabButton
                      active={subTab === "messages"}
                      onClick={() => switchSubTab("messages")}
                      icon={<InboxIcon className="w-3.5 h-3.5" />}
                      label="Tin nhắn"
                      badge={directThreads.reduce((s, t) => s + t.unread_count, 0)}
                    />
                    <SubTabButton
                      active={subTab === "announcements"}
                      onClick={() => switchSubTab("announcements")}
                      icon={<Megaphone className="w-3.5 h-3.5" />}
                      label="Thông báo"
                      badge={broadcastThreads.reduce((s, t) => s + t.unread_count, 0)}
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="p-1.5 rounded-xl border shrink-0"
                    style={{
                      backgroundColor: "var(--bg-soft)",
                      borderColor: "var(--border)",
                      color: "var(--muted)",
                    }}
                    title="Làm mới"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "spin-once" : ""}`} />
                  </button>
                </div>
                <button
                  onClick={openCompose}
                  className="w-full mt-2 px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {subTab === "messages"
                    ? "Soạn tin nhắn"
                    : user.role === "admin" || user.role === "teacher"
                    ? "Gửi thông báo"
                    : "Soạn tin nhắn"}
                </button>
              </div>
            )}

            {error && (
              <div
                className="mx-3 mt-2 p-2.5 rounded-xl border text-xs font-medium shrink-0"
                style={{
                  backgroundColor: "var(--danger-soft)",
                  borderColor: "var(--danger)",
                  color: "var(--danger)",
                }}
              >
                {error}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {composeMode === "pick-recipient" ? (
                <RecipientPicker
                  onPick={handleNewConversation}
                  onBack={closeCompose}
                />
              ) : composeMode === "compose-broadcast" ? (
                <BroadcastComposer
                  role={user.role}
                  classes={classes}
                  onCancel={closeCompose}
                  onSend={handleNewBroadcast}
                />
              ) : selectedThread ? (
                <ThreadView
                  key={selectedThread.id}
                  thread={selectedThread}
                  me={user}
                  onAfterSend={() => load(false)}
                />
              ) : loading ? (
                <div
                  className="flex-1 flex flex-col items-center justify-center gap-2"
                  style={{ color: "var(--muted)" }}
                >
                  <div className="text-3xl floaty">📬</div>
                  <div className="text-xs font-bold">Đang tải...</div>
                </div>
              ) : (
                <ThreadList
                  threads={visibleThreads}
                  selectedId={selectedId}
                  onSelect={handleSelectThread}
                  emptyHint={
                    subTab === "messages"
                      ? "Chưa có cuộc trò chuyện nào.\nBấm \"+ Soạn tin nhắn\" để bắt đầu."
                      : "Chưa có thông báo nào — GV/admin sẽ gửi thông báo tới bạn khi có cập nhật."
                  }
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Helpers
// ============================================================

function avatarGradient(seed: string): string {
  const palettes = [
    "linear-gradient(135deg, var(--primary), var(--accent))",
    "linear-gradient(135deg, var(--secondary), var(--primary))",
    "linear-gradient(135deg, var(--accent), var(--secondary))",
    "linear-gradient(135deg, var(--success), var(--primary))",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

function Avatar({
  name,
  id,
  size = 40,
  emoji,
}: {
  name: string;
  id?: string;
  size?: number;
  emoji?: string;
}) {
  const seed = id || name || "?";
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center font-extrabold shrink-0 text-white"
      style={{
        width: size,
        height: size,
        background: avatarGradient(seed),
        fontSize: size * 0.42,
      }}
    >
      {emoji || initial}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge: number;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5"
      style={{
        backgroundColor: active ? "var(--bg-card)" : "transparent",
        color: active ? "var(--primary)" : "var(--muted)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
      }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.split(" ")[0]}</span>
      {badge > 0 && (
        <span
          className="ml-0.5 px-1.5 py-0.5 text-[9px] font-extrabold rounded-full"
          style={{ backgroundColor: "var(--danger)", color: "white" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

// ============================================================
// Thread list (Messenger-style row, compact for popup)
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
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center" style={{ color: "var(--muted)" }}>
        <div className="text-4xl">📭</div>
        <p className="text-xs font-bold whitespace-pre-line">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <ul>
        {threads.map((t) => {
          const isActive = t.id === selectedId;
          const isUnread = t.unread_count > 0;
          const titleText =
            t.type === "broadcast"
              ? t.subject || "(không có tiêu đề)"
              : t.participants.length > 0
              ? t.participants
                  .filter((p) => p.id !== "") // (placeholder)
                  .map((p) => p.name)
                  .join(", ") || t.created_by_name
              : t.created_by_name;
          const preview = t.last_message?.body ?? "—";
          const time = formatMessageTime(t.last_message_at || t.created_at);
          return (
            <li
              key={t.id}
              className="border-b last:border-b-0"
              style={{ borderColor: "var(--border-soft)" }}
            >
              <button
                onClick={() => onSelect(t.id)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors"
                style={{
                  backgroundColor: isActive ? "var(--primary-soft)" : "transparent",
                }}
              >
                {t.type === "broadcast" ? (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--accent), var(--secondary))",
                    }}
                  >
                    📢
                  </div>
                ) : (
                  <Avatar name={titleText} id={t.id} size={40} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`text-sm truncate ${
                        isUnread ? "font-extrabold" : "font-bold"
                      }`}
                      style={isUnread ? { color: "var(--primary)" } : undefined}
                    >
                      {titleText}
                    </div>
                    <div
                      className="text-[10px] shrink-0 font-bold"
                      style={{ color: isUnread ? "var(--primary)" : "var(--muted)" }}
                    >
                      {time}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div
                      className={`text-[11px] truncate flex-1 ${
                        isUnread ? "font-bold" : ""
                      }`}
                      style={{ color: isUnread ? "var(--foreground)" : "var(--muted)" }}
                    >
                      {t.type === "broadcast" && t.target_class_name && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-md font-extrabold mr-1.5"
                          style={{
                            backgroundColor: "var(--bg-soft)",
                            color: "var(--accent)",
                          }}
                        >
                          🏫 {t.target_class_name}
                        </span>
                      )}
                      {preview}
                    </div>
                    {isUnread && (
                      <span
                        className="px-1.5 py-0.5 text-[9px] font-extrabold rounded-full shrink-0"
                        style={{ backgroundColor: "var(--primary)", color: "white" }}
                      >
                        {t.unread_count > 99 ? "99+" : t.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// Recipient picker
// ============================================================

function RecipientPicker({
  onPick,
  onBack,
}: {
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const [recipients, setRecipients] = useState<ApiUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listEligibleRecipients()
      .then((res) => {
        if (mounted) setRecipients(res.recipients);
      })
      .catch((e) => console.warn("eligible recipients failed:", e))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = recipients.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.username.toLowerCase().includes(q) ||
      (ROLE_LABEL[r.role] || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search */}
      <div className="p-2.5 border-b shrink-0" style={{ borderColor: "var(--border-soft)" }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl border"
          style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: "var(--muted)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc username..."
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-xs" style={{ color: "var(--muted)" }}>
            Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-xs" style={{ color: "var(--muted)" }}>
            {search ? `Không tìm thấy "${search}".` : "Không có người nào để nhắn."}
          </div>
        ) : (
          <ul>
            {search.trim() === "" && (
              <li
                className="px-3 pt-2.5 pb-1 text-[10px] font-extrabold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                Gợi ý
              </li>
            )}
            {filtered.map((r) => (
              <li
                key={r.id}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--border-soft)" }}
              >
                <button
                  onClick={() => onPick(r.id)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <Avatar name={r.name} id={r.id} size={40} emoji={ROLE_EMOJI[r.role]} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold truncate">{r.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                      @{r.username} · {ROLE_LABEL[r.role]}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Broadcast composer
// ============================================================

function BroadcastComposer({
  role,
  classes,
  onCancel,
  onSend,
}: {
  role: "student" | "parent" | "teacher" | "admin";
  classes: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSend: (payload: {
    subject: string;
    target_role: "parent" | "teacher" | "student" | "all";
    target_class_id: string | null;
    body: string;
  }) => Promise<void> | void;
}) {
  const [subject, setSubject] = useState("");
  const [targetRole, setTargetRole] = useState<"parent" | "teacher" | "student" | "all">("parent");
  const [targetClassId, setTargetClassId] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    if (!subject.trim()) return setError("Vui lòng nhập tiêu đề.");
    if (!body.trim()) return setError("Vui lòng nhập nội dung.");
    setSubmitting(true);
    try {
      await onSend({
        subject: subject.trim(),
        target_role: targetRole,
        target_class_id: targetClassId || null,
        body: body.trim(),
      });
    } catch (e: any) {
      setError(e?.error || "Gửi thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
            Tiêu đề
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ví dụ: Lịch nghỉ Tết"
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
            style={{
              backgroundColor: "var(--bg-soft)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
            autoFocus
            disabled={submitting}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
              Gửi tới
            </label>
            <select
              value={targetRole}
              onChange={(e) =>
                setTargetRole(e.target.value as "parent" | "teacher" | "student" | "all")
              }
              className="w-full px-2.5 py-2 rounded-xl border text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
              disabled={submitting}
            >
              {role === "admin" && <option value="student">🎓 Học sinh</option>}
              <option value="parent">👨‍👩‍👧 Phụ huynh</option>
              {role === "admin" && <option value="teacher">👩‍🏫 Giáo viên</option>}
              {role === "admin" && <option value="all">👥 Tất cả</option>}
              {role === "teacher" && <option value="student">🎓 Học sinh lớp tôi</option>}
              {role === "teacher" && <option value="all">👨‍👩‍👧 PH + HS lớp tôi</option>}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
              Lớp (tuỳ chọn)
            </label>
            <select
              value={targetClassId}
              onChange={(e) => setTargetClassId(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
              disabled={submitting}
            >
              <option value="">— Tất cả lớp —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
            Nội dung
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nhập nội dung thông báo..."
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
            style={{
              backgroundColor: "var(--bg-soft)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
              minHeight: 100,
            }}
            disabled={submitting}
          />
        </div>

        {error && (
          <div
            className="p-2.5 rounded-xl border text-xs font-medium"
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

      <div
        className="p-3 border-t flex gap-2 shrink-0"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl text-sm font-extrabold border"
          style={{
            backgroundColor: "var(--bg-soft)",
            borderColor: "var(--border)",
            color: "var(--muted)",
          }}
        >
          Hủy
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 py-2 rounded-xl text-sm font-extrabold disabled:opacity-50"
          style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
        >
          {submitting ? "Đang gửi..." : "Gửi thông báo"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Thread view
// ============================================================

function ThreadView({
  thread,
  me,
  onAfterSend,
}: {
  thread: MessageThread;
  me: ApiUser;
  onAfterSend: () => void;
  key?: string | number;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getThread(thread.id);
      setMessages(res.messages);
    } catch (e: any) {
      setError(e?.error || "Không tải được thread.");
    } finally {
      setLoading(false);
    }
  }, [thread.id]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!loading && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [loading, messages.length]);

  useEffect(() => {
    if (!loading) markThreadRead(thread.id).catch(() => {});
  }, [thread.id, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [replyBody]);

  const handleSend = async () => {
    const text = replyBody.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await sendMessage(thread.id, text);
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
      <div className="flex-1 flex items-center justify-center text-2xl floaty">⏳</div>
    );
  }

  const isBroadcast = thread.type === "broadcast";
  const canReply = !isBroadcast || me.role === "admin" || thread.created_by === me.id;
  const renderedItems = groupMessagesForRender(messages);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        style={{ backgroundColor: "var(--bg-soft)" }}
      >
        {messages.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: "var(--muted)" }}>
            Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!
          </div>
        ) : (
          renderedItems.map((item, idx) => {
            if (item.kind === "day") {
              return <DaySeparator key={`day-${item.label}-${idx}`} label={item.label} />;
            }
            const m = item.msg;
            const isMine = m.sender_id === me.id;
            return (
              <MessageBubble
                key={m.id}
                msg={m}
                isMine={isMine}
                showAvatar={item.showAvatar}
                showName={item.showName}
              />
            );
          })
        )}
        {error && (
          <div
            className="p-2.5 rounded-xl border text-xs font-medium"
            style={{
              backgroundColor: "var(--danger-soft)",
              borderColor: "var(--danger)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {canReply ? (
        <div
          className="p-2.5 border-t flex items-end gap-2 shrink-0"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <textarea
            ref={textareaRef}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={isBroadcast ? "Soạn thông báo..." : "Aa"}
            className="flex-1 px-3 py-2 rounded-2xl border text-sm outline-none resize-none"
            style={{
              backgroundColor: "var(--bg-soft)",
              borderColor: "var(--border-soft)",
              color: "var(--foreground)",
              minHeight: 38,
              maxHeight: 120,
            }}
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
            className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 shrink-0"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
            title="Gửi (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className="p-3 border-t text-[10px] text-center shrink-0"
          style={{ color: "var(--muted)", borderColor: "var(--border-soft)" }}
        >
          Bạn chỉ có thể xem thông báo này. Để liên hệ người gửi, bấm "Soạn tin nhắn".
        </div>
      )}
    </div>
  );
}

// ============================================================
// Message bubble
// ============================================================

function MessageBubble({
  msg,
  isMine,
  showAvatar,
  showName,
}: {
  msg: Message;
  isMine: boolean;
  showAvatar: boolean;
  showName: boolean;
  key?: string | number;
}) {
  if (isMine) {
    return (
      <div className="flex justify-end">
        <div className="flex flex-col items-end max-w-[78%]">
          <div
            className="px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--on-primary)",
              borderBottomRightRadius: 4,
            }}
          >
            {msg.body}
          </div>
          <div
            className="text-[9px] mt-0.5 px-1 font-bold"
            style={{ color: "var(--muted)" }}
          >
            {formatMessageTime(msg.created_at)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1.5">
      <div style={{ width: 28, height: 28 }} className="shrink-0">
        {showAvatar && (
          <Avatar
            name={msg.sender_name}
            id={msg.sender_id}
            size={28}
            emoji={ROLE_EMOJI[msg.sender_role]}
          />
        )}
      </div>
      <div className="flex flex-col items-start max-w-[78%]">
        {showName && (
          <div
            className="text-[10px] font-extrabold ml-2 mb-0.5"
            style={{ color: "var(--muted)" }}
          >
            {msg.sender_name}
          </div>
        )}
        <div
          className="px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words border"
          style={{
            backgroundColor: "var(--bg-card)",
            color: "var(--foreground)",
            borderColor: "var(--border-soft)",
            borderBottomLeftRadius: showAvatar ? 4 : 16,
          }}
        >
          {msg.body}
        </div>
        <div
          className="text-[9px] mt-0.5 px-1 font-bold"
          style={{ color: "var(--muted)" }}
        >
          {formatMessageTime(msg.created_at)}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Day separator
// ============================================================

function DaySeparator({ label }: { label: string; key?: string | number }) {
  return (
    <div className="flex items-center justify-center my-2">
      <span
        className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider"
        style={{
          backgroundColor: "var(--bg-card)",
          color: "var(--muted)",
          border: "1px solid var(--border-soft)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ============================================================
// Group messages
// ============================================================

type RenderItem =
  | { kind: "day"; label: string }
  | { kind: "msg"; msg: Message; showAvatar: boolean; showName: boolean };

function groupMessagesForRender(messages: Message[]): RenderItem[] {
  if (messages.length === 0) return [];
  const out: RenderItem[] = [];
  let lastDayKey: string | null = null;
  let lastSender: string | null = null;
  let lastTs: number | null = null;

  for (const m of messages) {
    const dk = dateKey(m.created_at);
    if (dk !== lastDayKey) {
      out.push({ kind: "day", label: formatDaySeparator(m.created_at) });
      lastDayKey = dk;
      lastSender = null;
      lastTs = null;
    }
    const ts = new Date(m.created_at.includes("T") ? m.created_at : m.created_at.replace(" ", "T") + "Z").getTime();
    const isSameGroup =
      lastSender === m.sender_id &&
      lastTs !== null &&
      ts - lastTs < GROUP_GAP_MS;
    out.push({
      kind: "msg",
      msg: m,
      showAvatar: !isSameGroup,
      showName: !isSameGroup,
    });
    lastSender = m.sender_id;
    lastTs = ts;
  }
  return out;
}
