import { useState, useEffect, type ReactNode, type FormEvent } from "react";
import { motion } from "motion/react";
import { X, Check, Copy } from "lucide-react";
import sound from "../utils/sound";
import {
  AdminUser,
  CreateUserPayload,
  PatchUserPayload,
  AdminClass,
  ZaloSettings,
  adminListUsers,
  adminGetClassMembers,
  adminAddClassMember,
  adminRemoveClassMember,
  adminTestZalo,
} from "../api/client";
import { Field, inputStyle, inputClass } from "./ui/Field";
import { DAILY_GOAL_OPTIONS, DailyGoalMinutes } from "../utils/roles";

/**
 * Shared modal shell — match pattern từ ProfileModal.tsx.
 * Fixed overlay + motion.div max-w-md rounded-3xl.
 */
export function ModalShell({
  title,
  onClose,
  children,
  footer,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ backgroundColor: "var(--bg-overlay)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={`${maxWidth} w-full rounded-3xl border p-6 relative space-y-4 shadow-2xl`}
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex justify-between items-center pb-3 border-b"
          style={{ borderColor: "var(--border-soft)" }}
        >
          <span className="text-base font-extrabold">{title}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl transition-colors"
            style={{ color: "var(--muted)" }}
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3.5">{children}</div>
        {footer && (
          <div className="flex gap-2.5 pt-2 border-t" style={{ borderColor: "var(--border-soft)" }}>
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ============================================================
// CreateUserModal
// ============================================================

export function CreateUserModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (p: CreateUserPayload) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CreateUserPayload["role"]>("student");
  const [level, setLevel] = useState("Beginner");
  const [cefrLevel, setCefrLevel] = useState("A1");
  const [goal, setGoal] = useState("Tổng quát");
  const [dailyGoal, setDailyGoal] = useState<DailyGoalMinutes>(15);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password || !name) return;
    setSubmitting(true);
    try {
      const payload: CreateUserPayload = {
        username: username.trim(),
        password,
        name: name.trim(),
        role,
        daily_goal_minutes: dailyGoal,
      };
      if (role === "student") {
        payload.level = level;
        payload.cefr_level = cefrLevel;
        payload.goal = goal;
      }
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Tạo người dùng mới"
      onClose={onClose}
      maxWidth="max-w-lg"
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
            form="create-user-form"
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            {submitting ? "Đang tạo..." : "Tạo"}
          </button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass()}
              style={inputStyle}
              autoFocus
            />
          </Field>
          <Field label="Mật khẩu" hint="≥ 4 ký tự">
            <input
              required
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass()}
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Họ và tên">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass()}
            style={inputStyle}
          />
        </Field>
        <Field label="Vai trò">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CreateUserPayload["role"])}
            className={inputClass()}
            style={inputStyle}
          >
            <option value="student">🎓 Học sinh</option>
            <option value="parent">👨‍👩‍👧 Phụ huynh</option>
            <option value="teacher">👩‍🏫 Giáo viên</option>
            <option value="admin">🛡️ Quản trị viên</option>
          </select>
        </Field>
        {role === "student" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Level">
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </Field>
              <Field label="CEFR">
                <select
                  value={cefrLevel}
                  onChange={(e) => setCefrLevel(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option>A1</option>
                  <option>A2</option>
                  <option>B1</option>
                  <option>B2</option>
                  <option>C1</option>
                  <option>C2</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mục tiêu">
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option>IELTS</option>
                  <option>Giao tiếp</option>
                  <option>Học thuật</option>
                  <option>Tổng quát</option>
                </select>
              </Field>
              <Field label="Phút/ngày">
                <select
                  value={String(dailyGoal)}
                  onChange={(e) => setDailyGoal(Number(e.target.value) as DailyGoalMinutes)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  {DAILY_GOAL_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}
      </form>
    </ModalShell>
  );
}

// ============================================================
// EditUserModal — partial update, no password
// ============================================================

export function EditUserModal({
  user,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  onClose: () => void;
  onSubmit: (p: PatchUserPayload) => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [level, setLevel] = useState(user.level || "Beginner");
  const [cefrLevel, setCefrLevel] = useState(user.cefr_level || "A1");
  const [goal, setGoal] = useState(user.goal || "Tổng quát");
  const [dailyGoal, setDailyGoal] = useState<DailyGoalMinutes>(
    ((user.daily_goal_minutes) || 15)
  );
  const [submitting, setSubmitting] = useState(false);
  const isStudent = user.role === "student";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: PatchUserPayload = { name: name.trim() };
      if (isStudent) {
        payload.level = level;
        payload.cefr_level = cefrLevel;
        payload.goal = goal;
        payload.daily_goal_minutes = dailyGoal;
      }
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={`Sửa: ${user.name}`}
      onClose={onClose}
      maxWidth="max-w-lg"
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
            form="edit-user-form"
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            {submitting ? "Đang lưu..." : "Lưu"}
          </button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={handleSubmit} className="space-y-3.5">
        <Field label="Họ và tên">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass()}
            style={inputStyle}
            autoFocus
          />
        </Field>
        {isStudent && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Level">
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </Field>
              <Field label="CEFR">
                <select
                  value={cefrLevel}
                  onChange={(e) => setCefrLevel(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option>A1</option>
                  <option>A2</option>
                  <option>B1</option>
                  <option>B2</option>
                  <option>C1</option>
                  <option>C2</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mục tiêu">
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  <option>IELTS</option>
                  <option>Giao tiếp</option>
                  <option>Học thuật</option>
                  <option>Tổng quát</option>
                </select>
              </Field>
              <Field label="Phút/ngày">
                <select
                  value={String(dailyGoal)}
                  onChange={(e) => setDailyGoal(Number(e.target.value) as DailyGoalMinutes)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  {DAILY_GOAL_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          💡 Để đổi mật khẩu, dùng nút "Reset mật khẩu" ở danh sách.
        </p>
      </form>
    </ModalShell>
  );
}

// ============================================================
// ResetPasswordModal — shows temp password with copy button
// ============================================================

export function ResetPasswordModal({
  user,
  tempPassword,
  onClose,
}: {
  user: { id: string; username: string };
  tempPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      sound.playSuccess();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <ModalShell
      title="Mật khẩu tạm thời"
      onClose={onClose}
      footer={
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-extrabold"
          style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
        >
          Đã sao chép
        </button>
      }
    >
      <div
        className="p-3 rounded-xl text-xs font-extrabold"
        style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}
      >
        ⚠️ Đã reset mật khẩu cho <strong>{user.username}</strong> và đăng xuất tất cả thiết bị. Hãy gửi mật khẩu tạm này cho họ qua kênh an toàn.
      </div>
      <div
        className="p-4 rounded-2xl border flex items-center gap-2"
        style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
      >
        <code
          className="flex-1 font-mono text-base font-extrabold select-all break-all"
          style={{ color: "var(--primary)" }}
        >
          {tempPassword}
        </code>
        <button
          onClick={handleCopy}
          className="p-2 rounded-xl flex items-center gap-1 text-xs font-extrabold"
          style={{
            backgroundColor: copied ? "var(--success-soft)" : "var(--primary-soft)",
            color: copied ? "var(--success)" : "var(--primary)",
          }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Đã chép" : "Chép"}
        </button>
      </div>
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        Người dùng nên đổi mật khẩu ngay khi đăng nhập lại. Step 7+ sẽ có form đổi mật khẩu từ phía user.
      </p>
    </ModalShell>
  );
}

// ============================================================
// CreateClassModal
// ============================================================

export function CreateClassModal({
  teachers,
  onClose,
  onSubmit,
}: {
  teachers: AdminUser[];
  onClose: () => void;
  onSubmit: (p: { name: string; teacher_id: string; schedule?: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id || "");
  const [schedule, setSchedule] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !teacherId) return;
    setSubmitting(true);
    try {
      const payload: { name: string; teacher_id: string; schedule?: string; description?: string } = {
        name: name.trim(),
        teacher_id: teacherId,
      };
      if (schedule.trim()) payload.schedule = schedule.trim();
      if (description.trim()) payload.description = description.trim();
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Tạo lớp mới"
      onClose={onClose}
      maxWidth="max-w-lg"
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
            form="create-class-form"
            disabled={submitting || !teacherId}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            {submitting ? "Đang tạo..." : "Tạo"}
          </button>
        </>
      }
    >
      <form id="create-class-form" onSubmit={handleSubmit} className="space-y-3.5">
        <Field label="Tên lớp">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Lớp 7B - T3/T6"
            className={inputClass()}
            style={inputStyle}
            autoFocus
          />
        </Field>
        <Field label="Giáo viên">
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className={inputClass()}
            style={inputStyle}
          >
            <option value="">— Chọn giáo viên —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.username})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lịch học" hint="VD: T3,T6 hoặc CN">
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={inputClass()}
            style={inputStyle}
          />
        </Field>
        <Field label="Mô tả">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputClass()}
            style={inputStyle}
          />
        </Field>
      </form>
    </ModalShell>
  );
}

// ============================================================
// EditClassModal — same as Create but with default values
// ============================================================

export function EditClassModal({
  cls,
  teachers,
  onClose,
  onSubmit,
}: {
  cls: AdminClass;
  teachers: AdminUser[];
  onClose: () => void;
  onSubmit: (p: Partial<{ name: string; teacher_id: string; schedule: string | null; description: string | null }>) => Promise<void>;
}) {
  const [name, setName] = useState(cls.name);
  const [teacherId, setTeacherId] = useState(cls.teacher_id);
  const [schedule, setSchedule] = useState(cls.schedule || "");
  const [description, setDescription] = useState(cls.description || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        teacher_id: teacherId,
        schedule: schedule.trim() || null,
        description: description.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={`Sửa lớp: ${cls.name}`}
      onClose={onClose}
      maxWidth="max-w-lg"
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
            form="edit-class-form"
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            {submitting ? "Đang lưu..." : "Lưu"}
          </button>
        </>
      }
    >
      <form id="edit-class-form" onSubmit={handleSubmit} className="space-y-3.5">
        <Field label="Tên lớp">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass()}
            style={inputStyle}
            autoFocus
          />
        </Field>
        <Field label="Giáo viên">
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className={inputClass()}
            style={inputStyle}
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.username})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lịch học">
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={inputClass()}
            style={inputStyle}
          />
        </Field>
        <Field label="Mô tả">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputClass()}
            style={inputStyle}
          />
        </Field>
      </form>
    </ModalShell>
  );
}

// ============================================================
// ManageMembersModal — list + add + remove
// ============================================================

export function ManageMembersModal({
  cls,
  onClose,
  refresh,
}: {
  cls: AdminClass;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [members, setMembers] = useState<
    Array<{ id: string; name: string; username: string; level: string | null; cefr_level: string | null; joined_at: string }>
  >([]);
  const [allStudents, setAllStudents] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Load members: chỉ khi class đổi (search không liên quan)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const m = await adminGetClassMembers(cls.id);
        if (!cancelled) setMembers(m.students);
      } catch (e) {
        console.warn("Load members failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cls.id]);

  // Search students: chỉ fetch lại khi search đổi (debounced)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const u = await adminListUsers({ role: "student", search: search || undefined });
        if (!cancelled) setAllStudents(u.users);
      } catch (e) {
        console.warn("Search students failed:", e);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  const handleAdd = async (studentId: string) => {
    try {
      await adminAddClassMember(cls.id, studentId);
      sound.playSuccess();
      // Refetch members
      const m = await adminGetClassMembers(cls.id);
      setMembers(m.students);
      setPickerOpen(false);
      await refresh();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi thêm HS.");
    }
  };

  const handleRemove = async (studentId: string, studentName: string) => {
    if (!window.confirm(`Bỏ "${studentName}" khỏi lớp?`)) return;
    try {
      await adminRemoveClassMember(cls.id, studentId);
      sound.playClick();
      setMembers((prev) => prev.filter((m) => m.id !== studentId));
      await refresh();
    } catch (e: any) {
      alert(e?.error || "Lỗi khi xóa HS.");
    }
  };

  const memberIds = new Set(members.map((m) => m.id));
  const availableStudents = allStudents.filter((s) => !memberIds.has(s.id));

  return (
    <ModalShell
      title={`Thành viên: ${cls.name}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="text-center py-6" style={{ color: "var(--muted)" }}>
          Đang tải...
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--muted-strong)" }}>
              {members.length} thành viên
            </span>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="text-xs font-extrabold px-3 py-1.5 rounded-xl"
              style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
            >
              {pickerOpen ? "Đóng" : "+ Thêm HS"}
            </button>
          </div>

          {pickerOpen && (
            <div
              className="p-3 rounded-2xl border space-y-2"
              style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)" }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm HS theo tên hoặc username..."
                className={inputClass()}
                style={inputStyle}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableStudents.length === 0 ? (
                  <p className="text-xs text-center py-2" style={{ color: "var(--muted)" }}>
                    {search ? "Không tìm thấy." : "Tất cả HS đã ở trong lớp."}
                  </p>
                ) : (
                  availableStudents.slice(0, 20).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleAdd(s.id)}
                      className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:opacity-80"
                      style={{ backgroundColor: "var(--bg-elevated)" }}
                    >
                      <div>
                        <div className="text-xs font-extrabold">{s.name}</div>
                        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                          @{s.username} {s.cefr_level ? `· ${s.cefr_level}` : ""}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold" style={{ color: "var(--primary)" }}>
                        + Thêm
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {members.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: "var(--muted)" }}>
                Lớp chưa có HS nào.
              </p>
            ) : (
              members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl border"
                  style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-soft)" }}
                >
                  <div>
                    <div className="text-xs font-extrabold">{m.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                      @{m.username} {m.cefr_level ? `· ${m.cefr_level}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(m.id, m.name)}
                    className="text-[10px] font-extrabold px-2 py-1 rounded-lg"
                    style={{ color: "var(--danger)" }}
                  >
                    Bỏ
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
}

// ============================================================
// TestZaloModal
// ============================================================

export function TestZaloModal({
  settings,
  onClose,
}: {
  settings: ZaloSettings;
  onClose: () => void;
}) {
  const [recipientId, setRecipientId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    stub: true;
    messageId: string;
    recipientId: string;
    templateId: string;
    sentAt: string;
  } | null>(null);

  const handleSend = async () => {
    if (!recipientId) return;
    setSending(true);
    try {
      const res = await adminTestZalo(recipientId, {
        test: true,
        at: new Date().toISOString(),
      });
      setResult(res.result);
      sound.playSuccess();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: unknown }).error)
          : null;
      alert(msg || "Lỗi khi gửi test.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell
      title="Test gửi Zalo"
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-extrabold"
          style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted)" }}
        >
          Đóng
        </button>
      }
    >
      <Field label="Recipient ID (PH hoặc SĐT)" hint="ID nội bộ của PH, hoặc SĐT nếu dùng ZNS">
        <input
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          placeholder="VD: user-id-uuid-hoặc-09xxxxxxx"
          className={inputClass()}
          style={inputStyle}
          autoFocus
        />
      </Field>
      <button
        onClick={handleSend}
        disabled={sending || !recipientId}
        className="w-full py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
        style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
      >
        {sending ? "Đang gửi stub..." : "Gửi test (stub)"}
      </button>
      {result && (
        <div
          className="p-3 rounded-2xl border space-y-1"
          style={{ backgroundColor: "var(--success-soft)", borderColor: "var(--success)" }}
        >
          <div className="text-xs font-extrabold" style={{ color: "var(--success)" }}>
            ✓ Stub OK — Step 6 chỉ log, không gửi thật
          </div>
          <pre
            className="text-[10px] font-mono whitespace-pre-wrap break-all"
            style={{ color: "var(--foreground-soft)" }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </ModalShell>
  );
}
