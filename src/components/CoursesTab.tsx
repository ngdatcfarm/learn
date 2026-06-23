/**
 * src/components/CoursesTab.tsx — Course list (Step 9g cleanup)
 *
 * Step 9g: Bỏ sidebar inline flashcards + SRS entry banner.
 *   - Vocab/SRS giờ ở PracticeTab (mode "Từ vựng")
 *   - Inline `practiceCards` bị xoá — SRS trong question_bank thay thế
 *   - Right sidebar chỉ còn 1 banner nhỏ "Chat với AI để luyện từ vựng"
 *
 * Layout: single column course list. Mỗi course card = meta (difficulty, category)
 * + title + description + progress + "Bắt đầu" / "Học tiếp" button.
 *
 * Hiện tại COURSES_DATA vẫn là hardcoded (4 courses) — sẽ chuyển sang DB ở
 * Step 10+ khi có content authoring UI cho teacher.
 */

import { ChevronRight, BookOpen, Clock, Sparkles } from "lucide-react";
import { COURSES_DATA } from "../data/coursesData";
import sound from "../utils/sound";

interface CoursesTabProps {
  onOpenAiChat: () => void;
}

const difficultyStyle: Record<string, { bg: string; fg: string; bd: string; emoji: string }> = {
  "IELTS": { bg: "var(--accent-soft)", fg: "var(--accent)", bd: "var(--accent)", emoji: "🎯" },
  "Học Thuật": { bg: "var(--warning-soft)", fg: "var(--warning)", bd: "var(--warning)", emoji: "🎓" },
  "Trường THPT": { bg: "var(--primary-soft)", fg: "var(--primary)", bd: "var(--primary)", emoji: "🏫" },
  "Đại học": { bg: "var(--success-soft)", fg: "var(--success)", bd: "var(--success)", emoji: "🎓" },
};

const categoryEmoji: Record<string, string> = {
  Communication: "💬",
  Academic: "📚",
  Grammar: "✏️",
  Vocabulary: "🔤",
};

export default function CoursesTab({ onOpenAiChat }: CoursesTabProps) {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* HEADER */}
      <div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <span className="text-2xl">📚</span>
            Khóa học của bạn
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            Chọn bài học bạn thích — mỗi bài một bước tiến nhỏ 🚀
          </p>
        </div>
        <div
          className="text-xs font-bold px-3.5 py-2 rounded-xl border shrink-0"
          style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Tổng cộng:{" "}
          <span style={{ color: "var(--primary)" }} className="font-extrabold">
            {COURSES_DATA.length} khóa học
          </span>
        </div>
      </div>

      {/* COURSE LIST (single column — sidebar đã bỏ ở Step 9g) */}
      <div className="space-y-4">
        {COURSES_DATA.map((course) => {
          const diff = difficultyStyle[course.difficulty] || difficultyStyle["Trường THPT"];
          return (
            <div
              key={course.id}
              className="rounded-2xl p-5 border flex flex-col sm:flex-row justify-between gap-5 relative overflow-hidden transition-colors"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="space-y-3.5 flex-grow">
                {/* Meta */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border tracking-wide"
                    style={{
                      backgroundColor: diff.bg,
                      color: diff.fg,
                      borderColor: diff.bd,
                    }}
                  >
                    {diff.emoji} {course.difficulty}
                  </span>
                  <span
                    className="text-[10px] font-extrabold uppercase flex items-center gap-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {categoryEmoji[course.category]} {course.category}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base md:text-lg font-extrabold tracking-tight transition-colors hover:opacity-80">
                    {course.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    {course.description}
                  </p>
                </div>

                <div
                  className="flex items-center gap-4 text-xs font-bold pt-1"
                  style={{ color: "var(--muted)" }}
                >
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" /> {course.lessonsCount} bài học
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {course.durationMinutes} phút
                  </span>
                </div>
              </div>

              {/* Progress + button */}
              <div
                className="flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end gap-4 pt-4 sm:pt-0 border-t sm:border-t-0 shrink-0 min-w-[140px]"
                style={{ borderColor: "var(--border-soft)" }}
              >
                <div className="text-right space-y-1 w-full sm:w-auto">
                  <div
                    className="text-[10px] font-extrabold uppercase"
                    style={{ color: "var(--muted)" }}
                  >
                    Tiến độ
                  </div>
                  <div className="flex items-center sm:justify-end gap-1.5">
                    <span className="text-sm font-extrabold">{course.progress}%</span>
                    <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                      ({course.completedCount}/{course.lessonsCount})
                    </span>
                  </div>
                  <div
                    className="w-28 h-1.5 rounded-full overflow-hidden hidden sm:block"
                    style={{ backgroundColor: "var(--bg-soft)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${course.progress}%`, backgroundColor: "var(--primary)" }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => sound.playClick()}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 group"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--on-primary)",
                  }}
                >
                  {course.progress > 0 ? "Học tiếp" : "Bắt đầu học"}
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}

        {/* CTA: chat với AI để luyện từ vựng */}
        <div
          className="p-4 rounded-2xl border flex items-center justify-between gap-3"
          style={{
            backgroundColor: "var(--accent-soft)",
            borderColor: "var(--accent)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦊</span>
            <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
              Muốn dùng từ vựng trong câu thật? Chat với AI nhé!
            </p>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              onOpenAiChat();
            }}
            className="text-xs font-extrabold inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border shrink-0"
            style={{
              color: "var(--accent)",
              borderColor: "var(--accent)",
              backgroundColor: "var(--bg-card)",
            }}
          >
            <Sparkles className="w-3 h-3" /> Mở chat
          </button>
        </div>
      </div>
    </div>
  );
}
