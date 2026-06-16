import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  Users,
  Activity,
  AlertCircle,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  BarChart3,
  Sparkles,
  GraduationCap,
} from "lucide-react";
import { SKILL_META, SkillId } from "../types";
import {
  getTeacherDashboard,
  TeacherDashboardResponse,
  StudentWithStats,
} from "../api/client";
import sound from "../utils/sound";
import { formatSkillValue } from "../utils/format";
import KpiCard from "./ui/KpiCard";
import InboxSection from "./InboxSection";

// ============================================================
// Helpers
// ============================================================

const SKILL_ORDER: SkillId[] = ["read", "write", "listen", "speak", "learn"];

type Section = "class" | "inbox";

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: "class", label: "Lớp của tôi", emoji: "🏫" },
  { id: "inbox", label: "Hộp thư", emoji: "📬" },
];

function SectionNav({
  active,
  onChange,
  unreadCount = 0,
}: {
  active: Section;
  onChange: (s: Section) => void;
  unreadCount?: number;
}) {
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
            {s.id === "inbox" && unreadCount > 0 && (
              <span
                className="ml-1 px-1.5 py-0.5 text-[9px] font-extrabold rounded-full"
                style={{ backgroundColor: "var(--danger)", color: "white" }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Lấy primary metric value từ 1 skill state.
 */
function getPrimaryValue(
  skills: TeacherDashboardResponse["students"][number]["skills"],
  skillId: SkillId
): number {
  const meta = SKILL_META[skillId];
  const sk = (skills as any)[skillId];
  if (!sk) return 0;
  const v = sk[meta.primaryMetric];
  return typeof v === "number" ? v : 0;
}

/**
 * Tính delta % giữa primary metric hôm nay vs hôm qua (Step 2 đã có sẵn trong SkillState).
 * Trả về { delta, display } để hiển thị trong cell.
 */
function getDeltaDisplay(
  skills: TeacherDashboardResponse["students"][number]["skills"],
  skillId: SkillId
): { arrow: "↑" | "↓" | "→" | "—"; text: string; color: string; abs: number | null } {
  const sk = (skills as any)[skillId];
  const d = sk?.todayDelta as number | null;
  if (d == null) {
    return { arrow: "—", text: "Chưa có hôm qua", color: "var(--muted)", abs: null };
  }
  if (d === 0) {
    return { arrow: "→", text: "→0%", color: "var(--muted)", abs: 0 };
  }
  return {
    arrow: d > 0 ? "↑" : "↓",
    text: `${d > 0 ? "↑" : "↓"}${Math.abs(d)}%`,
    color: d > 0 ? "var(--success)" : "var(--danger)",
    abs: Math.abs(d),
  };
}

// ============================================================
// Main component
// ============================================================

export default function TeacherDashboard() {
  const [data, setData] = useState<TeacherDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<Section>("class");
  const [unreadCount, setUnreadCount] = useState(0);
  const [allClasses, setAllClasses] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getTeacherDashboard();
      setData(res);
      setAllClasses([{ id: res.class.id, name: res.class.name }]);
    } catch (e: any) {
      const msg = e?.error || "Không tải được dashboard.";
      setError(msg);
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
            Đang tải dashboard lớp...
          </div>
        </div>
      </div>
    );
  }

  // 2. Error (có thể là "Chưa có lớp nào." hoặc lỗi khác)
  if (error || !data) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6">
        <div
          className="p-8 rounded-3xl border text-center space-y-3"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl">🏫</div>
          <div className="text-base font-extrabold">
            {error?.includes("Chưa có lớp nào")
              ? "Bạn chưa được phân công lớp nào."
              : "Không tải được dashboard"}
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {error?.includes("Chưa có lớp nào")
              ? "Liên hệ admin để được thêm vào lớp nhé."
              : error || "Lỗi không xác định."}
          </p>
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

  const { class: cls, students, classStats } = data;
  const helpStudents = students.filter((s) => s.needsHelp);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Section nav (Step 7 — pill nav 2 tab: lớp + hộp thư) */}
      <SectionNav active={section} onChange={setSection} unreadCount={unreadCount} />

      <AnimatePresence mode="wait">
        {section === "class" && (
          <motion.div
            key="class"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            <ClassSection
              cls={cls}
              students={students}
              classStats={classStats}
              helpStudents={helpStudents}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          </motion.div>
        )}
        {section === "inbox" && (
          <motion.div
            key="inbox"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <InboxSection
              role="teacher"
              classes={allClasses}
              onUnreadChange={setUnreadCount}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Class section (extracted — Step 7 refactor để thêm pill nav)
// ============================================================

function ClassSection({
  cls,
  students,
  classStats,
  helpStudents,
  refreshing,
  onRefresh,
}: {
  cls: TeacherDashboardResponse["class"];
  students: StudentWithStats[];
  classStats: TeacherDashboardResponse["classStats"];
  helpStudents: StudentWithStats[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* HEADER CARD — gradient banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-5 md:p-6 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        style={{
          background:
            "linear-gradient(120deg, var(--bg-card) 0%, var(--secondary-soft) 50%, var(--bg-card) 100%)",
          borderColor: "var(--secondary)",
        }}
      >
        <div className="flex items-center gap-3.5 relative z-10">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md text-2xl shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--primary), var(--accent))",
            }}
          >
            👩‍🏫
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
                {cls.name}
              </h1>
              <span
                className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--secondary)",
                  borderColor: "var(--secondary)",
                }}
              >
                Lớp của tôi
              </span>
            </div>
            <div
              className="text-sm mt-1 font-medium flex items-center gap-2 flex-wrap"
              style={{ color: "var(--muted)" }}
            >
              {cls.schedule && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {cls.schedule}
                </span>
              )}
              {cls.schedule && <span>•</span>}
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {classStats.totalStudents} học sinh
              </span>
            </div>
            {cls.description && (
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                {cls.description}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onRefresh}
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

      {/* CLASS KPI ROW — 5 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          icon={<Users className="w-4 h-4" />}
          label="Tổng HS"
          value={classStats.totalStudents}
          color="var(--primary)"
        />
        <KpiCard
          icon={<Activity className="w-4 h-4" />}
          label="HĐ hôm nay"
          value={classStats.activeToday}
          suffix={`/${classStats.totalStudents}`}
          color="var(--success)"
        />
        <KpiCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="Cần hỗ trợ"
          value={classStats.needsHelpCount}
          color="var(--danger)"
          highlight={classStats.needsHelpCount > 0}
        />
        <KpiCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Lượt đo hôm nay"
          value={classStats.totalMeasurementsThisWeek}
          color="var(--secondary)"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="Phút học hôm nay"
          value={classStats.totalMinutesThisWeek}
          suffix=" ph"
          color="var(--accent)"
        />
      </div>

      {/* AVG SKILLS + NEEDS HELP — 2 column on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* AVG SKILLS — 5 mini bars */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-5 rounded-3xl border space-y-3 shadow-sm"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
            <Sparkles className="w-4 h-4" style={{ color: "var(--primary)" }} />
            <h3 className="text-sm font-extrabold uppercase tracking-wider">
              Trung bình 5 kỹ năng của lớp
            </h3>
          </div>
          <div className="space-y-2.5">
            {SKILL_ORDER.map((sid) => {
              const meta = SKILL_META[sid];
              const v = classStats.avgSkills[sid] ?? 0;
              let pct = 0;
              if (sid === "write") pct = Math.min(100, v * 10);
              else if (sid === "speak") pct = Math.min(100, v);
              else if (sid === "learn") pct = Math.min(100, v / 2);
              else pct = Math.min(100, v);
              return (
                <div key={sid} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold flex items-center gap-1.5">
                      <span className="text-sm leading-none">{meta.emoji}</span>
                      <span>{meta.label}</span>
                      <span style={{ color: "var(--muted)" }}>· {meta.primaryLabel}</span>
                    </span>
                    <span className="font-extrabold" style={{ color: meta.color }}>
                      {formatSkillValue(sid, v)}
                    </span>
                  </div>
                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--bg-soft)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] pt-1" style={{ color: "var(--muted)" }}>
            Tính từ HS đã có data (bỏ qua HS mới chưa đo lần nào).
          </p>
        </motion.div>

        {/* NEEDS HELP */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-5 rounded-3xl border space-y-3 shadow-sm"
          style={{
            backgroundColor: helpStudents.length > 0 ? "var(--danger-soft)" : "var(--bg-card)",
            borderColor: helpStudents.length > 0 ? "var(--danger)" : "var(--border)",
          }}
        >
          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" style={{ color: "var(--danger)" }} />
              <h3 className="text-sm font-extrabold uppercase tracking-wider">
                Cần hỗ trợ ({helpStudents.length})
              </h3>
            </div>
            {helpStudents.length === 0 && (
              <span className="text-[10px] font-bold" style={{ color: "var(--success)" }}>
                🎉 Lớp ổn
              </span>
            )}
          </div>

          {helpStudents.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <div className="text-3xl">🎉</div>
              <p className="text-sm font-extrabold">Cả lớp đều ổn!</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Không có HS nào bị cảnh báo hôm nay.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {helpStudents.map((s) => (
                <li
                  key={s.id}
                  className="p-3 rounded-2xl border flex items-start gap-3"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--danger)",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0"
                    style={{
                      background: "linear-gradient(135deg, var(--danger), var(--accent))",
                      color: "white",
                    }}
                  >
                    {(s.name || s.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm truncate">{s.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.helpReasons.map((r, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-extrabold px-2 py-0.5 rounded-md border"
                          style={{
                            backgroundColor: "var(--danger-soft)",
                            color: "var(--danger)",
                            borderColor: "var(--danger)",
                          }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>

      {/* MA TRẬN LỚP — students × 5 skills */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="p-5 rounded-3xl border space-y-3 shadow-sm"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <GraduationCap className="w-4 h-4" style={{ color: "var(--primary)" }} />
          <h3 className="text-sm font-extrabold uppercase tracking-wider">
            Ma trận lớp — học sinh × kỹ năng
          </h3>
        </div>

        {students.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="text-3xl">📭</div>
            <p className="text-sm font-extrabold">Lớp chưa có học sinh nào.</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Khi admin thêm HS vào lớp, bảng sẽ tự cập nhật.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b-2" style={{ borderColor: "var(--border)" }}>
                  <th
                    className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider sticky left-0 z-10"
                    style={{
                      color: "var(--muted)",
                      backgroundColor: "var(--bg-card)",
                    }}
                  >
                    Học sinh
                  </th>
                  {SKILL_ORDER.map((sid) => {
                    const meta = SKILL_META[sid];
                    return (
                      <th
                        key={sid}
                        className="px-2 py-2.5 text-center"
                        style={{ minWidth: 110 }}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base leading-none">{meta.emoji}</span>
                          <span
                            className="text-[10px] font-extrabold uppercase tracking-wider"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[9px]" style={{ color: "var(--muted)" }}>
                            {meta.primaryLabel}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const initials = (s.name || s.username || "?").charAt(0).toUpperCase();
                  return (
                    <tr
                      key={s.id}
                      className="border-b transition-colors"
                      style={{
                        borderColor: "var(--border-soft)",
                        backgroundColor: s.needsHelp ? "var(--danger-soft)" : "transparent",
                      }}
                    >
                      <td
                        className="px-3 py-2.5 sticky left-0 z-10"
                        style={{
                          backgroundColor: s.needsHelp ? "var(--danger-soft)" : "var(--bg-card)",
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold shrink-0"
                            style={{
                              background: s.needsHelp
                                ? "linear-gradient(135deg, var(--danger), var(--accent))"
                                : "linear-gradient(135deg, var(--primary), var(--secondary))",
                              color: "white",
                            }}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-extrabold text-xs truncate flex items-center gap-1">
                              {s.name}
                              {s.needsHelp && (
                                <AlertCircle className="w-3 h-3 shrink-0" style={{ color: "var(--danger)" }} />
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {s.cefr_level && (
                                <span
                                  className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md"
                                  style={{
                                    backgroundColor: "var(--primary-soft)",
                                    color: "var(--primary)",
                                  }}
                                >
                                  {s.cefr_level}
                                </span>
                              )}
                              {s.engagement.streak > 0 && (
                                <span
                                  className="text-[9px] font-extrabold flex items-center gap-0.5"
                                  style={{ color: "var(--streak)" }}
                                  title={`Streak ${s.engagement.streak} ngày`}
                                >
                                  🔥 {s.engagement.streak}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {SKILL_ORDER.map((sid) => {
                        const meta = SKILL_META[sid];
                        const val = getPrimaryValue(s.skills, sid);
                        const sk = (s.skills as any)[sid];
                        const isNew = sk?.attempts === 0;
                        const delta = getDeltaDisplay(s.skills, sid);
                        return (
                          <td key={sid} className="px-2 py-2 text-center">
                            <div
                              className="inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl border min-w-[88px]"
                              style={{
                                backgroundColor: isNew ? "var(--bg-soft)" : "var(--bg-elevated)",
                                borderColor: isNew ? "var(--border-soft)" : meta.color,
                              }}
                            >
                              <div
                                className="text-sm font-extrabold"
                                style={{ color: isNew ? "var(--muted)" : meta.color }}
                              >
                                {formatSkillValue(sid, val)}
                              </div>
                              {!isNew && delta.abs !== null && (
                                <div
                                  className="text-[9px] font-extrabold flex items-center gap-0.5"
                                  style={{ color: delta.color }}
                                  title="So với hôm qua"
                                >
                                  {delta.arrow === "↑" && <TrendingUp className="w-2.5 h-2.5" />}
                                  {delta.arrow === "↓" && <TrendingDown className="w-2.5 h-2.5" />}
                                  {delta.arrow === "→" && <Minus className="w-2.5 h-2.5" />}
                                  {delta.abs}%
                                </div>
                              )}
                              <div className="text-[9px]" style={{ color: "var(--muted)" }}>
                                {sk?.attempts ?? 0} lần
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <p
        className="text-[11px] text-center pt-1"
        style={{ color: "var(--muted)" }}
      >
        🦉 Dữ liệu tự động cập nhật khi HS đo kỹ năng. Nhấn "Làm mới" để reload thủ công.
      </p>
    </div>
  );
}
