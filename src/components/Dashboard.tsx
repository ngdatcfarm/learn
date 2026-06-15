import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Flame,
  Sparkles,
  ArrowRight,
  Volume2,
  Play,
  Clock,
  BookOpen,
  Check,
  Trophy,
  MessageCircleHeart,
  TrendingUp,
  Minus,
  TrendingDown,
} from "lucide-react";
import { UserProfile, ReadingExercise, SKILL_META, SkillId } from "../types";
import { READING_EXERCISES } from "../data/coursesData";
import sound from "../utils/sound";
import { recordMeasurement, trackEvent } from "../api/client";

interface DashboardProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onNavigate: (tab: "dashboard" | "courses" | "ailab") => void;
  onMeasured: () => Promise<void>;
}

export default function Dashboard({ profile, setProfile, onNavigate, onMeasured }: DashboardProps) {
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

  // Tính daily progress từ engagement.avgSessionMinutes / dailyGoalMinutes
  const dailyProgressPct = Math.min(
    100,
    Math.round((profile.engagement.avgSessionMinutes / profile.dailyGoalMinutes) * 100)
  );

  // Format giá trị primary metric cho mỗi skill (theo SKILL_META)
  const formatSkillValue = (skill: SkillId, val: number): string => {
    if (skill === "write") return val === 0 ? "—" : `${val}/10`;
    if (skill === "speak") return val === 0 ? "—" : `${val} wpm`;
    if (skill === "learn") return `${val} từ`;
    return val === 0 ? "—" : `${val}%`;
  };

  // Tính % tiến bộ cho mỗi skill (so với mức "trưởng thành" định nghĩa tạm)
  // Mục đích: hiển thị bar, không phải điểm tuyệt đối.
  const skillProgressPct: Record<SkillId, number> = {
    read: profile.skills.read.attempts === 0 ? 0 : profile.skills.read.readComprehension,
    write: profile.skills.write.attempts === 0 ? 0 : profile.skills.write.writeCoherence * 10,
    listen: profile.skills.listen.attempts === 0 ? 0 : profile.skills.listen.listenAccuracy,
    speak: profile.skills.speak.attempts === 0 ? 0 : profile.skills.speak.speakPronunciation,
    learn: profile.skills.learn.attempts === 0 ? 0 : profile.skills.learn.vocabRetention,
  };

  const skillOrder: SkillId[] = ["read", "write", "listen", "speak", "learn"];

  const trendIcon = (trend: string) => {
    if (trend === "improving") return <TrendingUp className="w-3 h-3" style={{ color: "var(--success)" }} />;
    if (trend === "declining") return <TrendingDown className="w-3 h-3" style={{ color: "var(--danger)" }} />;
    if (trend === "stable") return <Minus className="w-3 h-3" style={{ color: "var(--muted)" }} />;
    return null;
  };

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
                  Lộ trình học tập phù hợp với bạn — mỗi ngày một bước nhỏ
                </p>
              </div>
              <span
                className="text-xs font-extrabold px-3 py-1 rounded-full border"
                style={{
                  backgroundColor: "var(--primary-soft)",
                  color: "var(--primary)",
                  borderColor: "var(--primary)",
                }}
              >
                {dailyProgressPct}% xong
              </span>
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
                style={{ background: "linear-gradient(90deg, var(--primary), var(--accent))" }}
                transition={{ duration: 0.8 }}
              />
            </div>

            {/* 5 KỸ NĂNG — Learner Model */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <h4
                  className="text-xs font-extrabold uppercase tracking-wider"
                  style={{ color: "var(--muted-strong)" }}
                >
                  🧠 5 kỹ năng của mình
                </h4>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: "var(--muted)" }}
                  title="Cần ≥ 5 lần đo mới tin được"
                >
                  {Object.values(profile.skills).reduce((s, sk) => s + sk.attempts, 0)} lần đo
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {skillOrder.map((sid) => {
                  const meta = SKILL_META[sid];
                  const sk = profile.skills[sid];
                  const val = (sk as any)[meta.primaryMetric] as number;
                  const pct = skillProgressPct[sid];
                  const isNew = sk.attempts === 0;

                  return (
                    <div
                      key={sid}
                      className="p-3 rounded-2xl border space-y-1.5"
                      style={{
                        backgroundColor: "var(--bg-soft)",
                        borderColor: isNew ? "var(--border-soft)" : meta.color,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base leading-none">{meta.emoji}</span>
                        {trendIcon(sk.trend)}
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
                          {formatSkillValue(sid, val)}
                        </div>
                      </div>
                      <div
                        className="w-full h-1 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--bg-elevated)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: meta.color,
                          }}
                        />
                      </div>
                      <div
                        className="text-[9px] font-bold"
                        style={{ color: "var(--muted)" }}
                      >
                        {meta.primaryLabel} · {sk.attempts} lần
                      </div>
                    </div>
                  );
                })}
              </div>
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
                onNavigate("ailab");
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

          {/* WEEKLY CHALLENGES */}
          <div
            className="p-5 rounded-3xl border space-y-4 shadow-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <h3 className="text-base font-extrabold tracking-tight flex items-center gap-1.5">
              <Trophy className="w-5 h-5" style={{ color: "var(--secondary)" }} />
              Thử thách tuần này
            </h3>

            <div className="space-y-3.5 pt-2">
              {[
                { id: "speak", label: "Luyện Nói 30 lượt", current: profile.skills.speak.attempts, total: 30, color: "var(--primary)" },
                { id: "stars", label: "Đạt 300 ⭐", current: profile.stars, total: 300, color: "var(--accent)" },
                { id: "reading", label: "Hoàn thành 3 bài đọc", current: 1, total: 3, color: "var(--secondary)" },
              ].map((c) => {
                const pct = Math.min(100, (c.current / c.total) * 100);
                return (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
                      <span className="font-medium">{c.label}</span>
                      <span className="font-extrabold" style={{ color: "var(--foreground)" }}>
                        {c.current}/{c.total}
                      </span>
                    </div>
                    <div
                      className="w-full h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: "var(--bg-soft)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: c.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
