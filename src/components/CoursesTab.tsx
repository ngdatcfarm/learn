import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Clock,
  ChevronRight,
  Layers,
  BookMarked,
  Volume2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { COURSES_DATA } from "../data/coursesData";
import sound from "../utils/sound";
import { recordMeasurement, trackEvent } from "../api/client";

interface CoursesTabProps {
  onStartChat: () => void;
  onMeasured: () => Promise<void>;
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

export default function CoursesTab({ onStartChat, onMeasured }: CoursesTabProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);

  const activeCourse = COURSES_DATA.find((c) => c.id === selectedCourseId);

  const practiceCards: Record<string, { term: string; phonetic: string; explanation: string; example: string }[]> = {
    "course-1": [
      { term: "Counterargument", phonetic: "/ˈkaʊntəreɪɡjumənt/", explanation: "Luận điểm phản bác một quan điểm trước đó.", example: "To build a strong debate speech, always come up with a solid counterargument." },
      { term: "Rebuttal", phonetic: "/rɪˈbʌtl/", explanation: "Sự bác bỏ bằng chứng cứ, chứng minh đối phương sai.", example: "Her sharp rebuttal silenced the opposing panel." },
      { term: "Fallacy", phonetic: "/ˈfæləsi/", explanation: "Ngụy biện — lỗi sai lập luận mang tính hệ thống.", example: "Relying on emotions rather than logic is a common fallacy." },
    ],
    "course-2": [
      { term: "Colloquialism", phonetic: "/kəˈləʊkwiəlɪzəm/", explanation: "Từ ngữ đời thường, văn nói thân mật.", example: "'Wanna' and 'gonna' are typical colloquialisms common in teen slang." },
      { term: "Polite inquiries", phonetic: "/pəˈlaɪt ɪnˈkwaɪəriz/", explanation: "Các mẫu câu hỏi lịch sự (VD: 'Could you please…').", example: "Polite inquiries help break the ice in international universities." },
    ],
    "course-3": [
      { term: "Analyse", phonetic: "/ˈænəlaɪz/", explanation: "Phân tích chi tiết các thành phần.", example: "Students must analyse scientific diagrams during SAT passages." },
      { term: "Slight nuance", phonetic: "/slaɪt ˈnjuːɑːns/", explanation: "Sắc thái ý nghĩa khác biệt cực nhỏ.", example: "Understanding slight nuances determines high TOEFL results." },
    ],
    "course-4": [
      { term: "Cohesion", phonetic: "/kəʊˈhiːʒn/", explanation: "Tính mạch lạc giữa các câu trong đoạn văn.", example: "Use logical connectors like 'consequently' to reinforce sentence cohesion." },
      { term: "Academic tone", phonetic: "/ˌækəˈdemɪk təʊn/", explanation: "Giọng văn học thuật, khách quan, không dùng từ lóng.", example: "Keep your IELTS Writing Task 2 in a strict academic tone." },
    ],
  };

  const activeFlashcards = selectedCourseId ? practiceCards[selectedCourseId] || [] : [];

  const handleStartPractice = (courseId: string) => {
    sound.playClick();
    setSelectedCourseId(courseId);
    setCurrentCardIndex(0);
    // Note: trackEvent type hiện không có "task_start" → bỏ qua tracking ở đây
    // (lượt "next" bên dưới sẽ ghi task_done, đủ cho daily progress)
  };

  const handleNextCard = () => {
    sound.playClick();
    if (currentCardIndex < activeFlashcards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
    } else {
      setSelectedCourseId(null);
      setCurrentCardIndex(0);
    }
    // Ghi nhận: HS đã "dùng" 1 vocab (active recall — thấy + nghe + đọc example)
    void Promise.allSettled([
      recordMeasurement({ skill: "learn", metric: "vocabActiveUse", value: 1 }),
      recordMeasurement({ skill: "learn", metric: "vocabKnown", value: 1 }),
      trackEvent("task_done"),
    ])
      .then(() => onMeasured())
      .catch(() => {});
  };

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
          Tổng cộng: <span style={{ color: "var(--primary)" }} className="font-extrabold">{COURSES_DATA.length} khóa học</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* COURSE LIST */}
        <div className="md:col-span-2 space-y-4">
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
                    <h3
                      className="text-base md:text-lg font-extrabold tracking-tight cursor-pointer transition-colors hover:opacity-80"
                    >
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
                    onClick={() => handleStartPractice(course.id)}
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
        </div>

        {/* FLASHCARD SIDEBAR */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!selectedCourseId ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 rounded-3xl h-full flex flex-col items-center justify-center text-center space-y-3 border-2 border-dashed"
                style={{ borderColor: "var(--border)", minHeight: 320 }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ backgroundColor: "var(--bg-soft)" }}
                >
                  📓
                </div>
                <div>
                  <h4 className="text-sm font-extrabold">Chọn bài để bắt đầu</h4>
                  <p className="text-xs mt-1 max-w-xs" style={{ color: "var(--muted)" }}>
                    Nhấn <span className="font-bold" style={{ color: "var(--primary)" }}>"Bắt đầu học"</span> hoặc{" "}
                    <span className="font-bold" style={{ color: "var(--primary)" }}>"Học tiếp"</span> trên một khóa học để luyện flashcard từ vựng nhé!
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="p-5 rounded-3xl border space-y-4 shadow-md"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--primary)",
                }}
              >
                <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
                  <div className="flex items-center gap-1.5">
                    <BookMarked className="w-4 h-4" style={{ color: "var(--primary)" }} />
                    <span className="text-sm font-extrabold">Luyện từ vựng</span>
                  </div>
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: "var(--muted)" }}
                  >
                    Thẻ {currentCardIndex + 1}/{activeFlashcards.length}
                  </span>
                </div>

                {activeFlashcards[currentCardIndex] && (
                  <motion.div
                    key={currentCardIndex}
                    initial={{ x: 12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="space-y-4"
                  >
                    <div
                      className="p-4 rounded-2xl border space-y-3"
                      style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-base font-extrabold tracking-tight">
                          {activeFlashcards[currentCardIndex].term}
                        </span>
                        <button
                          onClick={() => sound.speakWord(activeFlashcards[currentCardIndex].term)}
                          className="p-1.5 rounded-lg border transition-colors"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderColor: "var(--border)",
                            color: "var(--primary)",
                          }}
                          title="Nghe phát âm"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div
                        className="text-[11px] font-bold"
                        style={{ color: "var(--primary)" }}
                      >
                        {activeFlashcards[currentCardIndex].phonetic}
                      </div>

                      <div
                        className="text-sm border-t pt-2"
                        style={{
                          borderColor: "var(--border-soft)",
                          color: "var(--foreground-soft)",
                        }}
                      >
                        🇻🇳 {activeFlashcards[currentCardIndex].explanation}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span
                        className="text-[10px] uppercase tracking-widest block font-bold"
                        style={{ color: "var(--muted)" }}
                      >
                        Ví dụ:
                      </span>
                      <p
                        className="text-sm italic leading-relaxed p-3 rounded-xl border"
                        style={{
                          backgroundColor: "var(--bg-soft)",
                          borderColor: "var(--border-soft)",
                          color: "var(--foreground-soft)",
                        }}
                      >
                        "{activeFlashcards[currentCardIndex].example}"
                      </p>
                    </div>

                    <button
                      onClick={handleNextCard}
                      className="w-full py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5"
                      style={{
                        backgroundColor: "var(--primary)",
                        color: "var(--on-primary)",
                      }}
                    >
                      {currentCardIndex === activeFlashcards.length - 1 ? "Hoàn thành 🎉" : "Thẻ tiếp theo"}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}

                <div
                  className="p-3 rounded-2xl border text-center"
                  style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
                >
                  <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>
                    Muốn dùng từ vựng này trong câu thật?
                  </p>
                  <button
                    onClick={onStartChat}
                    className="text-xs font-extrabold mt-2 inline-flex items-center gap-1"
                    style={{ color: "var(--primary)" }}
                  >
                    <Sparkles className="w-3 h-3" /> Chat với AI để luyện
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
