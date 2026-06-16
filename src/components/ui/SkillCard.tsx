/**
 * src/components/ui/SkillCard.tsx — Skill cell dùng chung
 *
 * Hiển thị 1 skill trong 5-skills panel. Có 2 size:
 *   - "md" (mặc định): full block — cho Dashboard (HS) + ParentDashboard per-child
 *   - "sm": compact, không có primary label, không delta — cho những nơi cần nhỏ gọn
 *
 * Bên trong dùng:
 *   - SKILL_META (label/emoji/color/primaryMetric) từ src/types.ts
 *   - formatSkillValue + skillProgressPct từ src/utils/format.ts
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SKILL_META, type SkillId } from "../../types";
import { formatSkillValue, skillProgressPct } from "../../utils/format";
import type { SkillState } from "../../api/client";

/**
 * SkillCardProps — chấp nhận cả 2 kiểu:
 *  - SkillState (api/client.ts — từ API server, có todayDelta/weekDelta)
 *  - ReadMetrics/WriteMetrics/... (src/types.ts — LearnerSkills union, không có extra fields)
 * Cả 2 đều có `attempts`, `trend`, và primary metric (vd `readComprehension`).
 *
 * `key` được thêm vào đây để tương thích với .map() (TS inference).
 * React tự strip prop này — không pass vào component runtime.
 */
export interface SkillCardProps {
  key?: string | number;
  skillId: SkillId;
  skill: SkillState | { attempts: number; trend: string; [metric: string]: any };
  size?: "sm" | "md";
}

function trendIcon(trend: string) {
  if (trend === "improving")
    return <TrendingUp className="w-3 h-3" style={{ color: "var(--success)" }} />;
  if (trend === "declining")
    return <TrendingDown className="w-3 h-3" style={{ color: "var(--danger)" }} />;
  if (trend === "stable")
    return <Minus className="w-3 h-3" style={{ color: "var(--muted)" }} />;
  return null;
}

function DeltaText({ skill }: { skill: SkillCardProps["skill"] }) {
  const d = (skill as any).todayDelta as number | null;
  const w = (skill as any).weekDelta as number | null;
  if (d == null) {
    return <span style={{ color: "var(--muted)" }}>Chưa có hôm qua</span>;
  }
  const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "→";
  const color =
    d > 0 ? "var(--success)" : d < 0 ? "var(--danger)" : "var(--muted)";
  const weekTooltip =
    w == null
      ? undefined
      : `Tuần: ${w > 0 ? "↑" : w < 0 ? "↓" : "→"}${Math.abs(w)}% vs tuần trước`;
  return (
    <span style={{ color }} title={weekTooltip}>
      {arrow}
      {Math.abs(d)}% vs hôm qua
    </span>
  );
}

export default function SkillCard({ skillId, skill, size = "md" }: SkillCardProps) {
  const meta = SKILL_META[skillId];
  const val = (skill as any)[meta.primaryMetric] as number;
  const isNew = skill.attempts === 0;
  const pct = skillProgressPct(skillId, val, skill.attempts);

  if (size === "sm") {
    return (
      <div
        className="p-2.5 rounded-2xl border space-y-1"
        style={{
          backgroundColor: "var(--bg-soft)",
          borderColor: isNew ? "var(--border-soft)" : meta.color,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm leading-none">{meta.emoji}</span>
          {trendIcon(skill.trend)}
        </div>
        <div
          className="text-[10px] font-extrabold uppercase tracking-wide"
          style={{ color: "var(--muted)" }}
        >
          {meta.label}
        </div>
        <div
          className="text-sm font-extrabold"
          style={{ color: isNew ? "var(--muted)" : meta.color }}
        >
          {formatSkillValue(skillId, val)}
        </div>
        <div
          className="w-full h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--bg-elevated)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: meta.color }}
          />
        </div>
      </div>
    );
  }

  // size === "md"
  return (
    <div
      className="p-3 rounded-2xl border space-y-1.5"
      style={{
        backgroundColor: "var(--bg-soft)",
        borderColor: isNew ? "var(--border-soft)" : meta.color,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-base leading-none">{meta.emoji}</span>
        {trendIcon(skill.trend)}
      </div>
      <div>
        <div
          className="text-[10px] font-extrabold uppercase tracking-wide"
          style={{ color: "var(--muted)" }}
        >
          {meta.label}
        </div>
        <div
          className="text-sm font-extrabold"
          style={{ color: isNew ? "var(--muted)" : meta.color }}
        >
          {formatSkillValue(skillId, val)}
        </div>
      </div>
      <div
        className="w-full h-1 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: meta.color }}
        />
      </div>
      <div className="text-[9px] font-bold" style={{ color: "var(--muted)" }}>
        {meta.primaryLabel} · {skill.attempts} lần
      </div>
      {!isNew && (
        <div
          className="text-[9px] font-extrabold flex items-center gap-1"
          style={{ color: "var(--muted)" }}
        >
          <DeltaText skill={skill} />
        </div>
      )}
    </div>
  );
}
