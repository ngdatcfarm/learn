import { useEffect } from 'react';
import { motion } from 'motion/react';
import { RefreshCcw, Star, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';
import sound from '../utils/sound';

interface SummaryScreenProps {
  score: number;
  totalQuestions: number;
  profile: UserProfile;
  onRestart: () => void;
  onOpenProfile: () => void;
}

export default function SummaryScreen({
  score,
  totalQuestions,
  profile,
  onRestart,
  onOpenProfile,
}: SummaryScreenProps) {
  useEffect(() => {
    sound.playVictory();
  }, []);

  const percentage = Math.round((score / totalQuestions) * 100);

  // Kids Medal categorization
  let medalIcon = '🥇';
  let medalTitle = 'Huy Chương Kim Cương';
  let medalDesc = `Bé ${profile.name} cực siêu! Hoàn hảo 100% rồi nè!`;
  let medalColor = 'bg-yellow-100 border-slate-900 text-slate-900';

  if (percentage < 100 && percentage >= 80) {
    medalIcon = '🥈';
    medalTitle = 'Huy Chương Vàng';
    medalDesc = `Tuyệt vời ông mặt trời! Bé đạt được điểm số gần như tối đa luôn nha!`;
    medalColor = 'bg-slate-100 border-slate-900 text-slate-900';
  } else if (percentage < 80 && percentage >= 50) {
    medalIcon = '🥉';
    medalTitle = 'Huy Chương Bạc';
    medalDesc = `Rất tốt luôn! Bé chỉ nhầm lẫn một chút xíu xiu thôi. Bé làm tốt lắm!`;
    medalColor = 'bg-amber-100 border-slate-900 text-slate-900';
  } else if (percentage < 50) {
    medalIcon = '🎗️';
    medalTitle = 'Huy Chương Chăm Chỉ';
    medalDesc = `Bé đã cố gắng hết mình rồi! Luyện tập tiếp để lấy huy chương to hơn nhé!`;
    medalColor = 'bg-emerald-50 border-slate-900 text-slate-900';
  }

  return (
    <motion.div
      id="summary-screen"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white rounded-3xl p-6 md:p-8 border-3 border-slate-900 neo-shadow-lg max-w-xl w-full text-center relative overflow-hidden select-none"
    >
      {/* Decorative stars shining */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="absolute text-yellow-300 opacity-20 text-2xl animate-spin"
            style={{
              top: `${15 + i * 20}%`,
              left: `${15 + i * 22}%`,
              animationDuration: `${4 + i}s`,
            }}
          >
            ⭐
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {/* Triumphant Header with bouncing badge */}
        <div className="space-y-2">
          <motion.div
            className="w-24 h-24 bg-yellow-300 rounded-2xl border-3 border-slate-900 neo-shadow-sm flex items-center justify-center text-5xl mx-auto"
            animate={{
              scale: [1, 1.15, 0.95, 1],
              rotate: [0, -8, 8, -8, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              repeatDelay: 1.5,
            }}
          >
            🏆
          </motion.div>
          <h2 className="text-slate-950 font-extrabold text-3xl md:text-3.5xl tracking-tight mt-4">
            HOÀN THÀNH BÀI TẬP!
          </h2>
          <p className="text-emerald-600 font-extrabold text-sm md:text-base">
            🎉 Hoan hô bé {profile.name}! Bé làm siêu giỏi luôn! 🎉
          </p>
        </div>

        {/* 1. Star / Points Scoreboard Card */}
        <div className="bg-sky-50 p-5 rounded-2xl border-3 border-slate-900 neo-shadow-sm">
          <span className="text-slate-500 font-extrabold text-xs block mb-1 uppercase tracking-wide">
            Kết quả của bé yêu:
          </span>
          
          {/* Circular Star display */}
          <div className="flex items-center justify-center gap-1.5 mb-2.5">
            {[...Array(totalQuestions)].map((_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.08 }}
                className={`text-2xl ${i < score ? 'opacity-100 select-none' : 'opacity-15 select-none grayscale'}`}
              >
                ⭐
              </motion.span>
            ))}
          </div>

          <div className="text-slate-905 font-black text-3xl md:text-4xl font-sans">
            {score} / {totalQuestions} <span className="text-base font-extrabold text-slate-600">Câu Đúng</span>
          </div>

          {/* Achievement Percentage Bar */}
          <div className="h-4 bg-slate-200 rounded-full mt-3 overflow-hidden border-2 border-slate-900">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-emerald-400 rounded-full"
            />
          </div>
        </div>

        {/* 2. Kids Medal Showpiece Card */}
        <div className={`p-4 rounded-2xl border-3 border-slate-900 ${medalColor} neo-shadow-sm`}>
          <div className="flex items-center gap-4 text-left">
            <span className="text-5xl select-none" role="img" aria-label="Huy chương">
              {medalIcon}
            </span>
            <div>
              <h4 className="text-slate-950 font-black text-lg md:text-xl font-sans flex items-center gap-1">
                {medalTitle} <Sparkles className="w-5 h-5 text-yellow-600 fill-yellow-400" />
              </h4>
              <p className="text-slate-600 font-bold text-xs md:text-sm mt-0.5 leading-relaxed">
                {medalDesc}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Reward Stars Addition summary */}
        <div className="bg-yellow-100 border-2 border-slate-900 px-4 py-2.5 rounded-2xl inline-block neo-shadow-sm">
          <p className="text-slate-900 text-xs md:text-sm font-black flex items-center justify-center gap-1">
            🌟 Bé được cộng <span className="text-emerald-700 font-black py-0.5 px-2 rounded-lg bg-white border border-slate-900">{score * 10} Sao</span> quả ngọt vào túi rồi nhé!
          </p>
        </div>

        {/* 4. Action triggers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              sound.playClick();
              onRestart();
            }}
            className="flex items-center justify-center gap-2 bg-yellow-300 text-slate-950 font-black py-4 rounded-xl border-2 border-b-6 border-slate-900 hover:bg-yellow-400 transition-all cursor-pointer text-lg shadow-[2px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            <RefreshCcw className="w-5 h-5 stroke-[2.5]" />
            Làm lại từ đầu
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              sound.playClick();
              onOpenProfile();
            }}
            className="flex items-center justify-center gap-2 bg-sky-200 text-slate-950 font-black py-4 rounded-xl border-2 border-b-6 border-slate-900 hover:bg-sky-305 transition-all cursor-pointer text-lg shadow-[2px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            📐 Lớp học / Hồ sơ
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
