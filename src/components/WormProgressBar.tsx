import { motion } from 'motion/react';

interface WormProgressBarProps {
  current: number; // 0-indexed current question
  total: number;   // total number of questions
}

export default function WormProgressBar({ current, total }: WormProgressBarProps) {
  const percentage = total > 1 ? (current / (total - 1)) * 100 : 0;

  // Let's render a brown tree branch with leaves. The caterpillar crawls along this branch!
  return (
    <div id="progress-branch-container" className="relative w-full max-w-2xl px-4 py-8 bg-yellow-50/50 rounded-2xl border-4 border-dashed border-amber-200">
      {/* Label status */}
      <div className="flex justify-between items-center mb-3 px-1 text-amber-800 font-bold text-sm md:text-base font-sans select-none">
        <span className="flex items-center gap-1.5 bg-amber-100 px-3 py-1 rounded-full border-2 border-amber-200">
          🐛 <span className="hidden sm:inline">Con sâu bò được:</span> Lớp {current + 1} / {total}
        </span>
        <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border-2 border-emerald-200 flex items-center gap-1">
          🌳 Đích đến xanh tươi
        </span>
      </div>

      {/* The Branch (Thanh tiến trình hình cành cây) */}
      <div className="relative h-6 bg-amber-800/20 rounded-full border-y border-amber-950/20 shadow-inner">
        {/* Fill branch (Cành cây thật mọc dài dần) */}
        <div 
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-amber-700 to-amber-600 transition-all duration-500 shadow-md"
          style={{ width: `${Math.max(percentage, 4)}%` }}
        />

        {/* Small green leaves sprouting out of the branch */}
        {[15, 45, 75, 95].map((pos, idx) => (
          <div 
            key={idx} 
            className="absolute -top-3 w-5 h-5 transition-transform hover:scale-125"
            style={{ left: `${pos}%` }}
          >
            <span className="text-xl select-none" style={{ transform: idx % 2 === 0 ? 'rotate(-20deg)' : 'rotate(20deg)' }}>🍃</span>
          </div>
        ))}

        {/* Apple Tree/Apple Destination badge at the end of the branch */}
        <div className="absolute -right-2 -top-5 w-10 h-10 flex items-center justify-center bg-emerald-400 rounded-full border-4 border-amber-100 shadow-lg text-xl hover:scale-110 duration-200 animate-pulse">
          🍎
        </div>

        {/* Start Stump */}
        <div className="absolute -left-2 -top-1 w-4 h-8 bg-amber-900 rounded-lg shadow-md border border-amber-950" />

        {/* Caterpillar container (Con sâu chuyển động) */}
        <motion.div
          id="worm-caterpillar"
          className="absolute -top-7 -ml-6 flex flex-col items-center pointer-events-none z-10"
          animate={{
            left: `${percentage}%`,
          }}
          transition={{
            type: 'spring',
            stiffness: 70,
            damping: 12,
          }}
        >
          {/* Smiling Speech Bubble for the Worm */}
          <motion.div 
            className="bg-white text-xs font-bold text-amber-700 px-2 py-0.5 rounded-md border border-amber-200 shadow-sm mb-1 whitespace-nowrap"
            animate={{
              y: [0, -2, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            Tiến lên bé ơi! 🚀
          </motion.div>

          {/* Sâu béo đáng yêu vẽ bằng SVG bé bé xinh xinh */}
          <motion.div
            className="flex items-center justify-center"
            animate={{
              scaleX: [1, 1.25, 0.9, 1],
              scaleY: [1, 0.85, 1.1, 1],
              x: [0, -1, 1, 0]
            }}
            transition={{
              duration: 2.22,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            {/* The Caterpillar Body */}
            <svg width="48" height="28" viewBox="0 0 48 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Tail segment */}
              <circle cx="10" cy="18" r="6" fill="#86EFAC" stroke="#166534" strokeWidth="1.5" />
              <circle cx="8" cy="16" r="2" fill="#4ADE80" />
              
              {/* Middle segment 1 */}
              <circle cx="18" cy="15" r="7" fill="#4ADE80" stroke="#166534" strokeWidth="1.5" />
              <circle cx="16" cy="13" r="2" fill="#22C55E" />

              {/* Middle segment 2 */}
              <circle cx="27" cy="16" r="7.5" fill="#22C55E" stroke="#15803D" strokeWidth="1.5" />
              <circle cx="25" cy="13" r="2.5" fill="#16A34A" />

              {/* Head segment (biggest) */}
              <circle cx="38" cy="13" r="9" fill="#16A34A" stroke="#14532D" strokeWidth="1.5" />
              
              {/* Cute Cheek Blush */}
              <circle cx="34" cy="14" r="2" fill="#F87171" />
              
              {/* Eye (white and black dot) */}
              <circle cx="41" cy="10" r="2.5" fill="white" />
              <circle cx="42" cy="10" r="1.2" fill="black" />
              
              {/* Antennae */}
              <path d="M38 4 Q42 1 43 2" stroke="#14532D" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="43" cy="2" r="1.5" fill="#EF4444" />
              
              {/* Cute little foot dots */}
              <circle cx="11" cy="24" r="1.5" fill="#14532D" />
              <circle cx="18" cy="22" r="1.5" fill="#14532D" />
              <circle cx="27" cy="23" r="1.5" fill="#14532D" />
              <circle cx="37" cy="22" r="1.5" fill="#14532D" />
            </svg>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
