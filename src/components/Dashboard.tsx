import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Flame,
  Sparkles,
  ArrowRight,
  Volume2,
  BookOpen,
  MessageCircleHeart,
} from "lucide-react";
import { UserProfile, ReadingExercise, SkillId } from "../types";
import { READING_EXERCISES } from "../data/coursesData";
import sound from "../utils/sound";
import { recordMeasurement, trackEvent } from "../api/client";
import SkillCard from "./ui/SkillCard";

interface DashboardProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onNavigate: (tab: "dashboard" | "courses" | "lopHomNay") => void;
  /** Optional: open AI chat popup (Step 13b Phase 7). */
  onOpenAiChat?: () => void;
  onMeasured: () => Promise<void>;
}

export default function Dashboard({ profile, setProfile, onNavigate, onOpenAiChat, onMeasured }: DashboardProps) {
  const [selectedReadId, setSelectedReadId] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [readFeedbacks, setReadFeedbacks] = useState<Record<string, { isCorrect: boolean; checked: boolean }>>({});

  const activeRead = READING_EXERCISES.find((r) => r.id === selectedReadId);

  const handleSelectAnswer = (exId: string, option: string) => {
    if (readFeedbacks[exId]?.checked) return;
    sound.playClick();
    setUserAnswers((prev) => ({ ...prev, [exId]: option }));
  };

  const handleCheckAnswer = async (ex: ReadingExercise) => {
    const selected = userAnswers[ex.id];
    if (!selected) return;
    const isCorrect = selected === ex.correctAnswer;
    if (isCorrect) {
      sound.playSuccess();
      // Optimistic +stars (client-side gamification, instant feedback)
      setProfile({ ...profile, stars: profile.stars + 15 });
      // Server: ghi measurements + event song song (fire-and-forget)
      void Promise.allSettled([
        recordMeasurement({ skill: "read", metric: "readComprehension", value: 100 }),
        recordMeasurement({ skill: "read", metric: "readVocabInContext", value: 80 }),
        recordMeasurement({ skill: "learn", metric: "vocabKnown", value: ex.vocabWords.length }),
        recordMeasurement({ skill: "learn", metric: "vocabRetention", value: 100 }),
        trackEvent("task_done"),
      ])
        .then(() => onMeasured())
        .catch((e) => console.warn("Dashboard measurement failed:", e));
    } else {
      sound.playIncorrect();
      // Sai vẫn record (value=0) + track "đã thử"
      void Promise.allSettled([
        recordMeasurement({ skill: "read", metric: "readComprehension", value: 0 }),
        trackEvent("task_done"),
      ])
        .then(() => onMeasured())
        .catch(() => {});
    }
    setReadFeedbacks((prev) => ({ ...prev, [ex.id]: { isCorrect, checked: true } }));
  };

  const handleSpeakTerm = (term: string) => sound.speakWord(term);

  // Friendly greeting by time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const greetingEmoji = hour < 12 ? "🌅" : hour < 18 ? "☀️" : "🌙";

  // Daily goal: phút học HÔM NAY (tổng session_end.value từ 00:00) / mục tiêu
  const minutesToday = profile.engagement.minutesToday ?? 0;
  const goalMinutes = profile.dailyGoalMinutes;
  const dailyProgressPct = Math.min(100, Math.round((minutesToday / goalMinutes) * 100));
  const goalReached = minutesToday >= goalMinutes;

  const skillOrder: SkillId[] = ["read", "write", "listen", "speak", "learn"];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* WELCOME BANNER */}
      <div
        className="relative overflow-hidden p-6 md:p-7 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-5"
        style={{
          background:
            "linear-gradient(120deg, var(--bg-card) 0%, var(--bg-soft) 50%, var(--bg-card) 100%)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-4 relative z-10">
          <div className="floaty w-16 h-16 rounded-3xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-2xl shadow-md">
            {profile.name ? profile.name.slice(0, 1).toUpperCase() : "🦉"}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">
                {greeting}, {profile.name || "bạn"}! {greetingEmoji}
              </h1>
              <span
                className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: "var(--secondary-soft)",
                  color: "var(--secondary)",
                  borderColor: "var(--secondary)",
                }}
              >
                🔥 Đang học đấy!
              </span>
            </div>
            <p className="text-sm mt-1 font-medium" style={{ color: "var(--muted)" }}>
              Hôm nay bạn sẽ chinh phục thêm một ít tiếng Anh mới — cùng mình nhé!
            </p>
          </div>
        </div>

        {/* Streak + Stars */}
        <div className="flex flex-wrap items-center gap-3 relative z-10 w-full md:w-auto">
          <div
            className="px-3.5 py-2.5 rounded-2xl border flex items-center gap-2"
            style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            <Flame className="w-5 h-5 flicker" style={{ color: "var(--streak)", fill: "var(--streak)" }} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Streak
              </div>
              <div className="text-sm font-extrabold">{profile.engagement.streak} ngày liên tiếp</div>
            </div>
          </div>
          <div
            className="px-3.5 py-2.5 rounded-2xl border flex items-center gap-2"
            style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            <Sparkles className="w-5 h-5" style={{ color: "var(--primary)" }} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Sao của bạn
              </div>
              <div className="text-sm font-extrabold">{profile.stars} ⭐</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* DAILY GOAL */}
          <div
            className="p-5 rounded-3xl border space-y-4 shadow-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
              <div>
                <h3 className="text-base md:text-lg font-extrabold tracking-tight flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  Mục tiêu hôm nay
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {goalReached
                    ? "Bạn đã chinh phục mục tiêu hôm nay rồi — tuyệt vời!"
                    : minutesToday === 0
                      ? "Bắt đầu học để chinh phục mục tiêu nhé — mỗi phút đều có giá trị"
                      : `Còn ${Math.max(0, goalMinutes - minutesToday)} phút nữa là tới đích rồi`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-base font-extrabold" style={{ color: goalReached ? "var(--success)" : "var(--primary)" }}>
                  {minutesToday}<span style={{ color: "var(--muted)" }} className="text-xs font-bold"> / {goalMinutes} phút</span>
                </div>
                <div
                  className="text-[10px] font-extrabold uppercase tracking-wider mt-0.5"
                  style={{ color: goalReached ? "var(--success)" : "var(--muted)" }}
                >
                  {goalReached ? "🎉 Đạt mục tiêu!" : `${dailyProgressPct}% xong`}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div
              className="w-full h-3 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--bg-soft)" }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${dailyProgressPct}%` }}
                className="h-full rounded-full"
                style={{
                  background: goalReached
                    ? "linear-gradient(90deg, var(--success), var(--accent))"
                    : "linear-gradient(90deg, var(--primary), var(--accent))",
                }}
                transition={{ duration: 0.8 }}
              />
            </div>

            {/* Reading scenarios */}
            <div className="pt-2 space-y-3">
              <h4
                className="text-xs font-extrabold uppercase tracking-wider"
                style={{ color: "var(--muted-strong)" }}
              >
                📖 Bài đọc hôm nay — chọn cái bạn thích:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {READING_EXERCISES.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => {
                      sound.playClick();
                      setSelectedReadId(selectedReadId === ex.id ? null : ex.id);
                    }}
                    className="text-left p-4 rounded-2xl border text-sm transition-all"
                    style={{
                      backgroundColor:
                        selectedReadId === ex.id ? "var(--primary-soft)" : "var(--bg-soft)",
                      borderColor:
                        selectedReadId === ex.id ? "var(--primary)" : "var(--border)",
                      color: "var(--foreground)",
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold">{ex.title}</span>
                      <BookOpen className="w-4 h-4 shrink-0 ml-1.5" style={{ color: "var(--primary)" }} />
                    </div>
                    <div
                      className="flex items-center gap-1.5 text-[10px] font-bold mt-1.5"
                      style={{ color: "var(--muted)" }}
                    >
                      <span>{ex.vocabWords.length} từ mới</span>
                      <span>•</span>
                      <span style={{ color: "var(--secondary)" }}>+15 ⭐</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* READING WORKSPACE */}
          <AnimatePresence>
            {activeRead && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="p-5 rounded-3xl border space-y-5 shadow-md"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span
                      className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border tracking-wide"
                      style={{
                        backgroundColor: "var(--accent-soft)",
                        color: "var(--accent)",
                        borderColor: "var(--accent)",
                      }}
                    >
                      📖 Bài đọc
                    </span>
                    <h3 className="text-lg md:text-xl font-extrabold tracking-tight mt-2">{activeRead.title}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedReadId(null)}
                    className="text-xs font-bold transition-colors"
                    style={{ color: "var(--muted)" }}
                  >
                    Đóng ✕
                  </button>
                </div>

                {/* Paragraph */}
                <div
                  className="p-4 rounded-2xl border text-sm leading-relaxed"
                  style={{
                    backgroundColor: "var(--bg-soft)",
                    borderColor: "var(--border-soft)",
                    color: "var(--foreground-soft)",
                  }}
                >
                  {activeRead.text}
                </div>

                {/* Vocab deck */}
                <div className="space-y-2">
                  <h4
                    className="text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: "var(--muted)" }}
                  >
                    ✨ Từ mới hôm nay (chạm để nghe phát âm):
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {activeRead.vocabWords.map((v, i) => (
                      <div
                        key={i}
                        onClick={() => handleSpeakTerm(v.word)}
                        className="p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: "var(--bg-soft)",
                          borderColor: "var(--border)",
                        }}
                      >
                        <div className="min-w-0">
                          <div
                            className="text-xs font-extrabold truncate"
                            style={{ color: "var(--primary)" }}
                          >
                            {v.word}
                          </div>
                          <div
                            className="text-[11px] truncate mt-0.5"
                            style={{ color: "var(--muted)" }}
                          >
                            {v.meaning}
                          </div>
                        </div>
                        <Volume2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--muted)" }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Question */}
                <div className="pt-4 space-y-3 border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <span
                    className="text-[10px] uppercase tracking-widest block font-bold"
                    style={{ color: "var(--muted)" }}
                  >
                    🤔 Câu hỏi cho bạn:
                  </span>
                  <p className="text-sm font-extrabold">{activeRead.question}</p>

                  <div className="space-y-2 pt-2">
                    {activeRead.options.map((opt, idx) => {
                      const isSelected = userAnswers[activeRead.id] === opt;
                      const isChecked = readFeedbacks[activeRead.id]?.checked;
                      const isCorrectAnswer = opt === activeRead.correctAnswer;

                      let bg = "var(--bg-soft)";
                      let border = "var(--border)";
                      let text = "var(--foreground-soft)";

                      if (isSelected && !isChecked) {
                        bg = "var(--primary-soft)";
                        border = "var(--primary)";
                        text = "var(--primary)";
                      }
                      if (isChecked) {
                        if (isCorrectAnswer) {
                          bg = "var(--success-soft)";
                          border = "var(--success)";
                          text = "var(--success)";
                        } else if (isSelected) {
                          bg = "var(--danger-soft)";
                          border = "var(--danger)";
                          text = "var(--danger)";
                        } else {
                          bg = "var(--bg-soft)";
                          border = "var(--border-soft)";
                          text = "var(--muted)";
                        }
                      }

                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectAnswer(activeRead.id, opt)}
                          disabled={isChecked}
                          className="w-full text-left p-3 border rounded-2xl text-xs flex items-start gap-2.5 transition-colors"
                          style={{ backgroundColor: bg, borderColor: border, color: text }}
                        >
                          <span
                            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 font-extrabold text-[10px]"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              borderColor: "var(--border)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="mt-0.5 leading-snug">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Submit / feedback */}
                  <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
                    {!readFeedbacks[activeRead.id]?.checked ? (
                      <button
                        onClick={() => handleCheckAnswer(activeRead)}
                        disabled={!userAnswers[activeRead.id]}
                        className="px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 disabled:opacity-50"
                        style={{
                          backgroundColor: "var(--primary)",
                          color: "var(--on-primary)",
                        }}
                      >
                        Nộp bài <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : readFeedbacks[activeRead.id].isCorrect ? (
                      <span
                        className="font-extrabold text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-xl border pop-once"
                        style={{
                          color: "var(--success)",
                          backgroundColor: "var(--success-soft)",
                          borderColor: "var(--success)",
                        }}
                      >
                        🎉 Giỏi quá! +15 ⭐ vào túi của bạn
                      </span>
                    ) : (
                      <span
                        className="font-extrabold text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-xl border"
                        style={{
                          color: "var(--danger)",
                          backgroundColor: "var(--danger-soft)",
                          borderColor: "var(--danger)",
                        }}
                      >
                        Chưa đúng rồi — thử lại lần nữa nhé! 💪
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* AI TUTOR CARD */}
          <div
            className="p-5 rounded-3xl border space-y-4 relative overflow-hidden shadow-sm"
            style={{
              background:
                "linear-gradient(160deg, var(--bg-card) 0%, var(--accent-soft) 100%)",
              borderColor: "var(--accent)",
            }}
          >
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none"
              style={{ backgroundColor: "var(--accent)", opacity: 0.15 }}
            />

            <div className="flex items-center gap-2 relative z-10">
              <span
                className="text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--accent)",
                  borderColor: "var(--accent)",
                }}
              >
                🦊 Bạn AI của mình
              </span>
            </div>

            <div className="space-y-2 relative z-10">
              <h3 className="text-lg md:text-xl font-extrabold tracking-tight flex items-center gap-2">
                <MessageCircleHeart className="w-5 h-5" style={{ color: "var(--accent)" }} />
                Chat với AI nhé
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Luyện nói, sửa lỗi câu, học từ mới… AI bạn đồng hành sẽ giúp bạn từng bước một.
              </p>
            </div>

            {/* Online indicator */}
            <div
              className="h-7 flex items-center gap-1 px-3 py-1.5 rounded-xl border w-fit"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border)",
              }}
            >
              <span className="text-[10px] font-extrabold" style={{ color: "var(--success)" }}>
                ● ĐANG ONLINE
              </span>
              <div className="w-1 h-3 rounded-full wave-bar ml-1" style={{ backgroundColor: "var(--accent)" }} />
              <div className="w-1 h-3 rounded-full wave-bar" style={{ backgroundColor: "var(--accent)" }} />
              <div className="w-1 h-3 rounded-full wave-bar" style={{ backgroundColor: "var(--accent)" }} />
            </div>

            <button
              onClick={() => {
                sound.playClick();
                if (onOpenAiChat) {
                  onOpenAiChat();
                } else {
                  onNavigate("lopHomNay");
                }
              }}
              className="w-full py-3.5 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 relative z-10"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
              }}
            >
              Mở phòng chat <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* TIẾN BỘ CỦA MÌNH — collapsible details block (progressive disclosure) */}
      <details
        className="p-5 rounded-3xl border shadow-sm"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <summary
          className="cursor-pointer text-base font-extrabold tracking-tight flex items-center gap-2 list-none"
          style={{ color: "var(--foreground)" }}
        >
          <span>📈</span>
          Xem tiến bộ của mình
          <span
            className="ml-auto text-[10px] font-bold"
            style={{ color: "var(--muted)" }}
          >
            (chạm để mở)
          </span>
        </summary>
        <div className="space-y-3 pt-4">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            5 kỹ năng được đo mỗi khi bạn đọc, viết, nghe, nói hoặc học từ mới. Xu hướng tăng nghĩa là bạn đang tiến bộ!
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            {skillOrder.map((sid) => (
              <SkillCard key={sid} skillId={sid} skill={profile.skills[sid]} size="md" />
            ))}
          </div>
          <div
            className="pt-3 mt-2 border-t text-[10px] font-bold flex items-center gap-3 flex-wrap"
            style={{ borderColor: "var(--border-soft)", color: "var(--muted)" }}
          >
            <span>
              Tổng {Object.values(profile.skills).reduce((s, sk) => s + sk.attempts, 0)} lần đo
            </span>
            <span>•</span>
            <span>
              Cần ≥ 5 lần đo mỗi kỹ năng để số liệu đáng tin
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
