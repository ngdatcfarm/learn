import { type ReactNode } from "react";
import { motion } from "motion/react";

/**
 * KpiCard — dùng chung cho TeacherDashboard và AdminDashboard.
 * Hiển thị 1 số liệu + icon + label ngắn, có thể highlight border bằng màu danger.
 */
export interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  suffix?: string;
  color: string;
  highlight?: boolean;
}

export default function KpiCard({
  icon,
  label,
  value,
  suffix,
  color,
  highlight,
}: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3.5 rounded-2xl border space-y-1.5 shadow-sm"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: highlight ? color : "var(--border)",
      }}
    >
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="text-[10px] font-extrabold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-extrabold leading-none" style={{ color }}>
        {value}
        {suffix && (
          <span className="text-sm font-bold ml-0.5" style={{ color: "var(--muted)" }}>
            {suffix}
          </span>
        )}
      </div>
    </motion.div>
  );
}
