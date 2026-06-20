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
  LifeBuoy,
  MessageCircle,
  Hand,
  Eye,
  Radio,
} from "lucide-react";
import { SKILL_META, SkillId } from "../types";
import {
  getTeacherDashboard,
  listMyClasses,
  liveHelpTeacherQueue,
  liveHelpTeacherProactive,
  getActiveStudents,
  TeacherClassItem,
  TeacherDashboardResponse,
  StudentWithStats,
  LiveHelpSession,
  ActiveStudent,
} from "../api/client";
import sound from "../utils/sound";
import { formatSkillValue } from "../utils/format";
import KpiCard from "./ui/KpiCard";
import { TeacherLiveHelpPane, ObserveModePane } from "./livehelp";

const SAVED_CLASS_KEY = "apex_teacher_class";

// ============================================================
// Helpers
// ============================================================

const SKILL_ORDER: SkillId[] = ["read", "write", "listen", "speak", "learn"];

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
  const [myClasses, setMyClasses] = useState<TeacherClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classListLoading, setClassListLoading] = useState(true);

  // Live Help (Step 12a): teacher queue + active session pane
  const [liveHelpQueue, setLiveHelpQueue] = useState<LiveHelpSession[]>([]);
  const [activeHelpSession, setActiveHelpSession] = useState<LiveHelpSession | null>(null);

  // Step 12d P3: observe mode — full-screen pane mount khi GV click "Vào xem"
  const [observingStudent, setObservingStudent] = useState<ActiveStudent | null>(null);

  const loadLiveHelpQueue = useCallback(async () => {
    try {
      const { sessions } = await liveHelpTeacherQueue();
      setLiveHelpQueue(sessions);
    } catch (e) {
      console.warn("liveHelp queue load failed:", e);
    }
  }, []);

  // Initial load + 10s polling cho queue
  useEffect(() => {
    loadLiveHelpQueue();
    const tick = setInterval(loadLiveHelpQueue, 10_000);
    return () => clearInterval(tick);
  }, [loadLiveHelpQueue]);

  // Load class list + hydrate saved selection from localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listMyClasses();
        if (cancelled) return;
        setMyClasses(res.classes);
        // Chỉ set nếu user chưa click lớp nào trong lúc chờ listMyClasses
        setSelectedClassId((prev) => {
          if (prev != null) return prev;
          let saved: string | null = null;
          try {
            saved = localStorage.getItem(SAVED_CLASS_KEY);
          } catch (e) {
            console.warn("localStorage read failed:", e);
          }
          return saved && res.classes.some((c) => c.id === saved)
            ? saved
            : res.classes[0]?.id ?? null;
        });
      } catch (e) {
        console.warn("listMyClasses failed:", e);
      } finally {
        if (!cancelled) setClassListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (classId: string | null, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getTeacherDashboard(classId);
      setData(res);
    } catch (e: any) {
      const msg = e?.error || "Không tải được dashboard.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetch khi classId đổi (cancellation guard chống stale response)
  useEffect(() => {
    if (selectedClassId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await getTeacherDashboard(selectedClassId);
        if (cancelled) return;
        setData(res);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.error || "Không tải được dashboard.";
        setError(msg);
      } finally {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  const handleRefresh = () => {
    sound.playClick();
    setRefreshing(true);
    load(selectedClassId, false);
  };

  const handleSelectClass = (id: string) => {
    if (id === selectedClassId) return;
    sound.playClick();
    setSelectedClassId(id);
    try {
      localStorage.setItem(SAVED_CLASS_KEY, id);
    } catch (e) {
      console.warn("localStorage write failed:", e);
    }
  };

  // 1. Initial loading (chờ cả class list + data lớp)
  if (loading || classListLoading) {
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

  // 1b. GV chưa có lớp nào (Step 8: edge case — listMyClasses trả [])
  if (myClasses.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6">
        <div
          className="p-8 rounded-3xl border text-center space-y-3"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl">🏫</div>
          <div className="text-base font-extrabold">
            Bạn chưa được phân công lớp nào.
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Liên hệ admin để được thêm vào lớp nhé.
          </p>
        </div>
      </div>
    );
  }

  // 2. Error (case 0-classes đã được handle ở 1b — ở đây chỉ là lỗi thật)
  if (error || !data) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6">
        <div
          className="p-8 rounded-3xl border text-center space-y-3"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl">🏫</div>
          <div className="text-base font-extrabold">Không tải được dashboard</div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {error || "Lỗi không xác định."}
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
      {/* Pill nav — chỉ hiện khi GV dạy ≥ 2 lớp */}
      {myClasses.length >= 2 && (
        <ClassPillNav
          classes={myClasses}
          selectedId={selectedClassId}
          onChange={handleSelectClass}
        />
      )}

      {/* Step 12d: Lớp đang học — GV-driven classroom observe */}
      <LiveStudentsSection
        onObserveStudent={(student) => setObservingStudent(student)}
      />

      <ClassSection
        cls={cls}
        students={students}
        classStats={classStats}
        helpStudents={helpStudents}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        liveHelpQueue={liveHelpQueue}
        onOpenHelpSession={setActiveHelpSession}
        onProactiveHelp={async (sid) => {
          try {
            await liveHelpTeacherProactive({ student_id: sid });
            await loadLiveHelpQueue();
          } catch (e: any) {
            alert(e?.error || "Không thể tạo phiên hỗ trợ.");
          }
        }}
      />

      {/* Live Help slide-out pane (Step 12a) */}
      <AnimatePresence>
        {activeHelpSession && (
          <TeacherLiveHelpPane
            session={activeHelpSession}
            onClose={() => setActiveHelpSession(null)}
            onEnded={loadLiveHelpQueue}
          />
        )}
      </AnimatePresence>

      {/* Step 12d P3: Observe Mode pane (GV-driven) */}
      <AnimatePresence>
        {observingStudent && (
          <ObserveModePane
            student={observingStudent}
            onClose={() => setObservingStudent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Class pill nav (Step 8: chọn lớp khi GV dạy ≥ 2 lớp)
// ============================================================

function ClassPillNav({
  classes,
  selectedId,
  onChange,
}: {
  classes: TeacherClassItem[];
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="flex gap-1.5 p-1 rounded-2xl border overflow-x-auto"
      style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
    >
      {classes.map((c) => {
        const isActive = c.id === selectedId;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className="flex-1 min-w-fit px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 transition-colors"
            style={{
              backgroundColor: isActive ? "var(--bg-card)" : "transparent",
              color: isActive ? "var(--primary)" : "var(--muted)",
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
            title={
              c.schedule
                ? `${c.schedule} • ${c.member_count} HS`
                : `${c.member_count} HS`
            }
          >
            <span className="text-sm leading-none">🏫</span>
            <span className="hidden sm:inline">{c.name}</span>
            <span
              className="text-[10px] font-bold"
              style={{ color: isActive ? "var(--primary)" : "var(--muted)" }}
            >
              {c.member_count}
            </span>
          </button>
        );
      })}
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
  liveHelpQueue,
  onOpenHelpSession,
  onProactiveHelp,
}: {
  cls: TeacherDashboardResponse["class"];
  students: StudentWithStats[];
  classStats: TeacherDashboardResponse["classStats"];
  helpStudents: StudentWithStats[];
  refreshing: boolean;
  onRefresh: () => void;
  liveHelpQueue: LiveHelpSession[];
  onOpenHelpSession: (s: LiveHelpSession) => void;
  onProactiveHelp: (studentId: string) => Promise<void>;
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

      {/* LIVE HELP QUEUE — Step 12a Cấp 1 (text hint) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="p-5 rounded-3xl border space-y-3 shadow-sm"
        style={{
          backgroundColor: liveHelpQueue.length > 0 ? "var(--primary-soft)" : "var(--bg-card)",
          borderColor: liveHelpQueue.length > 0 ? "var(--primary)" : "var(--border)",
        }}
      >
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4" style={{ color: "var(--primary)" }} />
            <h3 className="text-sm font-extrabold uppercase tracking-wider">
              🆘 Hỗ trợ trực tiếp
            </h3>
            {liveHelpQueue.length > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold"
                style={{ backgroundColor: "var(--primary)", color: "#fff" }}
              >
                {liveHelpQueue.length}
              </span>
            )}
          </div>
        </div>

        {liveHelpQueue.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <div className="text-3xl">📭</div>
            <p className="text-sm font-extrabold">Chưa có HS nào đang chờ hỗ trợ.</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Khi HS bấm "Cần hỗ trợ", danh sách sẽ xuất hiện ở đây.
            </p>
            {students.length > 0 && (
              <ProactiveHelpSection students={students} onProactive={onProactiveHelp} />
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {liveHelpQueue.map((s) => (
              <li
                key={s.id}
                className="p-3 rounded-2xl border flex items-center gap-3 cursor-pointer hover:scale-[1.01] transition-transform"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: s.status === "pending" ? "var(--warning)" : "var(--success)",
                }}
                onClick={() => onOpenHelpSession(s)}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0"
                  style={{
                    background: "linear-gradient(135deg, var(--primary), var(--accent))",
                    color: "white",
                  }}
                >
                  {s.student_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-sm truncate">{s.student_name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px]" style={{ color: "var(--muted)" }}>
                    {s.trigger === "teacher_proactive" ? (
                      <><Hand className="w-3 h-3" /> GV đã vào</>
                    ) : (
                      <><MessageCircle className="w-3 h-3" /> HS yêu cầu</>
                    )}
                    <span>·</span>
                    <span>{new Date(s.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
                <span
                  className="px-2 py-1 rounded-lg text-[10px] font-extrabold"
                  style={{
                    backgroundColor: s.status === "pending" ? "var(--warning)" : "var(--success)",
                    color: "#fff",
                  }}
                >
                  {s.status === "pending" ? "⏳ Chờ" : "● Đang chat"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

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

// ============================================================
// ProactiveHelpSection — dropdown cho GV chủ động hỏi HS
// Step 12a: dùng khi queue trống nhưng GV muốn "pop in" 1-1 với HS bất kỳ
// ============================================================

function ProactiveHelpSection({
  students,
  onProactive,
}: {
  students: StudentWithStats[];
  onProactive: (studentId: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-extrabold underline"
        style={{ color: "var(--primary)" }}
      >
        {open ? "✕ Đóng" : "+ Chủ động hỏi HS"}
      </button>
      {open && (
        <div className="mt-2 max-h-[200px] overflow-y-auto rounded-xl border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          {students.map((s) => (
            <button
              key={s.id}
              disabled={busy === s.id}
              onClick={async () => {
                if (!confirm(`Vào hỏi thăm HS ${s.name}?`)) return;
                setBusy(s.id);
                await onProactive(s.id);
                setBusy(null);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-xs font-bold flex items-center gap-2 border-b last:border-b-0 disabled:opacity-50"
              style={{ borderColor: "var(--border-soft)", color: "var(--foreground)" }}
            >
              <span className="font-extrabold">{s.name}</span>
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                @{s.username}
              </span>
              {busy === s.id && <span style={{ color: "var(--primary)" }}>Đang vào...</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// LiveStudentsSection — Step 12d Phase 2
//
// GV-driven classroom: list HS các lớp mình dạy với status
// (doing_today / idle / offline) + last activity + tasks/minutes today.
//
// Polling mỗi 10s (cùng cadence với liveHelpQueue).
//
// Click row → gọi onObserveStudent(studentId).
//   - Phase 2: stub (alert) — Phase 3 sẽ wire tới /observe/:studentId route
//     (mở observe mode + voice auto-connect + whiteboard).
//
// Lock semantics: nếu `currently_observed_by` set → disable row click + show
// "GV đang xem" badge thay vì "Vào xem →".
// ============================================================

function LiveStudentsSection({
  onObserveStudent,
}: {
  onObserveStudent: (student: ActiveStudent) => void;
}) {
  const [data, setData] = useState<{
    students: ActiveStudent[];
    summary: { doing_today: number; idle: number; offline: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await getActiveStudents();
      setData({ students: res.students, summary: res.summary });
    } catch (e) {
      console.warn("active-students load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const tick = setInterval(load, 10_000);
    return () => clearInterval(tick);
  }, [load]);

  // Sort: doing_today trước, rồi idle, rồi offline. Trong cùng nhóm: hoạt động gần nhất trước.
  const order = { doing_today: 0, idle: 1, offline: 2 } as const;
  const sorted = data?.students
    ? [...data.students].sort((a, b) => {
        const so = order[a.status] - order[b.status];
        if (so !== 0) return so;
        const la = a.last_activity_minutes_ago ?? 9999;
        const lb = b.last_activity_minutes_ago ?? 9999;
        return la - lb;
      })
    : [];

  const summary = data?.summary ?? { doing_today: 0, idle: 0, offline: 0 };
  const hasActive = summary.doing_today > 0;
  const total = data?.students.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 }}
      className="p-5 rounded-3xl border space-y-3 shadow-sm"
      style={{
        backgroundColor: hasActive ? "var(--success-soft)" : "var(--bg-card)",
        borderColor: hasActive ? "var(--success)" : "var(--border)",
      }}
    >
      <div
        className="flex items-center justify-between pb-2 border-b gap-3 flex-wrap"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4" style={{ color: "var(--success)" }} />
          <h3 className="text-sm font-extrabold uppercase tracking-wider">
            🟢 Lớp đang học
          </h3>
          {hasActive && (
            <motion.span
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "var(--success)", color: "#fff" }}
              title="Đang có HS active trong 5 phút gần nhất"
            >
              ● LIVE
            </motion.span>
          )}
        </div>
        <div
          className="flex items-center gap-2 text-[10px] font-extrabold"
          style={{ color: "var(--muted)" }}
        >
          <span style={{ color: "var(--success)" }}>{summary.doing_today} đang học</span>
          <span>•</span>
          <span style={{ color: "var(--warning)" }}>{summary.idle} idle</span>
          <span>•</span>
          <span>{summary.offline} offline</span>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-6 text-sm" style={{ color: "var(--muted)" }}>
          Đang tải danh sách lớp...
        </div>
      ) : total === 0 ? (
        <div className="text-center py-6 space-y-2">
          <div className="text-3xl">🏫</div>
          <p className="text-sm font-extrabold">Chưa có HS nào trong lớp.</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Khi HS tham gia lớp, danh sách sẽ tự động xuất hiện ở đây.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((s) => (
            <StudentLiveRow
              key={s.id}
              student={s}
              onClick={() => onObserveStudent(s)}
            />
          ))}
        </ul>
      )}

      <p className="text-[10px] pt-1" style={{ color: "var(--muted)" }}>
        🦉 Tự cập nhật mỗi 10s. Click HS đang học để vào quan sát màn hình +
        nói chuyện trực tiếp.
      </p>
    </motion.div>
  );
}

function StudentLiveRow({
  student,
  onClick,
}: {
  student: ActiveStudent;
  onClick: () => void;
  key?: string | number;
}) {
  const statusConfig = {
    doing_today: {
      label: "Đang học",
      color: "var(--success)",
      bg: "var(--success-soft)",
    },
    idle: {
      label: "Idle",
      color: "var(--warning)",
      bg: "var(--warning-soft)",
    },
    offline: {
      label: "Offline",
      color: "var(--muted)",
      bg: "var(--bg-soft)",
    },
  }[student.status];

  const observedByOther = !!student.currently_observed_by;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={observedByOther}
        className="w-full p-3 rounded-2xl border flex items-center gap-3 transition-all hover:scale-[1.005] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        style={{
          backgroundColor: observedByOther
            ? "var(--bg-soft)"
            : "var(--bg-elevated)",
          borderColor:
            student.status === "doing_today"
              ? "var(--success)"
              : "var(--border-soft)",
        }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0"
          style={{
            background:
              student.status === "doing_today"
                ? "linear-gradient(135deg, var(--success), var(--primary))"
                : "linear-gradient(135deg, var(--primary), var(--secondary))",
            color: "white",
          }}
        >
          {(student.name || student.username).charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold text-sm truncate">
              {student.name}
            </span>
            <span
              className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0"
              style={{
                backgroundColor: statusConfig.bg,
                color: statusConfig.color,
              }}
            >
              ● {statusConfig.label}
            </span>
            {student.cefr_level && (
              <span
                className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0"
                style={{
                  backgroundColor: "var(--primary-soft)",
                  color: "var(--primary)",
                }}
              >
                {student.cefr_level}
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 mt-1 text-[10px] flex-wrap"
            style={{ color: "var(--muted)" }}
          >
            <span>@{student.username}</span>
            <span>•</span>
            <span>{student.class_name}</span>
            {student.last_activity_minutes_ago != null && (
              <>
                <span>•</span>
                <span>
                  {student.last_activity_minutes_ago < 1
                    ? "vừa xong"
                    : `${student.last_activity_minutes_ago} phút trước`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0 hidden sm:flex">
          <div
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ color: "var(--foreground-soft)" }}
            title="Bài hoàn thành hôm nay"
          >
            <Activity className="w-3 h-3" />
            {student.tasks_done_today} bài
          </div>
          <div
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ color: "var(--foreground-soft)" }}
            title="Phút học hôm nay"
          >
            <Clock className="w-3 h-3" />
            {student.minutes_today} ph
          </div>
        </div>

        {observedByOther ? (
          <div
            className="text-[10px] font-extrabold px-2 py-1 rounded-lg flex items-center gap-1 shrink-0"
            style={{
              backgroundColor: "var(--bg-soft)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
            title={`Đang được GV ${
              student.currently_observed_name || "khác"
            } quan sát (1 HS / 1 observe)`}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden md:inline">
              {student.currently_observed_name || "Đang xem"}
            </span>
            <span className="md:hidden">Đang xem</span>
          </div>
        ) : (
          <div
            className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg shrink-0"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--on-primary)",
            }}
          >
            Vào xem →
          </div>
        )}
      </button>
    </li>
  );
}
