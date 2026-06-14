import { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Volume2, VolumeX, LogIn, LogOut, Sparkles } from 'lucide-react';
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
  const [starBouncing, setStarBouncing] = useState(false);

  const handleStarHover = () => {
    setStarBouncing(true);
    setTimeout(() => setStarBouncing(false), 600);
  };

  const handleSoundBtn = () => {
    onToggleSound();
    sound.playClick();
  };

  return (
    <header id="quiz-header" className="w-full bg-white rounded-3xl p-5 border-3 border-slate-900 neo-shadow-lg flex flex-col sm:flex-row gap-4 justify-between items-center relative overflow-hidden">
      {/* Visual decorative accents */}
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-sky-400 via-yellow-400 to-emerald-400" />
      
      {/* Brand & Character Avatar */}
      <div className="flex items-center gap-4 select-none w-full sm:w-auto">
        <motion.div 
          className="w-14 h-14 rounded-2xl bg-amber-300 border-3 border-slate-900 flex items-center justify-center text-3xl neo-shadow-sm cursor-pointer shrink-0"
          whileHover={{ scale: 1.08, rotate: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            sound.playClick();
            onLoginClick();
          }}
        >
          {profile.isLoggedIn ? profile.avatar : '👦'}
        </motion.div>
        <div className="flex-grow">
          <div className="flex items-wrap items-center gap-2">
            <h1 className="text-slate-900 font-extrabold text-xl md:text-2xl font-sans tracking-tight">
              {profile.isLoggedIn ? `${profile.name}` : 'Hi bé yêu! 👋'}
            </h1>
            {profile.isLoggedIn && (
              <span className="text-xs bg-yellow-300 text-slate-900 font-extrabold px-2.5 py-1 rounded-lg border-2 border-slate-900 neo-shadow-sm">
                📚 {profile.grade}
              </span>
            )}
          </div>
          <p className="text-slate-500 font-bold text-xs md:text-sm mt-0.5 flex items-center gap-1">
            <span>Tiếng Anh Vui Nhộn</span> • 
            <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded border border-sky-300 font-extrabold text-[10px]">
              CẤP ĐỘ: {profile.level.toUpperCase()}
            </span>
          </p>
        </div>
      </div>

      {/* Interactive Score Stars & Settings */}
      <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end shrink-0">
        {/* Star counter with modern premium button design */}
        <motion.div
          id="star-counter"
          className="flex items-center gap-2 bg-yellow-300 text-slate-900 font-black text-base md:text-lg px-4 py-2.5 rounded-2xl border-3 border-slate-900 neo-shadow cursor-pointer select-none"
          onMouseEnter={handleStarHover}
          onClick={handleStarHover}
          animate={starBouncing ? { scale: [1, 1.15, 0.95, 1], rotate: [0, 8, -8, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            className="shrink-0"
          >
            <Star className="w-5.5 h-5.5 fill-amber-500 stroke-slate-900 stroke-[2.5]" />
          </motion.div>
          <span className="font-extrabold tracking-tight">
            {profile.stars} <span className="font-medium text-xs text-slate-700 hidden sm:inline">Sao</span>
          </span>
        </motion.div>

        {/* Buttons Drawer */}
        <div className="flex items-center gap-2">
          {/* Sounds toggler */}
          <button
            onClick={handleSoundBtn}
            className={`p-3 rounded-xl border-3 border-slate-900 neo-shadow-sm transition-all active:translate-y-0.5 active:translate-x-0.5 active:shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] ${
              soundEnabled
                ? 'bg-emerald-300 text-slate-900 hover:bg-emerald-205'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
            title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 stroke-[2.5]" /> : <VolumeX className="w-5 h-5 stroke-[2.5]" />}
          </button>

          {/* Login/Logout Trigger */}
          {profile.isLoggedIn ? (
            <button
              onClick={() => {
                sound.playClick();
                onLogoutClick();
              }}
              className="flex items-center gap-1.5 bg-rose-300 border-3 border-slate-900 hover:bg-rose-400 text-slate-900 font-black px-4 py-2.5 rounded-xl neo-shadow-sm active:translate-y-0.5 active:translate-x-0.5 active:shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] transition-all text-sm cursor-pointer"
            >
              <LogOut className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Thoát</span>
            </button>
          ) : (
            <button
              onClick={() => {
                sound.playClick();
                onLoginClick();
              }}
              className="flex items-center gap-1.5 bg-sky-305 border-3 border-slate-900 hover:bg-sky-400 text-slate-900 font-black px-4 py-2.5 rounded-xl neo-shadow-sm active:translate-y-0.5 active:translate-x-0.5 active:shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] transition-all text-sm cursor-pointer"
            >
              <LogIn className="w-4 h-4 stroke-[2.5]" />
              <span>Bắt đầu</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
