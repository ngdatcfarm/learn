import type { ReactNode, CSSProperties } from "react";

/**
 * Field — shared form-field wrapper cho admin modals + ZaloSection.
 * 1 chỗ để chỉnh label style, hint placement, v.v.
 */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span
        className="text-[10px] font-extrabold uppercase tracking-wider"
        style={{ color: "var(--muted-strong)" }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[10px] block" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/**
 * inputStyle — dùng cho <input>/<select>/<textarea> trong admin UI.
 * Match style của LoginScreen + ProfileModal.
 */
export const inputStyle: CSSProperties = {
  backgroundColor: "var(--bg-soft)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
};

export function inputClass(extra = "") {
  return `w-full px-3 py-2 rounded-xl text-sm font-bold border outline-none focus:ring-2 focus:ring-offset-1 ${extra}`;
}
