import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, HelpCircle } from 'lucide-react';
import { Question } from '../types';
import sound from '../utils/sound';
import ConfettiEffect from './ConfettiEffect';

interface QuizCardProps {
  question: Question;
  onAnswerSelected: (isCorrect: boolean) => void;
  onNextQuestion: () => void;
}

export default function QuizCard({ question, onAnswerSelected, onNextQuestion }: QuizCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerStatus, setAnswerStatus] = useState<'correct' | 'incorrect' | 'idle'>('idle');
  const [shakingOption, setShakingOption] = useState<string | null>(null);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  useEffect(() => {
    setSelectedAnswer(null);
    setAnswerStatus('idle');
    setShakingOption(null);
    setShowHint(false);
    setShowConfetti(false);
  }, [question]);

  const handleSpeakQuestion = () => {
    sound.speakWord(question.questionText);
  };

  const handleSpeakOption = (optionText: string) => {
    sound.speakWord(optionText);
  };

  const handleOptionClick = (option: string) => {
    if (answerStatus === 'correct') return;
    
    setSelectedAnswer(option);
    
    if (option === question.correctAnswer) {
      setAnswerStatus('correct');
      setShowConfetti(true);
      sound.playSuccess();
      sound.speakWord(option);
      onAnswerSelected(true);

      setTimeout(() => {
        onNextQuestion();
      }, 1500);
    } else {
      setAnswerStatus('incorrect');
      setShakingOption(option);
      sound.playIncorrect();
      onAnswerSelected(false);

      setTimeout(() => {
        setShakingOption(null);
      }, 500);
    }
  };

  return (
    <div id={`quiz-card-${question.id}`} className="relative bg-white rounded-3xl p-6 md:p-8 border-3 border-slate-900 neo-shadow-lg w-full max-w-2xl overflow-visible select-none">
      
      <ConfettiEffect active={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* Modern Badge */}
      <div className="absolute -top-4 left-6 bg-yellow-300 text-slate-900 font-black px-4 py-1.5 rounded-xl border-2 border-slate-900 neo-shadow-sm text-xs md:text-sm flex items-center gap-1.5">
        <span>Từ vựng vui nhộn:</span> ✨
      </div>

      <div className="mt-4 flex flex-col gap-6 items-center">
        
        {/* Large Illustration Showcase Card */}
        <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-sky-100 rounded-2xl border-3 border-slate-900 flex flex-col items-center justify-center p-4 overflow-hidden group">
          
          <div className="absolute inset-0 bg-[radial-gradient(#bae6fd_1.5px,transparent_1.5px)] [background-size:20px_20px] opacity-75 pointer-events-none" />
          
          <motion.div 
            className="text-8xl sm:text-9xl md:text-[9.5rem] filter relative z-10 select-none cursor-pointer"
            key={question.emoji}
            initial={{ scale: 0.8, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            whileHover={{ scale: 1.1, rotate: [0, -4, 4, -4, 0] }}
            transition={{ type: 'spring', stiffness: 180, damping: 11 }}
            onClick={handleSpeakQuestion}
          >
            {question.emoji}
          </motion.div>

          {/* Floaters */}
          <div className="absolute top-4 left-6 text-2xl opacity-40 select-none">⭐</div>
          <div className="absolute bottom-4 right-6 text-2xl opacity-40 select-none">🎈</div>

          {/* Listen Button */}
          <button
            onClick={handleSpeakQuestion}
            className="absolute bottom-3 right-3 bg-yellow-300 hover:bg-yellow-400 text-slate-900 p-2 rounded-xl border-2 border-slate-900 cursor-pointer z-15 flex items-center gap-1.5 font-bold text-xs neo-shadow-sm active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]"
            title="Nghe câu hỏi"
          >
            <Volume2 className="w-4.5 h-4.5" />
            <span>Phát Âm</span>
          </button>
        </div>

        {/* Question Header */}
        <div className="text-center space-y-2 px-1 w-full">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-slate-900 font-extrabold text-2xl md:text-3.5xl tracking-tight">
              {question.questionText}
            </h3>
            <button
              onClick={handleSpeakQuestion}
              className="text-sky-600 hover:text-sky-700 transition-colors p-1 rounded-full hover:bg-sky-150"
              title="Nghe câu hỏi"
            >
              <Volume2 className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>
          
          <div className="inline-block bg-slate-100 border-2 border-slate-900 px-4 py-1.5 rounded-xl neo-shadow-sm">
            <span className="text-slate-800 font-bold text-xs md:text-sm">
              🇻🇳 {question.translation}
            </span>
          </div>
        </div>

        {/* Modern Tactile Option Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full pt-2">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === option;
            const isCorrect = option === question.correctAnswer;
            const isOptionShaking = shakingOption === option;

            let btnBg = 'bg-white hover:bg-sky-50 border-slate-900 text-slate-900 neo-shadow';
            let labelBadge = 'bg-slate-100 text-slate-900 border-slate-900';
            let statusSuffix = null;

            if (isSelected) {
              if (isCorrect) {
                btnBg = 'bg-emerald-300 border-slate-900 text-slate-950 neo-shadow-yellow';
                labelBadge = 'bg-emerald-400 text-slate-950 border-slate-900';
                statusSuffix = '🥰 Đúng rồi! Bé siêu giỏi!';
              } else {
                btnBg = 'bg-amber-250 border-slate-900 text-slate-900';
                labelBadge = 'bg-amber-300 text-slate-900 border-slate-900';
                statusSuffix = '🤔 Thử lại nhé!';
              }
            }

            const letters = ['A', 'B', 'C'];

            return (
              <motion.button
                key={option}
                onClick={() => {
                  sound.playClick();
                  handleOptionClick(option);
                  handleSpeakOption(option);
                }}
                disabled={answerStatus === 'correct'}
                className={`group relative text-center flex flex-col items-center justify-center py-5 px-3 rounded-2xl border-3 border-b-[6px] transition-all cursor-pointer text-lg outline-none ${btnBg} ${
                  answerStatus === 'correct' && !isCorrect ? 'opacity-40' : ''
                }`}
                whileHover={answerStatus !== 'correct' ? { scale: 1.04, y: -2 } : {}}
                whileTap={answerStatus !== 'correct' ? { scale: 0.96 } : {}}
                animate={isOptionShaking ? {
                  x: [0, -8, 8, -8, 8, -4, 4, 0],
                } : {}}
                transition={{ duration: 0.4 }}
              >
                {/* Floating Option Letter Badge */}
                <span className={`absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-lg border-2 ${labelBadge}`}>
                  {letters[index]}
                </span>

                {/* Main Option Word */}
                <span className="text-xl md:text-2xl pt-2 font-black tracking-tight select-none">
                  {option}
                </span>

                <AnimatePresence>
                  {isSelected && (
                    <motion.span 
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-black mt-1 font-sans"
                    >
                      {statusSuffix}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Pronounce indicator icon */}
                <span className="absolute bottom-2 right-2 text-slate-400 opacity-20 group-hover:opacity-100 transition-opacity">
                  🔊
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Tip Deck */}
        <div className="w-full pt-1 flex flex-col items-center">
          <button
            onClick={() => {
              sound.playClick();
              setShowHint(!showHint);
            }}
            className="text-xs text-slate-500 hover:text-slate-800 font-extrabold flex items-center gap-1 hover:underline transition-all cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showHint ? 'Ẩn mẹo học từ' : 'Mở xem mẹo học tiếng Việt'}
          </button>

          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden w-full text-center mt-3"
              >
                <div className="bg-yellow-100 border-2 border-slate-900 text-slate-900 rounded-xl p-3 text-xs md:text-sm font-bold leading-relaxed neo-shadow-sm">
                  💡 Gợi ý: <span className="font-extrabold">{question.hint}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
