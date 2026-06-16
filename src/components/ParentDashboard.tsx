import { useState, useEffect, useCallback, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  Check,
  AlertCircle,
  Flame,
  Clock,
  CheckCircle2,
  BarChart3,
  Phone,
  Save,
  X,
  MessageSquare,
} from "lucide-react";
import { SKILL_META, SkillId } from "../types";
import {
  getParentDashboard,
  updateMyPhone,
  ParentDashboard as ParentDashboardData,
  ParentChild,
} from "../api/client";
import sound from "../utils/sound";
import SkillCard from "./ui/SkillCard";
import KpiCard from "./ui/KpiCard";
import { Field, inputStyle, inputClass } from "./ui/Field";

type Section = "overview" | "settings";

const SKILL_ORDER: SkillId[] = ["read", "write", "listen", "speak", "learn"];

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: "overview", label: "Tổng quan", emoji: "📊" },
  { id: "settings", label: "Cài đặt", emoji: "⚙️" },
];

// ============================================================
// Section pill nav (giống AdminDashboard)
// ============================================================

function SectionNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  return (
    <div
      className="flex gap-1.5 p-1 rounded-2xl border overflow-x-auto"
      style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
    >
      {SECTIONS.map((s) => {
        const isActive = s.id === active;
        return (
          <button
            key={s.id}
            onClick={() => {
              sound.playClick();
              onChange(s.id);
            }}
            className="flex-1 min-w-fit px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 transition-colors"
            style={{
              backgroundColor: isActive ? "var(--bg-card)" : "transparent",
              color: isActive ? "var(--primary)" : "var(--muted)",
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <span className="text-sm leading-none">{s.emoji}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

/**
 * Format "Vừa vào X phút trước" / "Chưa vào X ngày" từ lastActive ISO string.
 */
function formatLastActive(lastActive: string | null, totalEvents: number): string {
  if (!lastActive) {
    return totalEvents === 0 ? "Chưa từng vào" : "Chưa rõ";
  }
  const last = new Date(lastActive.replace(" ", "T") + "Z");
  const diffMs = Date.now() - last.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (minutes < 1) return "Vừa vào lúc nãy";
  if (minutes < 60) return `Vừa vào ${minutes} phút trước`;
  if (hours < 24) return `Vào ${hours} giờ trước`;
  if (days === 1) return "Hôm qua";
  return `Chưa vào ${days} ngày`;
}

// ============================================================
// Per-child tab content
// ============================================================

function ChildTab({ child }: { child: ParentChild }) {
  const lastActiveText = formatLastActive(child.engagement.lastActive, child.engagement.totalEvents);
  const isAlerting = child.needsHelp;

  return (
    <div className="space-y-5">
      {/* Hero card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-5 md:p-6 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        style={{
          background:
            "linear-gradient(120deg, var(--bg-card) 0%, var(--primary-soft) 50%, var(--bg-card) 100%)",
          borderColor: "var(--primary)",
        }}
      >
        <div className="flex items-center gap-3.5 relative z-10">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md text-2xl shrink-0"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "white" }}
          >
            {(child.name || child.username).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
                {child.name}
              </h2>
              <span
                className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--primary)",
                  borderColor: "var(--primary)",
                }}
              >
                {child.relationship || "Con"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {child.cefr_level && (
                <span
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-md border"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    color: "var(--accent)",
                    borderColor: "var(--accent)",
                  }}
                >
                  {child.cefr_level}
                </span>
              )}
              {child.level && (
                <span
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-md"
                  style={{ backgroundColor: "var(--bg-elevated)", color: "var(--muted)" }}
                >
                  {child.level}
                </span>
              )}
              {child.goal && (
                <span
                  className="text-[10px] font-bold"
                  style={{ color: "var(--muted)" }}
                >
                  • Mục tiêu: {child.goal}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Streak + Last active */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          icon={<Flame className="w-4 h-4" />}
          label="Streak"
          value={child.engagement.streak}
          suffix={child.engagement.streak > 0 ? "ngày" : ""}
          color="var(--streak)"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="Hoạt động"
          value={lastActiveText}
          color="var(--muted)"
        />
      </div>

      {/* Hôm nay (3 KPIs) */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Bài hôm nay"
          value={child.today.task_done_today}
          color="var(--success)"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="Phút hôm nay"
          value={child.today.minutes_today}
          suffix="ph"
          color="var(--primary)"
        />
        <KpiCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Lượt đo"
          value={child.today.measurements_today}
          color="var(--secondary)"
        />
      </div>

      {/* Needs help alert */}
      {isAlerting && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl border space-y-2"
          style={{
            backgroundColor: "var(--danger-soft)",
            borderColor: "var(--danger)",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" style={{ color: "var(--danger)" }} />
            <h3
              className="text-sm font-extrabold uppercase tracking-wider"
              style={{ color: "var(--danger)" }}
            >
              Cần chú ý
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {child.helpReasons.map((r, i) => (
              <span
                key={i}
                className="text-[10px] font-extrabold px-2 py-1 rounded-md border"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--danger)",
                  borderColor: "var(--danger)",
                }}
              >
                {r}
              </span>
            ))}
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            💡 Hãy khuyến khích con vào app thường xuyên hơn. Mỗi ngày 1 bước nhỏ thôi!
          </p>
        </motion.div>
      )}

      {/* 5 Skill cards */}
      <div className="p-5 rounded-3xl border space-y-3 shadow-sm" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <span className="text-base">🧠</span>
          <h3 className="text-sm font-extrabold uppercase tracking-wider">
            5 kỹ năng
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
          {SKILL_ORDER.map((sid) => (
            <SkillCard key={sid} skillId={sid} skill={child.skills[sid]} size="md" />
          ))}
        </div>
        <p className="text-[10px] pt-1" style={{ color: "var(--muted)" }}>
          {Object.values(child.skills).reduce((s, sk) => s + sk.attempts, 0)} lần đo tổng cộng.
          {SKILL_META.read && " Dùng chung thước đo với HS."}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Overview section (with child tabs)
// ============================================================

function OverviewSection({ data }: { data: ParentDashboardData }) {
  const children = data.children;
  const [activeIdx, setActiveIdx] = useState(0);

  if (children.length === 0) {
    return (
      <div
        className="p-8 rounded-3xl border text-center space-y-3"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-3xl">📭</div>
        <p className="text-sm font-extrabold">Bạn chưa được liên kết với HS nào.</p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Liên hệ trung tâm để được thêm vào danh sách phụ huynh.
        </p>
      </div>
    );
  }

  const active = children[activeIdx] || children[0];

  return (
    <div className="space-y-4">
      {/* Child tabs (1+ con) */}
      {children.length > 1 && (
        <div
          className="flex gap-1.5 p-1 rounded-2xl border overflow-x-auto"
          style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
        >
          {children.map((c, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={c.id}
                onClick={() => {
                  sound.playClick();
                  setActiveIdx(i);
                }}
                className="flex-1 min-w-fit px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                style={{
                  backgroundColor: isActive ? "var(--bg-card)" : "transparent",
                  color: isActive ? "var(--primary)" : "var(--muted)",
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold"
                  style={{
                    background: isActive
                      ? "linear-gradient(135deg, var(--primary), var(--accent))"
                      : "var(--bg-elevated)",
                    color: isActive ? "white" : "var(--muted)",
                  }}
                >
                  {(c.name || c.username).charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{c.name}</span>
                {c.needsHelp && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: "var(--danger)" }}
                    title="Cần chú ý"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          <ChildTab child={active} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Settings section (phone)
// ============================================================

function SettingsSection({
  initialPhone,
  onSaved,
}: {
  initialPhone: string | null;
  onSaved: (phone: string | null) => void;
}) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(false);
    const trimmed = phone.trim();
    setSaving(true);
    try {
      const res = await updateMyPhone(trimmed === "" ? null : trimmed);
      setPhone(res.phone ?? "");
      setSuccess(true);
      onSaved(res.phone);
      sound.playSuccess();
      setTimeout(() => setSuccess(false), 2500);
    } catch (e: any) {
      const msg = e?.error || "Không lưu được số điện thoại.";
      setError(msg);
      sound.playIncorrect();
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setPhone("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-3xl border space-y-4 shadow-sm"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
        <MessageSquare className="w-4 h-4" style={{ color: "var(--primary)" }} />
        <h3 className="text-sm font-extrabold uppercase tracking-wider">
          Thông báo Zalo
        </h3>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Field
          label="Số điện thoại"
          hint="Trung tâm sẽ gửi báo cáo học tập định kỳ (tuần / 2 tuần) qua Zalo đến SĐT này."
        >
          <div className="relative">
            <Phone
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--muted)" }}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ví dụ: 0987654321"
              disabled={saving}
              className={inputClass("pl-9 pr-9")}
              style={inputStyle}
              maxLength={20}
            />
            {phone && (
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
                style={{ color: "var(--muted)" }}
                title="Xóa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </Field>

        {error && (
          <div
            className="p-3 rounded-xl border flex items-start gap-2 text-xs font-medium"
            style={{
              backgroundColor: "var(--danger-soft)",
              borderColor: "var(--danger)",
              color: "var(--danger)",
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            className="p-3 rounded-xl border flex items-start gap-2 text-xs font-medium"
            style={{
              backgroundColor: "var(--success-soft)",
              borderColor: "var(--success)",
              color: "var(--success)",
            }}
          >
            <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Đã lưu số điện thoại thành công.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--on-primary)",
          }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Đang lưu..." : "Lưu số điện thoại"}
        </button>
      </form>

      <div
        className="pt-3 border-t space-y-1.5"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <p className="text-[11px] font-bold" style={{ color: "var(--muted-strong)" }}>
          🔒 Cam kết bảo mật
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
          SĐT chỉ dùng để gửi báo cáo từ trung tâm, không chia sẻ cho bên thứ ba. Bạn có thể
          xóa SĐT bất kỳ lúc nào. Mỗi lần lưu sẽ được ghi lại trong nhật ký hệ thống.
        </p>
      </div>
    </motion.div>
  );
}

// ============================================================
// Main
// ============================================================

export default function ParentDashboard() {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await getParentDashboard();
      setData(res);
    } catch (e) {
      console.warn("getParentDashboard failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const handleRefresh = () => {
    sound.playClick();
    setRefreshing(true);
    load(false);
  };

  // 1. Initial loading
  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6">
        <div
          className="p-12 rounded-3xl border text-center space-y-3"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl floaty">🦉</div>
          <div className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            Đang tải dashboard phụ huynh...
          </div>
        </div>
      </div>
    );
  }

  // 2. Error / no data
  if (!data) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6">
        <div
          className="p-8 rounded-3xl border text-center space-y-3"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl">⚠️</div>
          <p className="text-sm font-extrabold">Không tải được dashboard</p>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold mt-2"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "spin-once" : ""}`} />
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const childCount = data.count;
  const greeting =
    childCount === 0
      ? "Xin chào!"
      : childCount === 1
      ? `Xin chào ${data.parent.name}! Con đang học tốt.`
      : `Xin chào ${data.parent.name}! Bạn có ${childCount} con đang học.`;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-5 md:p-6 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        style={{
          background:
            "linear-gradient(120deg, var(--bg-card) 0%, var(--accent-soft) 50%, var(--bg-card) 100%)",
          borderColor: "var(--accent)",
        }}
      >
        <div className="flex items-center gap-3.5 relative z-10">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md text-2xl shrink-0"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--secondary))" }}
          >
            👨‍👩‍👧
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
                {greeting}
              </h1>
              <span
                className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--accent)",
                  borderColor: "var(--accent)",
                }}
              >
                Phụ huynh
              </span>
            </div>
            <p className="text-sm mt-1 font-medium" style={{ color: "var(--muted)" }}>
              {data.parent.phone
                ? `📱 SĐT nhận báo cáo: ${data.parent.phone}`
                : "📱 Chưa có SĐT nhận báo cáo — thêm trong phần Cài đặt."}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-colors"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border)",
            color: "var(--foreground-soft)",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "spin-once" : ""}`} />
          {refreshing ? "Đang tải..." : "Làm mới"}
        </button>
      </motion.div>

      {/* Section nav */}
      <SectionNav active={section} onChange={setSection} />

      {/* Section content */}
      <AnimatePresence mode="wait">
        {section === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <OverviewSection data={data} />
          </motion.div>
        )}
        {section === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <SettingsSection
              initialPhone={data.parent.phone}
              onSaved={(phone) => {
                setData((prev) =>
                  prev
                    ? { ...prev, parent: { ...prev.parent, phone } }
                    : prev
                );
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
