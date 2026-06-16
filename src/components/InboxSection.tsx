/**
 * src/components/InboxSection.tsx — Shared inbox UI (Step 7 polish)
 *
 * Dùng bởi ParentDashboard, TeacherDashboard, AdminDashboard.
 *
 * Layout kiểu Messenger:
 *  - 2-pane (md+): list/recipient-picker bên trái 1/3, thread bên phải 2/3
 *  - Mobile: chỉ show 1 pane tại 1 thời điểm; bấm thread → ẩn list; back button để quay lại
 *  - "Soạn tin nhắn" mở RecipientPicker (search + eligible recipients) trong list pane
 *  - "Gửi thông báo" mở BroadcastComposer (subject + target + body) trong list pane
 *  - Message bubble: avatar bên trái cho incoming (group liên tiếp cùng sender), day-separator
 *
 * Polling: 30s setInterval + visibilitychange pause.
 */

import { useState, useEffect, useCallback, useRef, type FormEvent, type ReactNode } from "react";
import {
  Plus,
  Send,
  RefreshCw,
  ArrowLeft,
  Search,
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
  getUnreadCount,
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
const GROUP_GAP_MS = 5 * 60 * 1000; // 5 phút — nếu cùng sender mà cách >5 phút → nhóm mới

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
  const [composeMode, setComposeMode] = useState<ComposeMode>("closed");
  const [error, setError] = useState<string | null>(null);
  const [showThreadMobile, setShowThreadMobile] = useState(false);

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

  // Khi đổi sub-tab thì đóng compose + reset selection
  const switchSubTab = (next: SubTab) => {
    sound.playClick();
    setSubTab(next);
    setSelectedId(null);
    setShowThreadMobile(false);
    setComposeMode("closed");
  };

  // Click thread từ list (handle cả desktop lẫn mobile)
  const handleSelectThread = (id: string) => {
    sound.playClick();
    setSelectedId(id);
    setComposeMode("closed");
    setShowThreadMobile(true);
  };

  // Quay lại list (mobile only — desktop không cần)
  const handleBackToList = () => {
    sound.playClick();
    setShowThreadMobile(false);
  };

  // Mở compose mode (khi click "+ Soạn tin nhắn" / "Gửi thông báo")
  const openCompose = () => {
    sound.playClick();
    setError(null);
    setSelectedId(null);
    setShowThreadMobile(false);
    if (subTab === "announcements" && (role === "admin" || role === "teacher")) {
      setComposeMode("compose-broadcast");
    } else {
      setComposeMode("pick-recipient");
    }
  };

  const closeCompose = () => {
    sound.playClick();
    setComposeMode("closed");
  };

  // Khi gửi tin nhắn direct mới thành công → mở thread vừa tạo
  const handleNewConversation = async (recipientId: string) => {
    try {
      const res = await createDirectThread({
        recipient_id: recipientId,
        body: "👋", // placeholder first message — picker sẽ cho user gõ body riêng
      });
      sound.playSuccess();
      await load(false);
      setComposeMode("closed");
      setSelectedId(res.thread.id);
      setShowThreadMobile(true);
    } catch (e: any) {
      setError(e?.error || "Không tạo được cuộc trò chuyện.");
      sound.playIncorrect();
    }
  };

  const handleNewBroadcast = async (payload: {
    subject: string;
    target_role: "parent" | "teacher" | "all";
    target_class_id: string | null;
    body: string;
  }) => {
    try {
      const res = await createBroadcast({ type: "broadcast", ...payload });
      sound.playSuccess();
      await load(false);
      setComposeMode("closed");
      setSelectedId(res.thread.id);
      setShowThreadMobile(true);
    } catch (e: any) {
      setError(e?.error || "Không gửi được thông báo.");
      sound.playIncorrect();
    }
  };

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
    <div className="space-y-3">
      {/* Sub-tab nav + Compose + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-1 p-1 rounded-2xl border"
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
          {composeMode === "closed" ? (
            <button
              onClick={openCompose}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
              style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              {subTab === "messages"
                ? "Soạn tin nhắn"
                : role === "admin" || role === "teacher"
                ? "Gửi thông báo"
                : "Soạn tin nhắn"}
            </button>
          ) : (
            <button
              onClick={closeCompose}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold border"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border)",
                color: "var(--muted)",
              }}
            >
              Hủy
            </button>
          )}
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

      {/* 2-pane: list/recipient-picker/broadcast-composer (1/3) + thread (2/3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-[480px]">
        <div
          className={`md:col-span-1 ${
            showThreadMobile ? "hidden md:block" : "block"
          }`}
        >
          {composeMode === "pick-recipient" ? (
            <RecipientPicker
              role={role}
              onPick={handleNewConversation}
              onBack={closeCompose}
            />
          ) : composeMode === "compose-broadcast" ? (
            <BroadcastComposer
              role={role}
              classes={classes}
              onCancel={closeCompose}
              onSend={handleNewBroadcast}
            />
          ) : (
            <ThreadList
              threads={visibleThreads}
              selectedId={selectedId}
              onSelect={handleSelectThread}
              emptyHint={
                subTab === "messages"
                  ? "Chưa có cuộc trò chuyện nào.\nBấm \"+ Soạn tin nhắn\" để bắt đầu."
                  : "Chưa có thông báo nào — admin sẽ gửi thông báo tới bạn khi có cập nhật."
              }
            />
          )}
        </div>

        <div
          className={`md:col-span-2 ${
            showThreadMobile ? "block" : "hidden md:block"
          }`}
        >
          {selectedThread ? (
            <ThreadView
              key={selectedThread.id}
              thread={selectedThread}
              me={getMe()}
              onBackMobile={handleBackToList}
              onAfterSend={() => load(false)}
            />
          ) : (
            <EmptyPane subTab={subTab} composeMode={composeMode} role={role} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function getMe(): ApiUser {
  return JSON.parse(localStorage.getItem("apex_auth_user") || "{}") as ApiUser;
}

function avatarGradient(seed: string): string {
  // Stable gradient theo id/name — pick giữa primary, secondary, accent
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
      className="px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
      style={{
        backgroundColor: active ? "var(--bg-card)" : "transparent",
        color: active ? "var(--primary)" : "var(--muted)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
      }}
    >
      {icon}
      {label}
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
// Thread list (Messenger-style row)
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
        className="h-full p-8 rounded-2xl border text-center space-y-2 flex flex-col items-center justify-center"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-4xl">📭</div>
        <p className="text-sm font-extrabold whitespace-pre-line" style={{ color: "var(--muted)" }}>
          {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full rounded-2xl border overflow-y-auto"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <ul>
        {threads.map((t) => {
          const isActive = t.id === selectedId;
          const isUnread = t.unread_count > 0;
          const titleText =
            t.type === "broadcast"
              ? t.subject || "(không có tiêu đề)"
              : t.participants.length > 0
              ? t.participants.map((p) => p.name).join(" & ")
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
                    className="w-11 h-11 rounded-full flex items-center justify-center text-lg shrink-0 text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--accent), var(--secondary))",
                    }}
                  >
                    📢
                  </div>
                ) : (
                  <Avatar name={titleText} id={t.id} size={44} />
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
                      className={`text-[11px] truncate flex-1 ${
                        isUnread ? "font-bold" : ""
                      }`}
                      style={{ color: isUnread ? "var(--foreground)" : "var(--muted)" }}
                    >
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
// Recipient picker (Messenger-style "new conversation")
// ============================================================

function RecipientPicker({
  role,
  onPick,
  onBack,
}: {
  role: "parent" | "teacher" | "admin";
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
    <div
      className="h-full rounded-2xl border flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 border-b flex items-center gap-2"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <button
          onClick={onBack}
          className="p-1 rounded-lg md:hidden"
          style={{ color: "var(--muted)" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-extrabold">Tin nhắn mới</span>
      </div>

      {/* Search input */}
      <div className="p-2.5 border-b" style={{ borderColor: "var(--border-soft)" }}>
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

      {/* Recipients list */}
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
// Broadcast composer (inline trong list pane, admin/teacher only)
// ============================================================

function BroadcastComposer({
  role,
  classes,
  onCancel,
  onSend,
}: {
  role: "parent" | "teacher" | "admin";
  classes: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSend: (payload: {
    subject: string;
    target_role: "parent" | "teacher" | "all";
    target_class_id: string | null;
    body: string;
  }) => Promise<void> | void;
}) {
  const [subject, setSubject] = useState("");
  const [targetRole, setTargetRole] = useState<"parent" | "teacher" | "all">("parent");
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
    <div
      className="h-full rounded-2xl border flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 border-b flex items-center gap-2"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <button
          onClick={onCancel}
          className="p-1 rounded-lg md:hidden"
          style={{ color: "var(--muted)" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-extrabold">📢 Thông báo mới</span>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
            Tiêu đề
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ví dụ: Lịch nghỉ Tết Nguyên Đán"
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
                setTargetRole(e.target.value as "parent" | "teacher" | "all")
              }
              className="w-full px-2.5 py-2 rounded-xl border text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
              disabled={submitting}
            >
              <option value="parent">👨‍👩‍👧 Phụ huynh</option>
              {role === "admin" && <option value="teacher">👩‍🏫 Giáo viên</option>}
              <option value="all">👥 Tất cả</option>
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
            placeholder="Nhập nội dung thông báo gửi tới phụ huynh..."
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
            style={{
              backgroundColor: "var(--bg-soft)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
              minHeight: 120,
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
        className="p-3 border-t flex gap-2"
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
// Thread view (messages + day separators + reply box)
// ============================================================

function ThreadView({
  thread,
  me,
  onBackMobile,
  onAfterSend,
}: {
  thread: MessageThread;
  me: ApiUser;
  onBackMobile: () => void;
  onAfterSend: () => void;
  // Allow `key` from React (see Debugging tips in MEMORY.md)
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

  // Auto-scroll xuống cuối khi load / có tin mới
  useEffect(() => {
    if (!loading && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [loading, messages.length]);

  // Re-mark read
  useEffect(() => {
    if (!loading) markThreadRead(thread.id).catch(() => {});
  }, [thread.id, loading]);

  // Auto-grow textarea
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
      <div
        className="h-full p-12 rounded-2xl border text-center flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-2xl floaty">⏳</div>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="h-full p-6 rounded-2xl border text-center space-y-2 flex flex-col items-center justify-center"
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

  const isBroadcast = thread.type === "broadcast";
  const canReply = !isBroadcast || me.role === "admin" || thread.created_by === me.id;
  const titleText = isBroadcast
    ? thread.subject || "(không có tiêu đề)"
    : thread.participants.length > 0
    ? thread.participants.map((p) => p.name).join(" & ")
    : thread.created_by_name;

  // Build message groups: [{ kind: "day" | "msg", ... }]
  const renderedItems = groupMessagesForRender(messages);

  return (
    <div
      className="h-full rounded-2xl border flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 border-b flex items-center gap-2.5 shrink-0"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <button
          onClick={onBackMobile}
          className="p-1 -ml-1 rounded-lg md:hidden"
          style={{ color: "var(--muted)" }}
          title="Quay lại"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {isBroadcast ? (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 text-white"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--secondary))",
            }}
          >
            📢
          </div>
        ) : (
          <Avatar name={titleText} id={thread.id} size={40} />
        )}
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
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        style={{ minHeight: 240, backgroundColor: "var(--bg-soft)" }}
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
            const showAvatar = item.showAvatar;
            const showName = item.showName;
            return (
              <MessageBubble
                key={m.id}
                msg={m}
                isMine={isMine}
                showAvatar={showAvatar}
                showName={showName}
                meName={me.name}
              />
            );
          })
        )}
      </div>

      {/* Reply box */}
      {canReply ? (
        <div
          className="p-2.5 border-t flex items-end gap-2 shrink-0"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <textarea
            ref={textareaRef}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={isBroadcast ? "Soạn thông báo tiếp theo..." : "Aa"}
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
          Bạn chỉ có thể xem thông báo này. Để liên hệ người gửi, bấm "Soạn tin nhắn" ở trên.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Message bubble (avatar on left cho incoming, group consecutive)
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
  meName: string;
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
// Group messages: chèn day-separator + xác định showAvatar/showName
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
      // Reset grouping khi sang ngày mới
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

// ============================================================
// Empty pane
// ============================================================

function EmptyPane({
  subTab,
  composeMode,
  role,
}: {
  subTab: SubTab;
  composeMode: ComposeMode;
  role: "parent" | "teacher" | "admin";
}) {
  const isComposing = composeMode !== "closed";
  if (isComposing) {
    return (
      <div
        className="h-full p-8 rounded-2xl border text-center space-y-2 flex flex-col items-center justify-center"
        style={{
          backgroundColor: "var(--bg-soft)",
          borderColor: "var(--border-soft)",
          borderStyle: "dashed",
        }}
      >
        <div className="text-3xl">{composeMode === "compose-broadcast" ? "📢" : "💬"}</div>
        <p className="text-sm font-extrabold" style={{ color: "var(--muted)" }}>
          {composeMode === "compose-broadcast"
            ? "Soạn thông báo bên trái rồi bấm Gửi."
            : role === "parent"
            ? "Chọn giáo viên hoặc admin để bắt đầu."
            : "Chọn người nhận để bắt đầu."}
        </p>
      </div>
    );
  }
  return (
    <div
      className="h-full p-8 rounded-2xl border text-center space-y-2 flex flex-col items-center justify-center"
      style={{
        backgroundColor: "var(--bg-soft)",
        borderColor: "var(--border-soft)",
        borderStyle: "dashed",
      }}
    >
      <div className="text-4xl">{subTab === "messages" ? "💬" : "📢"}</div>
      <p className="text-base font-extrabold">
        {subTab === "messages" ? "Chọn cuộc trò chuyện" : "Chọn thông báo"}
      </p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Bấm vào 1 thread ở danh sách bên trái để xem nội dung.
      </p>
    </div>
  );
}
