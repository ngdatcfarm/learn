import { motion } from 'motion/react';

interface WormProgressBarProps {
  current: number; // 0-indexed current question
  total: number;   // total number of questions
}

export default function WormProgressBar({ current, total }: WormProgressBarProps) {
  const percentage = total > 1 ? (current / (total - 1)) * 100 : 0;

  return (
    <div id="progress-branch-container" className="relative w-full max-w-2xl px-5 py-6 bg-amber-50 rounded-3xl border-3 border-slate-900 neo-shadow-sm overflow-visible">
      {/* Label status */}
      <div className="flex justify-between items-center mb-3.5 px-1 text-slate-800 font-extrabold text-sm md:text-base font-sans select-none">
        <span className="flex items-center gap-1.5 bg-yellow-300 border-2 border-slate-900 px-3 py-1.5 rounded-xl neo-shadow-sm">
          🐛 <span className="hidden sm:inline">Tiến độ của bé:</span> {current + 1} / {total}
        </span>
        <span className="bg-sky-200 text-slate-900 px-3 py-1.5 rounded-xl border-2 border-slate-900 neo-shadow-sm flex items-center gap-1">
          🍎 Đích quả ngọt
        </span>
      </div>

      {/* The Branch (Thanh tiến trình hình cành cây) */}
      <div className="relative h-7 bg-slate-200 rounded-2xl border-3 border-slate-900 shadow-inner">
        {/* Fill branch progress */}
        <div 
          className="absolute left-0 top-0 h-full rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
          style={{ width: `${Math.max(percentage, 4)}%` }}
        />

        {/* Small green leaves sprouting out of the branch */}
        {[15, 45, 75, 95].map((pos, idx) => (
          <div 
            key={idx} 
            className="absolute -top-3.5 w-6 h-6 transition-transform hover:scale-130 z-5"
            style={{ left: `${pos}%` }}
          >
            <span className="text-2xl select-none block" style={{ transform: idx % 2 === 0 ? 'rotate(-15deg)' : 'rotate(15deg)' }}>🍃</span>
          </div>
        ))}

        {/* Apple Tree/Apple Destination badge at the end of the branch */}
        <div className="absolute -right-2.5 -top-4 w-11 h-11 flex items-center justify-center bg-rose-200 rounded-2xl border-3 border-slate-900 text-2xl hover:scale-110 duration-200 animate-pulse z-10 neo-shadow-sm">
          🍎
        </div>

        {/* Caterpillar container (Con sâu chuyển động) */}
        <motion.div
          id="worm-caterpillar"
          className="absolute -top-11 -ml-6 flex flex-col items-center pointer-events-none z-10"
          animate={{
            left: `${percentage}%`,
          }}
          transition={{
            type: 'spring',
            stiffness: 90,
            damping: 14,
          }}
        >
          {/* Smiling Speech Bubble for the Worm */}
          <motion.div 
            className="bg-white text-[10px] font-black text-slate-900 px-2 py-1 rounded-lg border-2 border-slate-900 neo-shadow-sm mb-1 whitespace-nowrap"
            animate={{
              y: [0, -3, 0],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            Tiến lên nè! 🚀
          </motion.div>

          {/* Sâu béo đáng yêu vẽ bằng SVG bé bé xinh xinh */}
          <motion.div
            className="flex items-center justify-center bg-white rounded-full p-0.5 border border-slate-900"
            animate={{
              scaleX: [1, 1.2, 0.9, 1],
              scaleY: [1, 0.85, 1.15, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            {/* The Caterpillar Body */}
            <svg width="40" height="24" viewBox="0 0 48 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="18" r="6" fill="#86EFAC" stroke="#0F172A" strokeWidth="2" />
              <circle cx="18" cy="15" r="7" fill="#4ADE80" stroke="#0F172A" strokeWidth="2" />
              <circle cx="27" cy="16" r="7.5" fill="#22C55E" stroke="#0F172A" strokeWidth="2" />
              <circle cx="38" cy="13" r="9" fill="#16A34A" stroke="#0F172A" strokeWidth="2" />
              <circle cx="34" cy="14" r="2" fill="#F87171" />
              <circle cx="41" cy="10" r="2.5" fill="white" />
              <circle cx="42" cy="10" r="1.2" fill="black" />
              <path d="M38 4 Q42 1 43 2" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
              <circle cx="43" cy="2" r="1.5" fill="#EF4444" />
            </svg>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
