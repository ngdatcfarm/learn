import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  Users,
  GraduationCap,
  School,
  AlertCircle,
  BarChart3,
  Search,
  Plus,
  Pencil,
  KeyRound,
  Trash2,
  RotateCcw,
  MessageSquare,
  ChevronRight,
  Mic,
} from "lucide-react";
import KpiCard from "./ui/KpiCard";
import { Field, inputStyle, inputClass } from "./ui/Field";
import {
  adminOverview,
  adminListUsers,
  adminCreateUser,
  adminPatchUser,
  adminDeleteUser,
  adminRestoreUser,
  adminResetPassword,
  adminListClasses,
  adminCreateClass,
  adminPatchClass,
  adminDeleteClass,
  adminGetZaloSettings,
  adminPatchZaloSettings,
  adminListAudit,
  adminListCronRuns,
  adminListAudio,
  AdminUser,
  AdminClass,
  AdminOverview,
  ZaloSettings,
  CronRun,
  AudioRecording,
} from "../api/client";
import sound from "../utils/sound";
import { ROLE_LABEL, ROLE_EMOJI } from "../utils/roles";
import {
  CreateUserModal,
  EditUserModal,
  ResetPasswordModal,
  CreateClassModal,
  EditClassModal,
  ManageMembersModal,
  TestZaloModal,
} from "./AdminUserModals";

type Section = "overview" | "users" | "classes" | "zalo" | "audio";

// ============================================================
// Section pill nav
// ============================================================

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: "overview", label: "Tổng quan", emoji: "📊" },
  { id: "users", label: "Người dùng", emoji: "👥" },
  { id: "classes", label: "Lớp", emoji: "🏫" },
  { id: "zalo", label: "Zalo", emoji: "💬" },
  { id: "audio", label: "Audio", emoji: "🎙️" },
];

function SectionNav({
  active,
  onChange,
}: {
  active: Section;
  onChange: (s: Section) => void;
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
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoadingOverview(true);
    try {
      const o = await adminOverview();
      setOverview(o);
    } catch (e) {
      console.warn("adminOverview failed:", e);
    } finally {
      setLoadingOverview(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(true);
  }, [loadOverview]);

  const handleRefresh = () => {
    sound.playClick();
    setRefreshing(true);
    loadOverview(false);
  };

  if (loadingOverview) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6">
        <div
          className="p-12 rounded-3xl border text-center space-y-3"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl floaty">🦉</div>
          <div className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            Đang tải admin dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-5 md:p-6 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        style={{
          background:
            "linear-gradient(120deg, var(--bg-card) 0%, var(--danger-soft) 50%, var(--bg-card) 100%)",
          borderColor: "var(--danger)",
        }}
      >
        <div className="flex items-center gap-3.5 relative z-10">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md text-2xl shrink-0"
            style={{ background: "linear-gradient(135deg, var(--danger), var(--accent))" }}
          >
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
                Quản trị hệ thống
              </h1>
              <span
                className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--danger)",
                  borderColor: "var(--danger)",
                }}
              >
                Admin
              </span>
            </div>
            <div
              className="text-sm mt-1 font-medium"
              style={{ color: "var(--muted)" }}
            >
              Toàn quyền quản lý người dùng, lớp học, và tích hợp Zalo
            </div>
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
            <OverviewSection data={overview} onRefresh={loadOverview} />
          </motion.div>
        )}
        {section === "users" && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <UsersSection onRefresh={loadOverview} />
          </motion.div>
        )}
        {section === "classes" && (
          <motion.div
            key="classes"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <ClassesSection onRefresh={loadOverview} />
          </motion.div>
        )}
        {section === "zalo" && (
          <motion.div
            key="zalo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <ZaloSection />
          </motion.div>
        )}
        {section === "audio" && (
          <motion.div
            key="audio"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <AudioSection />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// OVERVIEW section
// ============================================================

function OverviewSection({
  data,
  onRefresh,
}: {
  data: AdminOverview | null;
  onRefresh: () => Promise<void> | void;
}) {
  if (!data) return null;
  const { userCounts, classCount, needsHelpCount, recentAudits, recentCronRuns } = data;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users className="w-4 h-4" />}
          label="Học sinh"
          value={userCounts.student}
          color="var(--primary)"
        />
        <KpiCard
          icon={<GraduationCap className="w-4 h-4" />}
          label="Giáo viên"
          value={userCounts.teacher}
          color="var(--accent)"
        />
        <KpiCard
          icon={<School className="w-4 h-4" />}
          label="Lớp"
          value={classCount}
          color="var(--secondary)"
        />
        <KpiCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="Cần hỗ trợ (7d)"
          value={needsHelpCount}
          color="var(--danger)"
          highlight={needsHelpCount > 0}
        />
      </div>

      {/* Recent audit + cron runs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Hoạt động admin gần đây" icon={<BarChart3 className="w-4 h-4" style={{ color: "var(--primary)" }} />}>
          {recentAudits.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: "var(--muted)" }}>
              Chưa có audit log nào.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {recentAudits.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                    {a.created_at?.slice(11, 19) || ""}
                  </span>
                  <span
                    className="font-extrabold px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}
                  >
                    {a.action}
                  </span>
                  <span className="truncate flex-1" style={{ color: "var(--foreground-soft)" }}>
                    {a.actor_name || a.actor_username || "system"}
                    {a.target_id ? ` → ${a.target_id.slice(0, 8)}…` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Cron jobs gần đây" icon={<RefreshCw className="w-4 h-4" style={{ color: "var(--secondary)" }} />}>
          {recentCronRuns.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: "var(--muted)" }}>
              Cron chưa chạy. Sẽ có sau 1h boot hoặc test bằng cách reload.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {recentCronRuns.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span
                    className="font-extrabold px-1.5 py-0.5 rounded-md"
                    style={{
                      backgroundColor:
                        r.status === "success"
                          ? "var(--success-soft)"
                          : r.status === "error"
                          ? "var(--danger-soft)"
                          : "var(--bg-soft)",
                      color:
                        r.status === "success"
                          ? "var(--success)"
                          : r.status === "error"
                          ? "var(--danger)"
                          : "var(--muted)",
                    }}
                  >
                    {r.status}
                  </span>
                  <span className="font-extrabold" style={{ color: "var(--foreground-soft)" }}>
                    {r.job_name}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                    {r.rows_affected != null ? `· ${r.rows_affected} rows` : ""}
                  </span>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: "var(--muted)" }}>
                    {r.started_at?.slice(11, 19) || ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-3xl border space-y-3 shadow-sm"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
        {icon}
        <h3 className="text-sm font-extrabold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

// ============================================================
// USERS section
// ============================================================

const ROLE_FILTERS: { id: "" | "student" | "parent" | "teacher" | "admin"; label: string; emoji: string }[] = [
  { id: "", label: "Tất cả", emoji: "👥" },
  ...(["student", "parent", "teacher", "admin"] as const).map((id) => ({
    id,
    label: ROLE_LABEL[id],
    emoji: ROLE_EMOJI[id],
  })),
];

function UsersSection({ onRefresh }: { onRefresh: () => Promise<void> | void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<"" | "student" | "parent" | "teacher" | "admin">("");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [modal, setModal] = useState<"create" | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<{ user: { id: string; username: string }; temp: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminListUsers({
        role: roleFilter || undefined,
        search: search || undefined,
        includeDeleted: showDeleted,
      });
      setUsers(res.users);
    } catch (e) {
      console.warn("adminListUsers failed:", e);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search, showDeleted]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleCreate = async (payload: any) => {
    try {
      await adminCreateUser(payload);
      sound.playSuccess();
      setModal(null);
      await load();
      onRefresh();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi tạo user.");
    }
  };

  const handlePatch = async (payload: any) => {
    if (!editUser) return;
    try {
      await adminPatchUser(editUser.id, payload);
      sound.playSuccess();
      setEditUser(null);
      await load();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi cập nhật.");
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!window.confirm(`Xóa mềm "${u.name}" (@${u.username})? Họ sẽ không đăng nhập được nữa nhưng data vẫn giữ.`))
      return;
    try {
      await adminDeleteUser(u.id);
      sound.playClick();
      await load();
      onRefresh();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi xóa.");
    }
  };

  const handleRestore = async (u: AdminUser) => {
    try {
      await adminRestoreUser(u.id);
      sound.playSuccess();
      await load();
      onRefresh();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi khôi phục.");
    }
  };

  const handleReset = async (u: AdminUser) => {
    if (
      !window.confirm(
        `Reset mật khẩu cho "${u.name}"? Mật khẩu mới sẽ hiển thị 1 lần và tất cả thiết bị sẽ bị đăng xuất.`
      )
    )
      return;
    try {
      const res = await adminResetPassword(u.id);
      setResetTarget({ user: res.user, temp: res.tempPassword });
    } catch (e: any) {
      alert(e?.error || "Lỗi khi reset.");
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div
        className="p-3 rounded-2xl border flex flex-col md:flex-row gap-2"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex-1 flex items-center gap-2 px-3 rounded-xl border" style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}>
          <Search className="w-4 h-4" style={{ color: "var(--muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc username..."
            className="flex-1 bg-transparent py-2 text-sm outline-none"
          />
        </div>
        <label className="flex items-center gap-1.5 px-2 text-xs font-extrabold" style={{ color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="accent-current"
          />
          Hiện đã xóa
        </label>
        <button
          onClick={() => {
            sound.playClick();
            setModal("create");
          }}
          className="px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
          style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Tạo user
        </button>
      </div>

      {/* Role filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.id || "all"}
            onClick={() => {
              sound.playClick();
              setRoleFilter(f.id);
            }}
            className="px-3 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1 border"
            style={{
              backgroundColor: roleFilter === f.id ? "var(--primary)" : "var(--bg-card)",
              color: roleFilter === f.id ? "var(--on-primary)" : "var(--muted)",
              borderColor: roleFilter === f.id ? "var(--primary)" : "var(--border)",
            }}
          >
            <span>{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            Đang tải...
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="text-3xl">📭</div>
            <p className="text-sm font-extrabold">Không có user nào.</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Bỏ filter hoặc tạo user mới.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b-2" style={{ borderColor: "var(--border)" }}>
                  <th className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    User
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Role
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Thông tin
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Tạo
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b"
                    style={{
                      borderColor: "var(--border-soft)",
                      opacity: u.deleted_at ? 0.6 : 1,
                    }}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold shrink-0"
                          style={{
                            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                            color: "white",
                          }}
                        >
                          {(u.name || u.username).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs truncate flex items-center gap-1">
                            {u.name}
                            {u.deleted_at && (
                              <span
                                className="text-[9px] font-extrabold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "var(--danger-soft)", color: "var(--danger)" }}
                              >
                                Đã xóa
                              </span>
                            )}
                          </div>
                          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                            @{u.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {u.role === "student" ? (
                        <div className="flex flex-wrap gap-1">
                          {u.cefr_level && (
                            <span
                              className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md"
                              style={{ backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}
                            >
                              {u.cefr_level}
                            </span>
                          )}
                          {u.goal && (
                            <span
                              className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md"
                              style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted)" }}
                            >
                              {u.goal}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px]" style={{ color: "var(--muted)" }}>
                      {u.created_at?.slice(0, 10) || "?"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!u.deleted_at ? (
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn title="Sửa" onClick={() => setEditUser(u)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </IconBtn>
                          <IconBtn title="Reset mật khẩu" onClick={() => handleReset(u)}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </IconBtn>
                          <IconBtn title="Xóa mềm" onClick={() => handleDelete(u)} danger>
                            <Trash2 className="w-3.5 h-3.5" />
                          </IconBtn>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRestore(u)}
                          className="text-xs font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1 ml-auto"
                          style={{ color: "var(--success)" }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Khôi phục
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal === "create" && (
          <CreateUserModal onClose={() => setModal(null)} onSubmit={handleCreate} />
        )}
        {editUser && (
          <EditUserModal
            user={editUser}
            onClose={() => setEditUser(null)}
            onSubmit={handlePatch}
          />
        )}
        {resetTarget && (
          <ResetPasswordModal
            user={resetTarget.user}
            tempPassword={resetTarget.temp}
            onClose={() => setResetTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RoleBadge({ role }: { role: AdminUser["role"] }) {
  const colorMap: Record<AdminUser["role"], string> = {
    student: "var(--primary)",
    parent: "var(--secondary)",
    teacher: "var(--accent)",
    admin: "var(--danger)",
  };
  return (
    <span
      className="text-[10px] font-extrabold px-2 py-0.5 rounded-md border flex items-center gap-1 w-fit"
      style={{ backgroundColor: "var(--bg-soft)", color: colorMap[role], borderColor: colorMap[role] }}
    >
      <span>{ROLE_EMOJI[role]}</span> {ROLE_LABEL[role]}
    </span>
  );
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg transition-colors"
      style={{
        color: danger ? "var(--danger)" : "var(--muted)",
        backgroundColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}

// ============================================================
// CLASSES section
// ============================================================

function ClassesSection({ onRefresh }: { onRefresh: () => Promise<void> | void }) {
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | null>(null);
  const [editClass, setEditClass] = useState<AdminClass | null>(null);
  const [manageClass, setManageClass] = useState<AdminClass | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        adminListClasses(),
        adminListUsers({ role: "teacher" }),
      ]);
      setClasses(c.classes);
      setTeachers(t.users);
    } catch (e) {
      console.warn("load classes failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (payload: any) => {
    try {
      await adminCreateClass(payload);
      sound.playSuccess();
      setModal(null);
      await load();
      onRefresh();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi tạo lớp.");
    }
  };

  const handlePatch = async (payload: any) => {
    if (!editClass) return;
    try {
      await adminPatchClass(editClass.id, payload);
      sound.playSuccess();
      setEditClass(null);
      await load();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi cập nhật.");
    }
  };

  const handleDelete = async (c: AdminClass) => {
    if (
      !window.confirm(
        `Xóa lớp "${c.name}"? Tất cả thành viên trong lớp sẽ bị xóa khỏi lớp.`
      )
    )
      return;
    try {
      await adminDeleteClass(c.id);
      sound.playClick();
      await load();
      onRefresh();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi xóa lớp.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => {
            sound.playClick();
            setModal("create");
          }}
          className="px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
          style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Tạo lớp
        </button>
      </div>

      {loading ? (
        <div
          className="p-8 rounded-2xl border text-center"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Đang tải...
        </div>
      ) : classes.length === 0 ? (
        <div
          className="p-8 rounded-2xl border text-center space-y-2"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl">🏫</div>
          <p className="text-sm font-extrabold">Chưa có lớp nào.</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Tạo lớp đầu tiên để bắt đầu.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b-2" style={{ borderColor: "var(--border)" }}>
                  <th className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Lớp
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    GV
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Lịch
                  </th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    HS
                  </th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id} className="border-b" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-2.5">
                      <div className="font-extrabold text-xs">{c.name}</div>
                      {c.description && (
                        <div className="text-[10px] mt-0.5 truncate max-w-[260px]" style={{ color: "var(--muted)" }}>
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: "var(--foreground-soft)" }}>
                      {c.teacher_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
                      {c.schedule || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="text-xs font-extrabold px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}
                      >
                        {c.member_count}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Sửa" onClick={() => setEditClass(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </IconBtn>
                        <button
                          onClick={() => setManageClass(c)}
                          className="text-xs font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1"
                          style={{ color: "var(--primary)" }}
                        >
                          <ChevronRight className="w-3.5 h-3.5" /> Thành viên
                        </button>
                        <IconBtn title="Xóa" onClick={() => handleDelete(c)} danger>
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {modal === "create" && (
          <CreateClassModal
            teachers={teachers}
            onClose={() => setModal(null)}
            onSubmit={handleCreate}
          />
        )}
        {editClass && (
          <EditClassModal
            cls={editClass}
            teachers={teachers}
            onClose={() => setEditClass(null)}
            onSubmit={handlePatch}
          />
        )}
        {manageClass && (
          <ManageMembersModal
            cls={manageClass}
            onClose={() => setManageClass(null)}
            refresh={async () => {
              await load();
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// ZALO section
// ============================================================

function ZaloSection() {
  const [settings, setSettings] = useState<ZaloSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [lastCron, setLastCron] = useState<CronRun | null>(null);

  // Form state
  const [frequency, setFrequency] = useState<ZaloSettings["frequency"]>("weekly");
  const [sendTime, setSendTime] = useState("08:00");
  const [sendDow, setSendDow] = useState<string>("");
  const [oaId, setOaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateData, setTemplateData] = useState("");
  const [incSkills, setIncSkills] = useState(true);
  const [incStreak, setIncStreak] = useState(true);
  const [incMinutes, setIncMinutes] = useState(true);
  const [incHelp, setIncHelp] = useState(true);
  const [customMessage, setCustomMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, runs] = await Promise.all([adminGetZaloSettings(), adminListCronRuns(20)]);
      const cfg = s.settings;
      if (cfg) {
        setSettings(cfg);
        setFrequency(cfg.frequency);
        setSendTime((cfg.send_time || "08:00:00").slice(0, 5));
        setSendDow(cfg.send_day_of_week ? String(cfg.send_day_of_week) : "");
        setOaId(cfg.zalo_oa_id || "");
        setAccessToken(cfg.zalo_access_token || "");
        setTemplateId(cfg.zalo_template_id || "");
        setTemplateData(cfg.zalo_template_data_json || "");
        setIncSkills(!!cfg.include_skills);
        setIncStreak(!!cfg.include_streak);
        setIncMinutes(!!cfg.include_minutes);
        setIncHelp(!!cfg.include_needs_help);
        setCustomMessage(cfg.custom_message || "");
      }
      const pr = runs.runs.find((r) => r.job_name === "send_parent_reports");
      if (pr) setLastCron(pr);
    } catch (e) {
      console.warn("load zalo failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminPatchZaloSettings({
        frequency,
        send_time: sendTime,
        send_day_of_week: sendDow ? Number(sendDow) : null,
        zalo_oa_id: oaId.trim() || null,
        zalo_access_token: accessToken.trim() || null,
        zalo_template_id: templateId.trim() || null,
        zalo_template_data_json: templateData.trim() || null,
        include_skills: incSkills,
        include_streak: incStreak,
        include_minutes: incMinutes,
        include_needs_help: incHelp,
        custom_message: customMessage.trim() || null,
      });
      sound.playSuccess();
      await load();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi lưu.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div
        className="p-8 rounded-2xl border text-center"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Đang tải...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="p-4 rounded-2xl border space-y-3"
        style={{ backgroundColor: "var(--warning-soft)", borderColor: "var(--warning)" }}
      >
        <div className="flex items-start gap-2">
          <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--warning)" }} />
          <div className="text-xs" style={{ color: "var(--foreground-soft)" }}>
            <strong>Step 6 = stub.</strong> Khi admin bấm "Gửi test" hoặc cron chạy tới giờ, hệ thống chỉ log ra
            console — KHÔNG gọi Zalo API thật. Sau khi có OA business verify, điền credentials thật và swap stub
            trong <code>server/zalo.ts</code>.
          </div>
        </div>
      </div>

      <div
        className="p-5 rounded-3xl border space-y-4"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h3 className="text-sm font-extrabold uppercase tracking-wider pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          Tần suất gửi
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Frequency">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as ZaloSettings["frequency"])}
              className={inputClass()}
              style={inputStyle}
            >
              <option value="off">Tắt (off)</option>
              <option value="daily">Mỗi ngày</option>
              <option value="weekly">Mỗi tuần</option>
              <option value="biweekly">Mỗi 2 tuần</option>
              <option value="monthly">Mỗi tháng</option>
            </select>
          </Field>
          <Field label="Giờ gửi (HH:MM)">
            <input
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className={inputClass()}
              style={inputStyle}
            />
          </Field>
          <Field label="Thứ (1=T2 … 7=CN)">
            <input
              type="number"
              min={1}
              max={7}
              value={sendDow}
              onChange={(e) => setSendDow(e.target.value)}
              placeholder="Để trống nếu daily"
              className={inputClass()}
              style={inputStyle}
            />
          </Field>
        </div>

        <h3 className="text-sm font-extrabold uppercase tracking-wider pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          Zalo OA credentials
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="OA ID">
            <input
              value={oaId}
              onChange={(e) => setOaId(e.target.value)}
              placeholder="VD: 1234567890"
              className={inputClass()}
              style={inputStyle}
            />
          </Field>
          <Field label="Template ID">
            <input
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="VD: weekly_report"
              className={inputClass()}
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Access Token" hint="Lưu ở client để admin edit; backend không hiển thị token cho non-admin.">
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Bearer token từ Zalo"
            className={`${inputClass()} font-mono`}
            style={inputStyle}
          />
        </Field>
        <Field label="Template Data JSON" hint='Schema placeholders, VD: {"child_name":"", "streak":""}'>
          <textarea
            value={templateData}
            onChange={(e) => setTemplateData(e.target.value)}
            rows={3}
            className={`${inputClass()} font-mono`}
            style={inputStyle}
          />
        </Field>

        <h3 className="text-sm font-extrabold uppercase tracking-wider pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
          Nội dung report
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <ToggleCard label="Skills" checked={incSkills} onChange={setIncSkills} />
          <ToggleCard label="Streak" checked={incStreak} onChange={setIncStreak} />
          <ToggleCard label="Phút học" checked={incMinutes} onChange={setIncMinutes} />
          <ToggleCard label="Cần hỗ trợ" checked={incHelp} onChange={setIncHelp} />
        </div>
        <Field label="Custom message (optional)">
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={2}
            className={inputClass()}
            style={inputStyle}
          />
        </Field>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            {saving ? "Đang lưu..." : "💾 Lưu cấu hình"}
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setShowTest(true);
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-extrabold border"
            style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            🧪 Gửi test (stub)
          </button>
        </div>
      </div>

      {lastCron && (
        <div
          className="p-4 rounded-2xl border space-y-1"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted-strong)" }}>
            Lần cron gần nhất
          </div>
          <div className="text-xs">
            <strong>send_parent_reports</strong> · status:{" "}
            <span style={{ color: lastCron.status === "success" ? "var(--success)" : "var(--danger)" }}>
              {lastCron.status}
            </span>{" "}
            · {lastCron.rows_affected ?? 0} parents
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            {lastCron.started_at}
            {lastCron.finished_at && ` → ${lastCron.finished_at}`}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showTest && (
          <TestZaloModal settings={settings} onClose={() => setShowTest(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ToggleCard({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => {
        sound.playClick();
        onChange(!checked);
      }}
      className="p-3 rounded-2xl border text-xs font-extrabold flex items-center gap-2"
      style={{
        backgroundColor: checked ? "var(--primary-soft)" : "var(--bg-soft)",
        borderColor: checked ? "var(--primary)" : "var(--border)",
        color: checked ? "var(--primary)" : "var(--muted)",
      }}
    >
      <span
        className="w-4 h-4 rounded border-2 flex items-center justify-center text-[10px]"
        style={{
          borderColor: checked ? "var(--primary)" : "var(--muted)",
          backgroundColor: checked ? "var(--primary)" : "transparent",
          color: "var(--on-primary)",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

// ============================================================
// AUDIO section
// ============================================================

function AudioSection() {
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCron, setLastCron] = useState<CronRun | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [a, c] = await Promise.all([adminListAudio(50), adminListCronRuns(20)]);
        setRecordings(a.recordings);
        const cleanup = c.runs.find((r) => r.job_name === "cleanup_expired_audio");
        if (cleanup) setLastCron(cleanup);
      } catch (e) {
        console.warn("load audio failed:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div
        className="p-4 rounded-2xl border flex items-start gap-3"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <Mic className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
        <div className="flex-1 space-y-1">
          <div className="text-sm font-extrabold">Speak recordings (Speak UI chưa build)</div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Khi HS dùng Speak, audio được upload + transcribe, sau đó cron xóa sau 24h.
            Bảng <code>speak_recordings</code> đã sẵn sàng — chỉ chờ UI ở Step 7+.
          </p>
          {lastCron && (
            <div className="text-xs mt-2 pt-2 border-t" style={{ borderColor: "var(--border-soft)" }}>
              <strong>Cron cleanup:</strong>{" "}
              <span
                style={{
                  color: lastCron.status === "success" ? "var(--success)" : "var(--danger)",
                }}
              >
                {lastCron.status}
              </span>
              {" · "}
              {lastCron.rows_affected ?? 0} rows đã xóa lần cuối
              {lastCron.finished_at && (
                <span style={{ color: "var(--muted)" }}> · {lastCron.finished_at}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div
          className="p-8 rounded-2xl border text-center"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Đang tải...
        </div>
      ) : recordings.length === 0 ? (
        <div
          className="p-8 rounded-2xl border text-center space-y-2"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-3xl">🎙️</div>
          <p className="text-sm font-extrabold">Chưa có recording nào.</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Sẽ hiện ở đây khi Speak UI build xong (Step 7+).
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2" style={{ borderColor: "var(--border)" }}>
                <th className="text-left px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  User
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Topic
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Transcript
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Tạo
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Hết hạn
                </th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((r) => (
                <tr key={r.id} className="border-b" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-extrabold">{r.user_name || "?"}</div>
                    <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                      @{r.username}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--foreground-soft)" }}>
                    {r.topic || "—"} {r.level ? `· ${r.level}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs max-w-md">
                    <div className="truncate" style={{ color: "var(--muted)" }} title={r.transcript || ""}>
                      {r.transcript || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[10px]" style={{ color: "var(--muted)" }}>
                    {r.created_at?.slice(0, 16) || "?"}
                  </td>
                  <td className="px-3 py-2 text-[10px]" style={{ color: "var(--muted)" }}>
                    {r.expires_at?.slice(0, 16) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
