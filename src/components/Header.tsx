import { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Volume2, VolumeX, LogIn, LogOut, User, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';
import sound from '../utils/sound';

interface HeaderProps {
  profile: UserProfile;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onToggleSound: () => void;
  soundEnabled: boolean;
}

export default function Header({
  profile,
  onLoginClick,
  onLogoutClick,
  onToggleSound,
  soundEnabled,
}: HeaderProps) {
  // Little bounce states for interactions
  const [starBouncing, setStarBouncing] = useState(false);

  const handleStarHover = () => {
    setStarBouncing(true);
    setTimeout(() => setStarBouncing(false), 800);
  };

  const handleSoundBtn = () => {
    onToggleSound();
    sound.playClick();
  };

  return (
    <header id="quiz-header" className="w-full bg-white/90 backdrop-blur-md rounded-2xl p-4 md:p-5 shadow-lg border-b-4 border-amber-300 flex flex-col sm:flex-row gap-4 justify-between items-center relative overflow-hidden">
      {/* Cartoon Background Highlights */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 via-yellow-400 to-emerald-400" />
      
      {/* Brand & Character Avatar */}
      <div className="flex items-center gap-3 select-none">
        <motion.div 
          className="w-12 h-12 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-2xl shadow-md cursor-pointer"
          whileHover={{ scale: 1.1, rotate: [0, -10, 10, 0] }}
          onClick={() => {
            sound.playClick();
            onLoginClick();
          }}
        >
          {profile.isLoggedIn ? profile.avatar : '👦'}
        </motion.div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-amber-800 font-extrabold text-lg md:text-xl font-sans tracking-tight">
              {profile.isLoggedIn ? `Chúc bé ${profile.name} học giỏi!` : 'Hi bé yêu! 👋'}
            </h1>
            {profile.isLoggedIn && (
              <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full border border-amber-200">
                {profile.grade}
              </span>
            )}
          </div>
          <p className="text-sky-600 font-bold text-xs md:text-sm">
            Học tiếng Anh thật dễ dàng • Cấp Độc: <span className="underline decoration-wavy decoration-emerald-400">{profile.level}</span>
          </p>
        </div>
      </div>

      {/* Interactive Score Stars & Settings */}
      <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
        {/* Star counter with animations */}
        <motion.div
          id="star-counter"
          className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 font-black text-lg md:text-xl px-4 py-2 rounded-full border-b-4 border-amber-500 shadow-md cursor-help overflow-hidden relative"
          onMouseEnter={handleStarHover}
          onClick={handleStarHover}
          animate={starBouncing ? { scale: [1, 1.25, 0.95, 1], rotate: [0, 8, -8, 0] } : {}}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          >
            <Star className="w-6 h-6 fill-amber-100 stroke-yellow-700 stroke-2" />
          </motion.div>
          <span>{profile.stars} <span className="font-sans font-bold text-sm text-yellow-900">Sao</span></span>
          
          <span className="absolute -right-1 top-0 opacity-20 text-xl font-mono">⭐</span>
        </motion.div>

        {/* Buttons drawer */}
        <div className="flex items-center gap-2">
          {/* Sounds toggler */}
          <button
            onClick={handleSoundBtn}
            className={`p-2.5 rounded-full border-b-4 shadow-md transition-all active:translate-y-1 ${
              soundEnabled
                ? 'bg-emerald-100 border-emerald-500 text-emerald-700 hover:bg-emerald-200'
                : 'bg-stone-100 border-stone-400 text-stone-500 hover:bg-stone-200'
            }`}
            title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Login/Logout Trigger */}
          {profile.isLoggedIn ? (
            <button
              onClick={() => {
                sound.playClick();
                onLogoutClick();
              }}
              className="flex items-center gap-1.5 bg-rose-100 border-b-4 border-rose-400 hover:bg-rose-200 text-rose-700 font-bold px-4 py-2.5 rounded-full shadow-md active:translate-y-1 transition-all text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Thoát</span>
            </button>
          ) : (
            <button
              onClick={() => {
                sound.playClick();
                onLoginClick();
              }}
              className="flex items-center gap-1.5 bg-sky-100 border-b-4 border-sky-400 hover:bg-sky-200 text-sky-700 font-bold px-4 py-2.5 rounded-full shadow-md active:translate-y-1 transition-all text-sm animate-bounce"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
