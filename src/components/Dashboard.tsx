import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Flame, 
  Sparkles, 
  CheckCircle, 
  ArrowRight, 
  Volume2, 
  Play, 
  Clock, 
  BookOpen, 
  Check, 
  UserSquare2,
  Trophy
} from "lucide-react";
import { UserProfile, ReadingExercise } from "../types";
import { READING_EXERCISES } from "../data/coursesData";
import sound from "../utils/sound";

interface DashboardProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onNavigate: (tab: "dashboard" | "courses" | "ailab") => void;
}

export default function Dashboard({ profile, setProfile, onNavigate }: DashboardProps) {
  const [selectedReadId, setSelectedReadId] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [readFeedbacks, setReadFeedbacks] = useState<Record<string, { isCorrect: boolean; checked: boolean }>>({});

  const activeRead = READING_EXERCISES.find(r => r.id === selectedReadId);

  const handleSelectAnswer = (exId: string, option: string) => {
    if (readFeedbacks[exId]?.checked) return;
    sound.playClick();
    setUserAnswers(prev => ({ ...prev, [exId]: option }));
  };

  const handleCheckAnswer = (ex: ReadingExercise) => {
    const selected = userAnswers[ex.id];
    if (!selected) return;

    const isCorrect = selected === ex.correctAnswer;
    if (isCorrect) {
      sound.playSuccess();
      // Incremented stats
      const updatedProfile = {
        ...profile,
        stars: profile.stars + 15,
        stats: {
          ...profile.stats,
          wordsLearned: profile.stats.wordsLearned + ex.vocabWords.length,
          dailyGoalProgress: Math.min(100, profile.stats.dailyGoalProgress + 20)
        }
      };
      setProfile(updatedProfile);
    } else {
      sound.playIncorrect();
    }

    setReadFeedbacks(prev => ({
      ...prev,
      [ex.id]: { isCorrect, checked: true }
    }));
  };

  const handleSpeakTerm = (term: string) => {
    sound.speakWord(term);
  };

  return (
    <div id="student-dashboard" className="w-full max-w-5xl mx-auto space-y-6">
      
      {/* 2. Welcome Banner - Sophisticated Linear Tech Gradient */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-[#101726] to-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        {/* Futuristic circuit grid vector background */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-400 to-violet-500 flex items-center justify-center font-black text-xl text-white shadow-xl">
            {profile.name ? profile.name.slice(0, 2).toUpperCase() : "AP"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                Chào, {profile.name || "Nguyên"}!
              </h1>
              <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded">
                PRO ACTIVE
              </span>
            </div>
            <p className="text-slate-400 text-xs md:text-sm mt-0.5 font-medium">
              Hệ thống lập trình Lộ trình tự động • Level: <span className="text-teal-400 font-extrabold">{profile.level.toUpperCase()}</span>
            </p>
          </div>
        </div>

        {/* Level Stats Badges - Row */}
        <div className="flex flex-wrap items-center gap-3 relative z-10 w-full md:w-auto">
          {/* Streak */}
          <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-2.5 rounded-xl flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500 fill-amber-500 animate-pulse" />
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Chuỗi liên tiếp</div>
              <div className="text-sm font-black text-white">{profile.streak} ngày</div>
            </div>
          </div>
          {/* Stars */}
          <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-2.5 rounded-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Sao Quả Ngọt</div>
              <div className="text-sm font-black text-white">{profile.stars} ⭐</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Layout - 3 functional components */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMN 1 & 2: Lộ trình và Reading challenges */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Lộ trình hôm nay card */}
          <div className="bg-[#111625] border border-slate-800/80 p-5 rounded-3xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-white font-extrabold text-base md:text-lg tracking-tight flex items-center gap-2">
                  <Play className="w-4 h-4 text-teal-400 fill-teal-400" />
                  Mục tiêu luyện tập hôm nay
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Dành cho học sinh 14-18 tuổi chinh phục tiếng Anh nâng cao</p>
              </div>
              <span className="text-xs font-mono font-bold text-teal-400 bg-teal-400/10 px-2.5 py-1 rounded-full border border-teal-500/20">
                {profile.stats.dailyGoalProgress}% Hoàn thành
              </span>
            </div>

            {/* Custom elegant thin progress bar */}
            <div className="space-y-1">
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${profile.stats.dailyGoalProgress}%` }}
                  className="h-full bg-gradient-to-r from-teal-400 to-violet-500 rounded-full"
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>

            {/* Sub stats row */}
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Từ vựng mới</span>
                <span className="text-white font-black text-lg">{profile.stats.wordsLearned} / 25</span>
              </div>
              <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Lượt AI Chat</span>
                <span className="text-white font-black text-lg">{profile.stats.chatsCompleted} / 2</span>
              </div>
              <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Thời gian học</span>
                <span className="text-white font-black text-lg">{profile.stats.studyMinutes}m</span>
              </div>
            </div>

            {/* Interactive Section: Choose reading scenario */}
            <div className="pt-2 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">Chọn đề bài Đọc hiểu học thuật:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {READING_EXERCISES.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => {
                      sound.playClick();
                      setSelectedReadId(selectedReadId === ex.id ? null : ex.id);
                    }}
                    className={`text-left p-3.5 rounded-2xl border text-sm transition-gradient ${
                      selectedReadId === ex.id 
                        ? "bg-gradient-to-br from-teal-950/40 to-slate-900 border-teal-500/50 text-white tech-glow-teal"
                        : "bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-900/60"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold truncate">{ex.title}</span>
                      <BookOpen className="w-4 h-4 text-teal-400 shrink-0 ml-1.5" />
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold mt-1.5">
                      <span>{ex.vocabWords.length} thuật ngữ chuyên sâu</span> •
                      <span className="text-teal-400">+15 Sao</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Expanded Reading challenge Workspace */}
          <AnimatePresence>
            {activeRead && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-[#111625] border border-slate-800 p-5 rounded-3xl space-y-5"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wide">
                      ACADEMIC SCENARIO
                    </span>
                    <h3 className="text-white font-black text-lg md:text-xl tracking-tight mt-1.5">{activeRead.title}</h3>
                  </div>
                  <button 
                    onClick={() => setSelectedReadId(null)}
                    className="text-slate-500 hover:text-slate-300 transition-colors text-xs font-bold"
                  >
                    Đóng x
                  </button>
                </div>

                {/* Paragraph */}
                <div className="bg-slate-950/70 border border-slate-800/80 p-4 rounded-2xl relative line-relaxed text-sm text-slate-300 font-sans">
                  {activeRead.text}
                </div>

                {/* Core Vocabulary Deck */}
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Từ vựng trọng tâm (Click để luyện phát âm):</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {activeRead.vocabWords.map((v, i) => (
                      <div 
                        key={i}
                        onClick={() => handleSpeakTerm(v.word)}
                        className="bg-slate-950/40 hover:bg-slate-950 border border-slate-800/70 hover:border-teal-500/30 p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors group"
                      >
                        <div className="truncate">
                          <div className="text-xs font-black text-teal-400 group-hover:text-teal-300 truncate">{v.word}</div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{v.meaning}</div>
                        </div>
                        <Volume2 className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition-colors shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Question workspace */}
                <div className="border-t border-slate-800/60 pt-4 space-y-3">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Câu hỏi kiểm tra trình độ:</span>
                  <p className="text-white font-extrabold text-sm">{activeRead.question}</p>
                  
                  <div className="space-y-2 pt-2">
                    {activeRead.options.map((opt, idx) => {
                      const isSelected = userAnswers[activeRead.id] === opt;
                      const isChecked = readFeedbacks[activeRead.id]?.checked;
                      const isCorrectAnswer = opt === activeRead.correctAnswer;

                      let optColor = "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300";
                      if (isSelected) {
                        optColor = "bg-teal-500/10 border-teal-505 text-teal-300";
                      }
                      
                      // Feedback coloring
                      if (isChecked) {
                        if (isCorrectAnswer) {
                          optColor = "bg-emerald-500/10 border-emerald-500 text-emerald-400 font-extrabold";
                        } else if (isSelected) {
                          optColor = "bg-rose-500/10 border-rose-500 text-rose-400";
                        } else {
                          optColor = "bg-slate-950/20 border-slate-900 text-slate-600 cursor-not-allowed";
                        }
                      }

                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectAnswer(activeRead.id, opt)}
                          disabled={isChecked}
                          className={`w-full text-left p-3 border rounded-xl text-xs transition-gradient flex items-start gap-2.5 ${optColor}`}
                        >
                          <span className="w-5 h-5 rounded bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 font-bold font-mono text-[10px]">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="mt-0.5 leading-snug">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Submission and response feedback banner */}
                  <div className="flex items-center justify-between gap-4 pt-2">
                    {!readFeedbacks[activeRead.id]?.checked ? (
                      <button
                        onClick={() => handleCheckAnswer(activeRead)}
                        disabled={!userAnswers[activeRead.id]}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 px-5 py-2 rounded-xl text-xs font-black text-white hover:scale-102 transition-all flex items-center gap-1.5 select-none"
                      >
                        Nộp câu trả lời <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {readFeedbacks[activeRead.id].isCorrect ? (
                          <span className="text-emerald-400 font-black text-xs flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-505/20 px-3.5 py-1.5 rounded-xl">
                            <Check className="w-4 h-4 text-emerald-400" /> Đúng rồi! +15 Sao đã nạp vào túi.
                          </span>
                        ) : (
                          <span className="text-rose-400 font-black text-xs flex items-center gap-1.5 bg-rose-500/10 border border-rose-505/20 px-3.5 py-1.5 rounded-xl">
                            Chưa chính xác. Thử lại sau nhé!
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* COLUMN 3: AI Tutor Quick Access & Challenges */}
        <div className="space-y-6">
          
          {/* AI Tutor Card */}
          <div className="bg-gradient-to-b from-[#18122B] to-[#12162B] border border-violet-500/20 p-5 rounded-3xl space-y-4 tech-glow-purple relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center gap-2">
              <span className="bg-violet-500/25 text-violet-300 border border-violet-500/30 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded">
                INTELLIGENT AGENT
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="text-white font-black text-lg md:text-xl tracking-tight">AI Labs & Chat</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tương tác thoại/chat trực tiếp với AI Tutor sử dụng **Gemini 3.5**. Nhận xét lỗi viết câu, sửa tài liệu học thuật chi tiết.
              </p>
            </div>

            {/* Micro soundwave pattern indicator */}
            <div className="h-6 flex items-center gap-1 bg-slate-950/40 max-w-[120px] px-2.5 py-1.5 rounded-lg border border-slate-800">
              <span className="text-[9px] font-bold text-violet-400 mr-2">ONLINE</span>
              <div className="w-1 h-3 bg-violet-400 rounded-full wave-bar" />
              <div className="w-1 h-3 bg-violet-400 rounded-full wave-bar" />
              <div className="w-1 h-3 bg-violet-400 rounded-full wave-bar" />
            </div>

            <button
              onClick={() => {
                sound.playClick();
                onNavigate("ailab");
              }}
              className="w-full bg-violet-500 hover:bg-violet-400 text-white py-3.5 px-4 rounded-xl text-xs font-black hover:scale-102 transition-all flex items-center justify-center gap-1.5 select-none"
            >
              Phòng thoại AI Lab <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekly Goals Card */}
          <div className="bg-[#111625] border border-slate-800 p-5 rounded-3xl space-y-4">
            <h3 className="text-white font-extrabold text-base tracking-tight flex items-center gap-1.5">
              <Trophy className="w-5 h-5 text-amber-500" />
              Thử thách tuần này
            </h3>

            <div className="space-y-3.5 pt-2">
              {/* Challenge item 1 */}
              <div className="space-y-1.5">
                <div id="weekly-goal-vocab" className="flex justify-between text-xs text-slate-400">
                  <span className="font-medium">Hoàn thành 30 câu đàm thoại</span>
                  <span className="font-bold text-white">{profile.stats.chatsCompleted}/30</span>
                </div>
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                  <div className="h-full bg-teal-400 rounded-full" style={{ width: `${Math.min(100, (profile.stats.chatsCompleted / 30) * 100)}%` }} />
                </div>
              </div>

              {/* Challenge item 2 */}
              <div className="space-y-1.5">
                <div id="weekly-goal-stars" className="flex justify-between text-xs text-slate-400">
                  <span className="font-medium">Tích lũy 300 điểm Sao</span>
                  <span className="font-bold text-white">{profile.stars}/300</span>
                </div>
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, (profile.stars / 300) * 100)}%` }} />
                </div>
              </div>

              {/* Challenge item 3 */}
              <div className="space-y-1.5">
                <div id="weekly-goal-reading" className="flex justify-between text-xs text-slate-400">
                  <span className="font-medium">Giải 3 bài luận khoa học</span>
                  <span className="font-bold text-white">1/3</span>
                </div>
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: "33%" }} />
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
