/**
 * src/components/lopHomNay/ClassReviewView.tsx
 *
 * Step 13b Phase 2 — Review sau buổi học (AI-generated, Phase 5 cron).
 *
 * 3 sections:
 *   - "Điểm đã nắm" (green chips)
 *   - "Cần ôn" (red chips)
 *   - "Mẹo từ GV" (text)
 *
 * Empty state: "Chưa có review cho hôm nay."
 *
 * Phase 5 sẽ fill real data từ cron; Phase 2 hiển thị placeholder nếu payload rỗng.
 */

import { Sparkles, AlertCircle, Lightbulb } from "lucide-react";
import { ClassSessionReview } from "../../api/client";

interface Props {
  review: ClassSessionReview | null;
}

export default function ClassReviewView({ review }: Props) {
  if (!review) {
    return (
      <div
        className="p-5 rounded-2xl border text-center"
        style={{
          backgroundColor: "var(--bg-soft)",
          borderColor: "var(--border)",
          color: "var(--muted)",
        }}
      >
        <span className="text-3xl mb-2 block">🌙</span>
        <p className="text-sm font-bold">
          Chưa có review cho hôm nay.
        </p>
        <p className="text-xs mt-1 opacity-75">
          GV sẽ sinh review sau khi đóng buổi học.
        </p>
      </div>
    );
  }

  const payload = review.payload ?? {};
  const strengths = Array.isArray(payload.strengths) ? payload.strengths : [];
  const needsReview = Array.isArray(payload.needs_review) ? payload.needs_review : [];
  const tipText =
    typeof payload.tip_from_teacher_md === "string" ? payload.tip_from_teacher_md : null;
  const summaryText =
    typeof payload.summary_md === "string" ? payload.summary_md : null;

  return (
    <div className="space-y-4">
      {summaryText && (
        <div
          className="p-4 rounded-2xl border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: "var(--primary)" }} />
            <span
              className="text-xs font-extrabold uppercase tracking-wider"
              style={{ color: "var(--primary)" }}
            >
              Tóm tắt buổi học
            </span>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--foreground)" }}
          >
            {summaryText}
          </p>
        </div>
      )}

      {strengths.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: "var(--success)" }} />
            <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--success)" }}>
              Điểm đã nắm
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {strengths.map((s, i) => (
              <span
                key={i}
                className="text-xs font-bold px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: "var(--success-soft)",
                  borderColor: "var(--success)",
                  color: "var(--success)",
                }}
              >
                ✓ {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {needsReview.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4" style={{ color: "var(--danger)" }} />
            <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--danger)" }}>
              Cần ôn lại
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {needsReview.map((s, i) => (
              <span
                key={i}
                className="text-xs font-bold px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: "var(--danger-soft)",
                  borderColor: "var(--danger)",
                  color: "var(--danger)",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {tipText && (
        <div
          className="p-4 rounded-2xl border"
          style={{
            backgroundColor: "var(--accent-soft)",
            borderColor: "var(--accent)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span
              className="text-xs font-extrabold uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              Mẹo từ GV
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {tipText}
          </p>
        </div>
      )}

      <p
        className="text-[10px] font-bold text-right"
        style={{ color: "var(--muted)" }}
      >
        AI · {review.model} · {new Date(review.generated_at).toLocaleString("vi-VN")}
      </p>
    </div>
  );
}
