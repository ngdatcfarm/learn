import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Trophy, BookOpen, User, Star, Flame, Settings } from 'lucide-react';
import { UserProfile, Question } from './types';
import { QUESTIONS_DATA } from './data/questions';
import sound from './utils/sound';

// Import components
import Header from './components/Header';
import WormProgressBar from './components/WormProgressBar';
import QuizCard from './components/QuizCard';
import SummaryScreen from './components/SummaryScreen';
import AuthModal from './components/AuthModal';

const DEFAULT_PROFILE: UserProfile = {
  name: 'Bé Sóc',
  avatar: '🐿️',
  grade: 'Lớp 1',
  level: 'Dễ',
  stars: 30, // Default gift stars
  isLoggedIn: true,
};

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [isQuizComplete, setIsQuizComplete] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>(QUESTIONS_DATA);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('kids_quiz_profile');
      if (savedProfile) {
        setProfile(JSON.parse(savedProfile));
      }
      
      const savedSoundState = localStorage.getItem('kids_quiz_sound_enabled');
      if (savedSoundState !== null) {
        const enabled = savedSoundState === 'true';
        setSoundEnabled(enabled);
        sound.enabled = enabled;
      }
    } catch (e) {
      console.error('Failed to load storage state:', e);
    }
  }, []);

  // Filter questions or adjust options depending on selected Level
  useEffect(() => {
    let questionsList = [...QUESTIONS_DATA];
    
    // In "Dễ" or "Vừa", we can keep the default 12 rich items.
    // In "Khó", let's shuffle them or tweak configurations or keep all items!
    // To keep the quiz diverse and rich, we can select different subsets
    // or modify standard arrays so it fits level selection perfectly.
    if (profile.level === 'Dễ') {
      // Show first 6 easy familiar vocabulary words
      setFilteredQuestions(questionsList.slice(0, 6));
    } else if (profile.level === 'Vừa') {
      // Show middle subset
      setFilteredQuestions(questionsList.slice(0, 9));
    } else {
      // Hard: Show all vocabulary words
      setFilteredQuestions(questionsList);
    }
    
    // Always reset index when level changes to avoid out-of-bounds
    setCurrentQuestionIndex(0);
    setScore(0);
    setIsQuizComplete(false);
  }, [profile.level]);

  // Save profile to storage whenever it changes
  const saveProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem('kids_quiz_profile', JSON.stringify(newProfile));
    } catch (e) {
      console.error('Failed to save profile:', e);
    }
  };

  const handleToggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    sound.enabled = nextState;
    try {
      localStorage.setItem('kids_quiz_sound_enabled', String(nextState));
    } catch (e) {
      console.warn(e);
    }
  };

  // Click on answers
  const handleAnswerSelected = (isCorrect: boolean) => {
    if (isCorrect) {
      setScore((prev) => prev + 1);
      
      // Award stars immediately in profile!
      const updatedProfile = {
        ...profile,
        stars: profile.stars + 10,
      };
      saveProfile(updatedProfile);
    }
  };

  // Next question navigation
  const handleNextQuestion = () => {
    if (currentQuestionIndex < filteredQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setIsQuizComplete(true);
    }
  };

  // Restart quiz
  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setScore(0);
    setIsQuizComplete(false);
  };

  // Save partial profile keys from Modal
  const handleSaveProfileDetails = (updatedFields: Partial<UserProfile>) => {
    const mergedProfile = {
      ...profile,
      ...updatedFields,
    };
    saveProfile(mergedProfile);
  };

  const handleLogout = () => {
    const freshProfile: UserProfile = {
      name: 'Bé Sóc',
      avatar: '🐿️',
      grade: 'Lớp 1',
      level: 'Dễ',
      stars: 0,
      isLoggedIn: false,
    };
    saveProfile(freshProfile);
    setIsQuizComplete(false);
    setCurrentQuestionIndex(0);
    setScore(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-200 via-sky-100 to-amber-50 relative flex flex-col justify-between overflow-x-hidden antialiased">
      
      {/* 1. Whimsical Sky floating clouds (Mây lơ lửng cho bé) */}
      <div className="absolute top-12 left-[10%] opacity-20 text-6xl select-none animate-bubble">☁️</div>
      <div className="absolute top-24 right-[15%] opacity-25 text-8xl select-none animate-bubble" style={{ animationDelay: '1.5s' }}>☁️</div>
      <div className="absolute top-1/3 left-[75%] opacity-15 text-7xl select-none animate-bubble" style={{ animationDelay: '3s' }}>☁️</div>
      <div className="absolute top-1/2 left-[5%] opacity-20 text-8xl select-none animate-bubble" style={{ animationDelay: '0.8s' }}>🎈</div>

      {/* Sun rays glowing in the top corner */}
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-yellow-300/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main app block */}
      <main id="kids-quiz-root" className="flex-grow w-full max-w-4xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-6 relative z-10 justify-center">
        
        {/* Interactive Playful Top Header */}
        <Header
          profile={profile}
          onLoginClick={() => setIsProfileModalOpen(true)}
          onLogoutClick={handleLogout}
          onToggleSound={handleToggleSound}
          soundEnabled={soundEnabled}
        />

        {/* Central interactive body */}
        <div className="flex flex-col items-center gap-6 w-full">
          {!isQuizComplete ? (
            <>
              {/* Caterpillar progress branch progress-bar */}
              <WormProgressBar 
                current={currentQuestionIndex} 
                total={filteredQuestions.length} 
              />

              {/* Animate Card state transitions */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQuestionIndex + '-' + profile.level}
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -50, opacity: 0 }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="w-full flex justify-center"
                >
                  <QuizCard
                    question={filteredQuestions[currentQuestionIndex]}
                    onAnswerSelected={handleAnswerSelected}
                    onNextQuestion={handleNextQuestion}
                  />
                </motion.div>
              </AnimatePresence>
            </>
          ) : (
            /* Summary Trophies block */
            <SummaryScreen
              score={score}
              totalQuestions={filteredQuestions.length}
              profile={profile}
              onRestart={handleRestartQuiz}
              onOpenProfile={() => setIsProfileModalOpen(true)}
            />
          )}
        </div>

      </main>

      {/* 2. Interactive smiling flowers grassland at bottom (Cỏ xanh và hoa cười) */}
      <footer className="relative w-full overflow-hidden select-none pointer-events-none h-16 md:h-24 flex items-end">
        {/* Grass Backdrop Layer 1 */}
        <div className="absolute bottom-0 w-full h-8 md:h-12 bg-emerald-400 border-t-4 border-emerald-500" />
        {/* Grass Backdrop Layer 2 */}
        <div className="absolute bottom-0 w-full h-6 bg-emerald-500" />

        {/* Cute animated flowers */}
        <div className="absolute bottom-4 left-[8%] flex items-center gap-1">
          <span className="text-3xl animate-bounce" style={{ animationDuration: '3.2s' }}>🌻</span>
          <span className="text-xl animate-bounce" style={{ animationDuration: '2.5s' }}>🌱</span>
        </div>
        <div className="absolute bottom-4 left-[30%] flex items-center gap-1">
          <span className="text-2xl animate-pulse">🌷</span>
          <span className="text-sm">🦗</span>
        </div>
        <div className="absolute bottom-3 right-[12%] flex items-center gap-1">
          <span className="text-xl animate-bounce" style={{ animationDuration: '4.1s' }}>🌱</span>
          <span className="text-3xl animate-bounce" style={{ animationDuration: '2.8s' }}>🌼</span>
        </div>
        <div className="absolute bottom-4 right-[40%] flex items-center gap-1">
          <span className="text-3xl animate-bounce" style={{ animationDuration: '3s' }}>🌻</span>
        </div>
      </footer>

      {/* 3. Authentication profile modal settings */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <AuthModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onSave={handleSaveProfileDetails}
            currentProfile={profile}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
