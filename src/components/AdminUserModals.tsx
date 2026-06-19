import { useState, useEffect, useRef, type ReactNode, type FormEvent, type ChangeEvent } from "react";
import { motion } from "motion/react";
import { X, Check, Copy, FileText, Upload } from "lucide-react";
import sound from "../utils/sound";
import {
  AdminUser,
  CreateUserPayload,
  PatchUserPayload,
  AdminClass,
  ZaloSettings,
  LinkedUser,
  ImportUserResult,
  ImportUsersError,
  adminListUsers,
  adminGetClassMembers,
  adminAddClassMember,
  adminRemoveClassMember,
  adminGetUser,
  adminAddParentLink,
  adminRemoveParentLink,
  adminTestZalo,
  adminImportUsers,
} from "../api/client";
import { Field, inputStyle, inputClass } from "./ui/Field";
import { ModalShell } from "./ui/ModalShell";
import {
  DAILY_GOAL_OPTIONS,
  CEFR_LEVELS,
  SKILL_LEVELS,
  GOAL_OPTIONS,
  RELATIONSHIP_OPTIONS,
  RELATIONSHIP_LABEL,
  DailyGoalMinutes,
  RelationshipValue,
} from "../utils/roles";
// RELATIONSHIP_LABEL dùng để hiển thị relationship (vd: "mother" → "👩 Mẹ") trong ManageMembersModal.

// Re-export ModalShell for backward compat (some files import from here)
export { ModalShell };

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
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password || !name) return;
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^\+?\d{9,15}$/.test(trimmedPhone)) {
      setPhoneError("SĐT không hợp lệ (9-15 chữ số, có thể có + ở đầu).");
      return;
    }
    setPhoneError(null);
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
      if (trimmedPhone) payload.phone = trimmedPhone;
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
        <Field label="Số điện thoại" hint="Để trống nếu chưa có. 9-15 chữ số, có thể có + ở đầu.">
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (phoneError) setPhoneError(null);
            }}
            className={inputClass()}
            style={inputStyle}
            placeholder="VD: 0912345678"
          />
          {phoneError && (
            <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
              {phoneError}
            </p>
          )}
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
                  {SKILL_LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="CEFR">
                <select
                  value={cefrLevel}
                  onChange={(e) => setCefrLevel(e.target.value)}
                  className={inputClass()}
                  style={inputStyle}
                >
                  {CEFR_LEVELS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
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
                  {GOAL_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
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
  const [tab, setTab] = useState<"info" | "relationships">("info");
  const [name, setName] = useState(user.name);
  const [level, setLevel] = useState(user.level || "Beginner");
  const [cefrLevel, setCefrLevel] = useState(user.cefr_level || "A1");
  const [goal, setGoal] = useState(user.goal || "Tổng quát");
  const [dailyGoal, setDailyGoal] = useState<DailyGoalMinutes>(
    ((user.daily_goal_minutes) || 15)
  );
  const [phone, setPhone] = useState(user.phone || "");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isStudent = user.role === "student";
  const isParent = user.role === "parent";
  const showRelationshipsTab = isStudent || isParent;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^\+?\d{9,15}$/.test(trimmedPhone)) {
      setPhoneError("SĐT không hợp lệ (9-15 chữ số, có thể có + ở đầu).");
      return;
    }
    setPhoneError(null);
    setSubmitting(true);
    try {
      const payload: PatchUserPayload = { name: name.trim() };
      if (isStudent) {
        payload.level = level;
        payload.cefr_level = cefrLevel;
        payload.goal = goal;
        payload.daily_goal_minutes = dailyGoal;
      }
      // Phone: gửi nếu user đã có SĐT trước đó (kể cả clear) HOẶC vừa nhập mới.
      // Match với pickUserFields: undefined = skip, null/"" = clear, string = set.
      if (trimmedPhone !== (user.phone || "")) {
        payload.phone = trimmedPhone || null;
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
      maxWidth={tab === "relationships" ? "max-w-2xl" : "max-w-lg"}
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
          {tab === "info" && (
            <button
              type="submit"
              form="edit-user-form"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
              style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
            >
              {submitting ? "Đang lưu..." : "Lưu"}
            </button>
          )}
        </>
      }
    >
      {showRelationshipsTab && (
        <div
          className="flex gap-1 p-1 rounded-2xl"
          style={{ backgroundColor: "var(--bg-soft)" }}
        >
          {(
            [
              { id: "info" as const, label: "Thông tin" },
              { id: "relationships" as const, label: "Quan hệ" },
            ]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  sound.playClick();
                  setTab(t.id);
                }}
                className="flex-1 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors"
                style={{
                  backgroundColor: active ? "var(--bg-card)" : "transparent",
                  color: active ? "var(--primary)" : "var(--muted)",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === "info" ? (
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
                    {SKILL_LEVELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="CEFR">
                  <select
                    value={cefrLevel}
                    onChange={(e) => setCefrLevel(e.target.value)}
                    className={inputClass()}
                    style={inputStyle}
                  >
                    {CEFR_LEVELS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
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
                    {GOAL_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
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
          <Field label="Số điện thoại" hint={isParent ? "SĐT PH nhận báo cáo Zalo. Để trống nếu chưa có." : "9-15 chữ số, có thể có + ở đầu."}>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              className={inputClass()}
              style={inputStyle}
              placeholder="VD: 0912345678"
            />
            {phoneError && (
              <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
                {phoneError}
              </p>
            )}
          </Field>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            💡 Để đổi mật khẩu, dùng nút "Reset mật khẩu" ở danh sách.
          </p>
        </form>
      ) : (
        <RelationshipsSection user={user} />
      )}
    </ModalShell>
  );
}

// ============================================================
// RelationshipsSection — sub-component cho tab "Quan hệ"
// Dùng cho cả student (list parents) và parent (list children).
// ============================================================

function RelationshipsSection({ user }: { user: AdminUser }) {
  const isStudent = user.role === "student";
  const isParent = user.role === "parent";
  const oppositeRole = isStudent ? "parent" : "student";
  const oppositeLabel = isStudent ? "phụ huynh" : "học sinh";

  const [linked, setLinked] = useState<LinkedUser[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<AdminUser[]>([]);
  // Auto-suggest theo họ (vd: HS "Nguyễn Văn A" → gợi ý PH họ "Nguyễn")
  const [suggestions, setSuggestions] = useState<AdminUser[]>([]);

  /**
   * Tách họ (first word) từ tên tiếng Việt. Nếu tên có 1 từ thì dùng cả từ đó.
   * Ví dụ: "Nguyễn Văn A" → "Nguyễn", "Trần" → "Trần".
   * Bỏ qua nếu quá ngắn (<2 char) để tránh false positives.
   */
  const surname = user.name.trim().split(/\s+/)[0] || "";
  const hasUsableSurname = surname.length >= 2;

  // Load current links
  const refetch = async () => {
    setLoadingLinks(true);
    try {
      const res = await adminGetUser(user.id);
      setLinked(isStudent ? res.parents : res.children);
    } catch (e) {
      console.warn("Load links failed:", e);
    } finally {
      setLoadingLinks(false);
    }
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Fetch candidates when picker opens OR search changes
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const u = await adminListUsers({
          role: oppositeRole,
          search: search || undefined,
          parentless: isParent,
        });
        if (!cancelled) setCandidates(u.users ?? []);
      } catch (e) {
        console.warn("Picker fetch failed:", e);
        if (!cancelled) setCandidates([]);
      }
    }, search ? 250 : 0); // immediate on open, debounced on search
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerOpen, search, oppositeRole, isParent]);

  // Auto-suggest theo họ khi picker mở + search trống. Clear khi user gõ vào ô search.
  useEffect(() => {
    if (!pickerOpen || search || !hasUsableSurname) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const u = await adminListUsers({
          role: oppositeRole,
          search: surname,
          parentless: isParent,
        });
        if (!cancelled) {
          // Loại bỏ chính user đang edit + đã linked (đã được loại ở dưới)
          const ids = new Set([user.id, ...linked.map((l) => l.id)]);
          setSuggestions((u.users ?? []).filter((c) => !ids.has(c.id)).slice(0, 5));
        }
      } catch (e) {
        console.warn("Suggest fetch failed:", e);
        if (!cancelled) setSuggestions([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerOpen, search, surname, hasUsableSurname, oppositeRole, isParent, user.id, linked]);

  const handleAdd = async (
    candidateId: string,
    relationship: RelationshipValue | ""
  ): Promise<void> => {
    try {
      const payload: { parent_id: string; student_id: string; relationship?: RelationshipValue } = isStudent
        ? { parent_id: candidateId, student_id: user.id }
        : { parent_id: user.id, student_id: candidateId };
      if (relationship) payload.relationship = relationship;
      await adminAddParentLink(payload);
      sound.playSuccess();
      setPickerOpen(false);
      setSearch("");
      await refetch();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: unknown }).error)
          : null;
      alert(msg || "Lỗi khi thêm liên kết.");
    }
  };

  const handleRemove = async (linkedUser: LinkedUser): Promise<void> => {
    if (
      !window.confirm(
        `Bỏ liên kết với "${linkedUser.name}"?`
      )
    )
      return;
    try {
      // DELETE /api/admin/parent-links/:parentId/:studentId
      // isStudent: user là studentId, linkedUser là parentId → swap
      // isParent:  user là parentId, linkedUser là studentId → như cũ
      const parentId = isStudent ? linkedUser.id : user.id;
      const studentId = isStudent ? user.id : linkedUser.id;
      await adminRemoveParentLink(parentId, studentId);
      sound.playClick();
      setLinked((prev) => prev.filter((m) => m.id !== linkedUser.id));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "error" in e
          ? String((e as { error?: unknown }).error)
          : null;
      alert(msg || "Lỗi khi bỏ liên kết.");
    }
  };

  const linkedIds = new Set(linked.map((l) => l.id));
  const availableCandidates = candidates.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-extrabold uppercase tracking-wider"
          style={{ color: "var(--muted-strong)" }}
        >
          {linked.length} liên kết
        </span>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="text-xs font-extrabold px-3 py-1.5 rounded-xl"
          style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
        >
          {pickerOpen ? "Đóng" : `+ Thêm ${oppositeLabel}`}
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
            placeholder={
              isParent
                ? candidates.length > 0
                  ? `Tìm trong ${candidates.length} học sinh chưa có phụ huynh...`
                  : "Tìm học sinh chưa có phụ huynh..."
                : `Tìm ${oppositeLabel} theo tên hoặc username...`
            }
            className={inputClass()}
            style={inputStyle}
            autoFocus
          />
          {!search && suggestions.length > 0 && (
            <div className="space-y-1.5">
              <div
                className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1"
                style={{ color: "var(--muted-strong)" }}
              >
                <span>💡</span>
                <span>Gợi ý theo họ "{surname}"</span>
              </div>
              {suggestions.map((c) => (
                <PickerCandidate key={c.id} candidate={c} onAdd={handleAdd} />
              ))}
            </div>
          )}
          <div className={!search && suggestions.length > 0 ? "pt-2 border-t" : ""} style={!search && suggestions.length > 0 ? { borderColor: "var(--border-soft)" } : undefined}>
            <div
              className="text-[10px] font-extrabold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--muted-strong)" }}
            >
              {search ? "Kết quả tìm kiếm" : "Tất cả"}
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {availableCandidates.length === 0 ? (
                <p
                  className="text-xs text-center py-3 font-bold"
                  style={{ color: "var(--muted-strong)" }}
                >
                  {search
                    ? `Không tìm thấy "${search}".`
                    : candidates.length === 0
                      ? "Đang tải danh sách..."
                      : isParent
                        ? "Không có học sinh nào chưa có phụ huynh. Tất cả học sinh đã được liên kết với PH khác, hoặc bạn có thể tạo HS mới."
                        : `Tất cả ${oppositeLabel} đã được liên kết với HS/PH này.`}
                </p>
              ) : (
                availableCandidates.slice(0, 20).map((c) => (
                  <PickerCandidate
                    key={c.id}
                    candidate={c}
                    onAdd={handleAdd}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {loadingLinks ? (
        <div className="text-center py-4" style={{ color: "var(--muted)" }}>
          Đang tải...
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {linked.length === 0 ? (
            <p
              className="text-xs text-center py-3"
              style={{ color: "var(--muted)" }}
            >
              {isStudent
                ? "HS này chưa được liên kết với PH nào."
                : "PH này chưa được liên kết với HS nào."}
            </p>
          ) : (
            linked.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl border gap-2"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-soft)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold truncate">{l.name}</div>
                  <div
                    className="text-[10px] truncate"
                    style={{ color: "var(--muted)" }}
                  >
                    @{l.username}
                    {isStudent && l.level ? ` · ${l.level}` : ""}
                    {!isStudent && l.cefr_level ? ` · ${l.cefr_level}` : ""}
                  </div>
                </div>
                {l.relationship && (
                  <span
                    className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg shrink-0"
                    style={{
                      backgroundColor: "var(--primary-soft)",
                      color: "var(--primary)",
                    }}
                  >
                    {RELATIONSHIP_LABEL[l.relationship] || l.relationship}
                  </span>
                )}
                <button
                  onClick={() => handleRemove(l)}
                  className="text-[10px] font-extrabold px-2 py-1 rounded-lg shrink-0"
                  style={{ color: "var(--danger)" }}
                >
                  Bỏ
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PickerCandidate — 1 row trong picker search (input relationship + Thêm)
// Tách riêng để có local state cho relationship input.
// ============================================================

function PickerCandidate({
  candidate,
  onAdd,
}: {
  candidate: AdminUser;
  onAdd: (id: string, relationship: RelationshipValue | "") => Promise<void>;
  key?: string | number;
}) {
  const [relationship, setRelationship] = useState<RelationshipValue | "">("");
  return (
    <div
      className="px-3 py-2 rounded-xl flex items-center gap-2"
      style={{ backgroundColor: "var(--bg-elevated)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-extrabold truncate">{candidate.name}</div>
        <div className="text-[10px] truncate" style={{ color: "var(--muted)" }}>
          @{candidate.username}
          {candidate.cefr_level ? ` · ${candidate.cefr_level}` : ""}
        </div>
      </div>
      <select
        value={relationship}
        onChange={(e) => setRelationship(e.target.value as RelationshipValue | "")}
        className={inputClass("px-2 py-1 text-[10px]")}
        style={inputStyle}
      >
        <option value="">Quan hệ…</option>
        {RELATIONSHIP_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.emoji} {r.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => onAdd(candidate.id, relationship)}
        className="text-[10px] font-extrabold px-2 py-1 rounded-lg shrink-0"
        style={{ color: "var(--primary)" }}
      >
        + Thêm
      </button>
    </div>
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

// ============================================================
// ImportUsersModal — Bulk import users từ CSV
// ============================================================

/**
 * CSV template (copy để test):
 *
 * username,name,role,password,level,cefr_level,goal,daily_goal_minutes,phone
 * nguyen2,Nguyễn Văn A,student,,Beginner,A1,Tổng quát,15,
 * ph2,Phụ huynh 2,parent,pass1234,,,,,0987654321
 * gv2,Trần Thị B,teacher,teacher1234,,,Giao tiếp,15,
 *
 * Rules:
 * - Header bắt buộc: username, name, role
 * - role: student | parent | teacher | admin
 * - password: optional — nếu trống sẽ tự sinh temp + force change
 * - level: Beginner | Intermediate | Advanced (chỉ áp dụng cho student)
 * - cefr_level: A1..C2
 * - goal: IELTS | Giao tiếp | Học thuật | Tổng quát
 * - daily_goal_minutes: 5 | 15 | 30
 * - phone: optional, 9-15 chữ số (có thể có + ở đầu)
 *
 * Atomic: nếu 1 row lỗi → báo lỗi hết, KHÔNG insert gì.
 */
const CSV_TEMPLATE = `username,name,role,password,level,cefr_level,goal,daily_goal_minutes,phone
nguyen2,Nguyễn Văn A,student,,Beginner,A1,Tổng quát,15,
ph2,Phụ huynh 2,parent,pass1234,,,,,0987654321
gv2,Trần Thị B,teacher,teacher1234,,,Giao tiếp,15,`;

export function ImportUsersModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<ImportUsersError[] | null>(null);
  const [created, setCreated] = useState<ImportUserResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; created: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setErrors(null);
    setCreated(null);
    setSummary(null);
  };

  const handleUseTemplate = () => {
    setCsv(CSV_TEMPLATE);
    setErrors(null);
    setCreated(null);
    setSummary(null);
  };

  const handleSubmit = async () => {
    if (!csv.trim()) {
      setErrors([{ row: 0, username: "", error: "Chưa có nội dung CSV." }]);
      return;
    }
    setSubmitting(true);
    setErrors(null);
    setCreated(null);
    setSummary(null);
    sound.playClick();
    try {
      const res = await adminImportUsers(csv);
      setCreated(res.created);
      setSummary(res.summary);
      sound.playSuccess();
    } catch (e: any) {
      sound.playIncorrect();
      if (e?.errors && Array.isArray(e.errors)) {
        setErrors(e.errors);
      } else {
        setErrors([{ row: 0, username: "", error: e?.error || "Import thất bại." }]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyAll = () => {
    if (!created) return;
    const lines = ["username\tname\trole\tpassword"];
    for (const c of created) {
      lines.push(`${c.username}\t${c.name}\t${c.role}\t${c.tempPassword}`);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    sound.playSuccess();
  };

  const handleDone = () => {
    if (created && created.length > 0) {
      onSuccess();
    }
    onClose();
  };

  return (
    <ModalShell
      title="📥 Import users từ CSV"
      onClose={handleDone}
      maxWidth="max-w-2xl"
    >
      {/* Toolbar: file upload + template */}
      <div className="flex gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border"
          style={{
            backgroundColor: "var(--bg-soft)",
            color: "var(--muted)",
            borderColor: "var(--border)",
          }}
        >
          <Upload className="w-3.5 h-3.5" /> Chọn file .csv
        </button>
        <button
          type="button"
          onClick={handleUseTemplate}
          className="px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border"
          style={{
            backgroundColor: "var(--bg-soft)",
            color: "var(--muted)",
            borderColor: "var(--border)",
          }}
        >
          <FileText className="w-3.5 h-3.5" /> Dùng template mẫu
        </button>
      </div>

      {/* CSV input */}
      <Field label="Nội dung CSV" hint="Dòng 1 là header. Mỗi dòng sau là 1 user.">
        <textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setErrors(null);
            setCreated(null);
            setSummary(null);
          }}
          placeholder="username,name,role,password,level,cefr_level,goal,daily_goal_minutes,phone&#10;..."
          rows={8}
          className={`${inputClass()} font-mono text-[11px]`}
          style={{ ...inputStyle, resize: "vertical" }}
          disabled={submitting || created !== null}
        />
      </Field>

      {/* Errors */}
      {errors && errors.length > 0 && (
        <div
          className="p-3 rounded-2xl border space-y-2"
          style={{
            backgroundColor: "var(--danger-soft)",
            borderColor: "var(--danger)",
          }}
        >
          <div
            className="text-xs font-extrabold flex items-center gap-1.5"
            style={{ color: "var(--danger)" }}
          >
            ✗ {errors.length} lỗi — sửa rồi thử lại
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {errors.map((e, i) => (
              <div
                key={i}
                className="text-[11px] font-mono px-2 py-1 rounded bg-white/40"
                style={{ color: "var(--danger)" }}
              >
                {e.row > 0 ? `Dòng ${e.row}` : "—"}{" "}
                {e.username && <strong>@{e.username}</strong>} {e.username && "— "}
                {e.error}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success summary */}
      {created && summary && (
        <div
          className="p-3 rounded-2xl border space-y-2"
          style={{
            backgroundColor: "var(--success-soft)",
            borderColor: "var(--success)",
          }}
        >
          <div
            className="text-xs font-extrabold flex items-center justify-between"
            style={{ color: "var(--success)" }}
          >
            <span>✓ Tạo {summary.created}/{summary.total} users thành công</span>
            <button
              type="button"
              onClick={handleCopyAll}
              className="px-2 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 border"
              style={{
                backgroundColor: "var(--bg-card)",
                color: "var(--success)",
                borderColor: "var(--success)",
              }}
            >
              <Copy className="w-3 h-3" /> Copy tất cả
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr
                  className="border-b-2 text-left"
                  style={{ borderColor: "var(--success)" }}
                >
                  <th className="px-2 py-1">Username</th>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Password</th>
                </tr>
              </thead>
              <tbody>
                {created.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    <td className="px-2 py-1 font-extrabold">@{c.username}</td>
                    <td className="px-2 py-1 truncate max-w-[140px]">{c.name}</td>
                    <td className="px-2 py-1">{c.role}</td>
                    <td className="px-2 py-1">
                      <code
                        className="px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "var(--bg-card)" }}
                      >
                        {c.tempPassword}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            className="text-[10px] leading-relaxed"
            style={{ color: "var(--muted)" }}
          >
            ⚠️ Copy password ngay — chỉ hiển thị 1 lần. User tự đổi pass khi đăng nhập
            lần đầu.
          </p>
        </div>
      )}

      {/* Footer */}
      {created ? (
        <button
          type="button"
          onClick={handleDone}
          className="w-full py-2.5 rounded-xl text-sm font-extrabold"
          style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
        >
          Xong
        </button>
      ) : (
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--bg-soft)", color: "var(--muted)" }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !csv.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-60"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            {submitting ? "Đang xử lý..." : "Import"}
          </button>
        </div>
      )}
    </ModalShell>
  );
}
