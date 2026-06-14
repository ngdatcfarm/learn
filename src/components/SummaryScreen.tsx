import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RefreshCcw, Star, Calendar, Medal, Award, Sparkles } from 'lucide-react';
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
  // Play triumphant victory sound on completing the whole quiz!
  useEffect(() => {
    sound.playVictory();
  }, []);

  const percentage = Math.round((score / totalQuestions) * 100);

  // Kids Medal categorization
  let medalIcon = '🥇';
  let medalTitle = 'Huy Chương Kim Cương';
  let medalDesc = `Bé ${profile.name} siêu cấp thông thái! Hoàn hảo 100% rồi nè!`;
  let medalColor = 'from-amber-400 to-yellow-300 border-yellow-500';

  if (percentage < 100 && percentage >= 80) {
    medalIcon = '🥈';
    medalTitle = 'Huy Chương Vàng';
    medalDesc = `Tuyệt vời ông mặt trời! Bé đạt được điểm số gần như tối đa luôn nha!`;
    medalColor = 'from-stone-300 to-stone-100 border-stone-400';
  } else if (percentage < 80 && percentage >= 50) {
    medalIcon = '🥉';
    medalTitle = 'Huy Chương Bạc';
    medalDesc = `Rất tốt luôn! Bé chỉ nhầm lẫn một chút xíu xiu thôi. Bé làm tốt lắm!`;
    medalColor = 'from-amber-600 to-amber-500 border-amber-700';
  } else if (percentage < 50) {
    medalIcon = '🎗️';
    medalTitle = 'Huy Chương Đồng Chăm Chỉ';
    medalDesc = `Bé đã cố gắng hết sức mình rồi! Học thêm một chút để lấy huy chương to hơn nhé!`;
    medalColor = 'from-emerald-300 to-teal-200 border-teal-500';
  }

  return (
    <motion.div
      id="summary-screen"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white/95 rounded-3xl p-6 md:p-8 border-6 border-b-12 border-yellow-200 shadow-2xl max-w-xl w-full text-center relative overflow-hidden select-none"
    >
      {/* Visual background decorations */}
      <div className="absolute top-2 left-6 text-2xl opacity-15 select-none animate-bounce">🎈</div>
      <div className="absolute top-1/2 right-4 text-3xl opacity-15 select-none animate-ping">✨</div>

      {/* Decorative stars shining */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute text-yellow-300 opacity-20 text-2xl animate-spin"
            style={{
              top: `${Math.random() * 80}%`,
              left: `${Math.random() * 90}%`,
              animationDuration: `${3 + i}s`,
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
            className="w-24 h-24 bg-gradient-to-tr from-yellow-300 to-amber-400 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-5xl mx-auto"
            animate={{
              scale: [1, 1.15, 0.95, 1],
              rotate: [0, -10, 10, -10, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              repeatDelay: 2,
            }}
          >
            🏆
          </motion.div>
          <h2 className="text-amber-800 font-extrabold text-3xl md:text-4xl tracking-tight">
            HOÀN THÀNH BÀI TẬP!
          </h2>
          <p className="text-emerald-600 font-sans font-black text-sm md:text-base">
            🎉 Hoan hô bé {profile.name}! Bé giỏi quá xá trời đất ơi! 🎉
          </p>
        </div>

        {/* 1. Star / Points Scoreboard Card */}
        <div className="bg-sky-50 p-5 rounded-2xl border-2 border-sky-100 shadow-inner">
          <span className="text-sky-600 font-extrabold text-xs block mb-1 uppercase tracking-wider">
            Kết quả của bé yêu:
          </span>
          
          {/* Circular Star display */}
          <div className="flex items-center justify-center gap-1.5 mb-2">
            {[...Array(totalQuestions)].map((_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className={`text-2xl ${i < score ? 'opacity-100 select-none' : 'opacity-20 select-none filter blur-[0.5px]'}`}
              >
                ⭐
              </motion.span>
            ))}
          </div>

          <div className="text-sky-950 font-black text-3xl md:text-4xl font-sans">
            {score} / {totalQuestions} <span className="text-base font-bold text-sky-700">Câu Đúng</span>
          </div>

          {/* Achievement Percentage Bar */}
          <div className="h-4 bg-sky-200/50 rounded-full mt-3 overflow-hidden border border-sky-300/30">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
            />
          </div>
        </div>

        {/* 2. Kids Medal Showpiece Card */}
        <div className={`p-5 rounded-2xl border-4 border-b-8 bg-gradient-to-b ${medalColor} shadow-md`}>
          <div className="flex items-center gap-4 text-left">
            <span className="text-5xl select-none" role="img" aria-label="Huy chương">
              {medalIcon}
            </span>
            <div>
              <h4 className="text-amber-950 font-black text-lg md:text-xl font-sans flex items-center gap-1">
                {medalTitle} <Sparkles className="w-5 h-5 text-amber-700 fill-amber-300" />
              </h4>
              <p className="text-amber-900 font-bold text-xs md:text-sm mt-0.5 leading-relaxed">
                {medalDesc}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Reward Stars Addition summary */}
        <p className="text-amber-800 text-xs md:text-sm font-semibold flex items-center justify-center gap-1 bg-yellow-100 px-4 py-2 rounded-full border border-yellow-250 inline-block">
          🌟 Bé được cộng <span className="text-amber-950 font-black underline">{score * 10} Sao</span> quả ngọt vào Kho Báu Học Tập của mình đó!
        </p>

        {/* 4. Action triggers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              sound.playClick();
              onRestart();
            }}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-400 text-amber-950 font-black py-4 rounded-xl border-b-6 border-amber-600 hover:scale-[1.03] transition-all cursor-pointer text-lg shadow-md"
          >
            <RefreshCcw className="w-5 h-5" />
            Làm lại từ đầu
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              sound.playClick();
              onOpenProfile();
            }}
            className="flex items-center justify-center gap-2 bg-sky-100 border-b-6 border-sky-450 text-sky-800 font-black py-4 rounded-xl hover:bg-sky-200 transition-all cursor-pointer text-lg shadow-sm"
          >
            📐 Sửa Hồ Sơ / Lớp
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
