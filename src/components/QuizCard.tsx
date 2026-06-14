import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, HelpCircle, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
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

  // Auto Reset state when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setAnswerStatus('idle');
    setShakingOption(null);
    setShowHint(false);
    setShowConfetti(false);
  }, [question]);

  // Read the English question aloud when card loads or when speaker is clicked
  const handleSpeakQuestion = () => {
    sound.speakWord(question.questionText);
  };

  const handleSpeakOption = (optionText: string) => {
    sound.speakWord(optionText);
  };

  const handleOptionClick = (option: string) => {
    if (answerStatus === 'correct') return; // block further clicks on success
    
    setSelectedAnswer(option);
    
    if (option === question.correctAnswer) {
      // CORRECT ANSWER! 🎉
      setAnswerStatus('correct');
      setShowConfetti(true);
      sound.playSuccess();
      sound.speakWord(option); // Pronounce correct answer
      onAnswerSelected(true);

      // Auto transition to the next question after 1.5 seconds
      setTimeout(() => {
        onNextQuestion();
      }, 1500);
    } else {
      // INCORRECT ANSWER! ❌
      setAnswerStatus('incorrect');
      setShakingOption(option);
      sound.playIncorrect();
      onAnswerSelected(false);

      // Reset shake state after it finishes vibrating
      setTimeout(() => {
        setShakingOption(null);
      }, 500);
    }
  };

  return (
    <div id={`quiz-card-${question.id}`} className="relative bg-white/95 rounded-3xl p-6 md:p-8 shadow-2xl border-4 border-amber-300 w-full max-w-2xl overflow-visible select-none">
      
      {/* Sparkles / Confetti Firework System */}
      <ConfettiEffect active={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* Decorative Cloud Badge for kids */}
      <div className="absolute -top-5 left-8 bg-sky-400 text-white font-extrabold px-5 py-2 rounded-full border-4 border-white shadow-md text-sm md:text-base flex items-center gap-1.5 animate-pulse">
        <span>Câu Hỏi Học Từ Vựng</span> ✨
      </div>

      <div className="mt-4 flex flex-col gap-6 items-center">
        
        {/* 1. Large Illustration Showcase Card (Khung ảnh minh họa lớn cho bé) */}
        <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-gradient-to-b from-sky-100 to-sky-50 rounded-2xl border-4 border-dashed border-sky-300 flex flex-col items-center justify-center p-4 overflow-hidden shadow-inner group">
          
          {/* Animated colorful radial waves behind the illustration */}
          <div className="absolute inset-0 bg-radial from-yellow-100/40 via-transparent to-transparent opacity-80 pointer-events-none group-hover:scale-110 transition-transform duration-700" />
          
          {/* Main Giant Cute Cartoon Icon Container */}
          <motion.div 
            className="text-8xl sm:text-9xl md:text-[10rem] drop-shadow-2xl filter relative z-10"
            key={question.emoji}
            initial={{ scale: 0.8, rotate: -15, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            whileHover={{ scale: 1.15, rotate: [0, -5, 5, -5, 0] }}
            transition={{ type: 'spring', stiffness: 150, damping: 10 }}
          >
            {question.emoji}
          </motion.div>

          {/* Sparkles Floating Around */}
          <div className="absolute top-4 left-6 text-3xl opacity-30 select-none animate-spin" style={{ animationDuration: '6s' }}>⭐</div>
          <div className="absolute bottom-6 right-8 text-3xl opacity-30 select-none animate-bounce" style={{ animationDuration: '4s' }}>🦄</div>
          <div className="absolute top-1/2 right-4 text-2xl opacity-20 select-none">🎈</div>
          <div className="absolute top-8 right-12 text-2xl opacity-25 select-none animate-ping">✨</div>

          {/* Spoken Word trigger in Illustration */}
          <button
            onClick={handleSpeakQuestion}
            className="absolute bottom-3 right-3 bg-amber-400 hover:bg-amber-300 text-amber-950 p-2.5 rounded-full border-2 border-white shadow-md transition-transform active:scale-95 cursor-pointer z-15 group/voice flex items-center gap-1.5"
            title="Nghe câu hỏi"
          >
            <Volume2 className="w-5 h-5 group-hover/voice:scale-110" />
            <span className="text-xs font-black mr-1 hidden sm:inline">Phát Âm</span>
          </button>
        </div>

        {/* 2. English & Vietnamese Question Header */}
        <div className="text-center space-y-2 px-1">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-amber-800 font-extrabold text-2xl md:text-3xl font-sans tracking-tight">
              {question.questionText}
            </h3>
            <button
              onClick={handleSpeakQuestion}
              className="text-sky-500 hover:text-sky-600 transition-colors p-1 rounded-full hover:bg-sky-100"
              title="Nghe câu hỏi"
            >
              <Volume2 className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>
          
          <p className="text-stone-500 font-bold text-sm md:text-base leading-relaxed bg-stone-50 py-1.5 px-4 rounded-full border border-stone-100 inline-block shadow-sm">
            🇻🇳 <span className="text-stone-600 font-sans italic">{question.translation}</span>
          </p>
        </div>

        {/* 3. Three Option Buttons (3 nút lựa chọn đáp án) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === option;
            const isCorrect = option === question.correctAnswer;
            
            // Define active styling variables
            const isOptionShaking = shakingOption === option;

            let btnBg = 'bg-white hover:bg-sky-100 border-amber-300 text-sky-800';
            let labelBadge = 'bg-sky-100 text-sky-800';
            let statusSuffix = null;

            if (isSelected) {
              if (isCorrect) {
                // Correct match! Emerald green
                btnBg = 'bg-emerald-400 border-emerald-600 text-white shadow-emerald-200';
                labelBadge = 'bg-emerald-600 text-white';
                statusSuffix = '🥰 Đúng rồi! Giỏi quá!';
              } else {
                // Wrong Match! Warm Orange/Amber (no scaring red!)
                btnBg = 'bg-orange-100 border-orange-400 text-orange-850 shadow-orange-100';
                labelBadge = 'bg-orange-350 text-white';
                statusSuffix = '🤔 Hãy thử lại nhé!';
              }
            }

            // Letter labels (A. B. C)
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
                className={`group relative text-center flex flex-col items-center justify-center py-4 px-3 rounded-2xl border-4 border-b-8 transition-all duration-150 cursor-pointer text-lg font-black font-sans shadow-md select-none outline-none ${btnBg} ${
                  answerStatus === 'correct' && !isCorrect ? 'opacity-50 grayscale-20' : ''
                }`}
                whileHover={answerStatus !== 'correct' ? { scale: 1.05, y: -2 } : {}}
                whileTap={answerStatus !== 'correct' ? { scale: 0.95 } : {}}
                animate={isOptionShaking ? {
                  x: [0, -10, 10, -10, 10, -5, 5, 0],
                } : {}}
                transition={{ duration: 0.5 }}
              >
                {/* Floating Option Letter Badge */}
                <span className={`absolute top-2 left-2 text-xs font-extrabold px-2 py-0.5 rounded-full border ${labelBadge}`}>
                  {letters[index]}
                </span>

                {/* Main Option Word */}
                <span className="text-xl md:text-2xl pt-2 font-black tracking-wide">
                  {option}
                </span>

                {/* Subtitle / Interactive Feedback status */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.span 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-bold mt-1.5 font-sans"
                    >
                      {statusSuffix}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Little volume symbol visible in options bubble */}
                <span className="absolute bottom-2 right-2 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                  🔊
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* 4. Tips / Help Desk for parents & kids */}
        <div className="w-full pt-2 flex flex-col items-center">
          <button
            onClick={() => {
              sound.playClick();
              setShowHint(!showHint);
            }}
            className="text-xs text-sky-600 hover:text-sky-700 font-extrabold flex items-center gap-1 border border-sky-100 hover:bg-sky-50 px-3 py-1.5 rounded-full transition-all cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 fill-sky-100" />
            {showHint ? 'Ẩn gợi ý thông thái' : 'Mở gợi ý từ vựng bằng tiếng Việt'}
          </button>

          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden w-full text-center mt-3"
              >
                <div className="bg-amber-100/60 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs md:text-sm font-bold leading-relaxed">
                  💡 Gợi ý cho bé: <span className="font-sans font-medium">{question.hint}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
