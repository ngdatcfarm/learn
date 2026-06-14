import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Trophy } from 'lucide-react';
import { UserProfile } from '../types';
import sound from '../utils/sound';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: Partial<UserProfile>) => void;
  currentProfile: UserProfile;
}

const AVATARS = [
  { emoji: '🐻', label: 'Gấu Ú' },
  { emoji: '🐯', label: 'Cọp Con' },
  { emoji: '🦖', label: 'Khủng Long' },
  { emoji: '🐰', label: 'Thỏ Bông' },
  { emoji: '🦊', label: 'Cáo Đỏ' },
  { emoji: '🐼', label: 'Gấu Trúc' },
  { emoji: '🐱', label: 'Mèo Lười' },
  { emoji: '🦄', label: 'Kỳ Lân' },
  { emoji: '🦁', label: 'Sư Tử' },
  { emoji: '🐸', label: 'Ếch Xanh' },
];

const GRADES = ['Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5'];
const LEVELS: ('Dễ' | 'Vừa' | 'Khó')[] = ['Dễ', 'Vừa', 'Khó'];

export default function AuthModal({ isOpen, onClose, onSave, currentProfile }: AuthModalProps) {
  const [name, setName] = useState(currentProfile.name || 'Bé Sóc');
  const [selectedAvatar, setSelectedAvatar] = useState(currentProfile.avatar || '🐻');
  const [selectedGrade, setSelectedGrade] = useState(currentProfile.grade || 'Lớp 1');
  const [selectedLevel, setSelectedLevel] = useState(currentProfile.level || 'Dễ');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sound.playSuccess();
    onSave({
      name: name.trim() || 'Bé Sóc',
      avatar: selectedAvatar,
      grade: selectedGrade,
      level: selectedLevel,
      isLoggedIn: true,
    });
    onClose();
  };

  const handleAvatarSelect = (emoji: string) => {
    setSelectedAvatar(emoji);
    sound.speakWord(emoji); // Fun spoken cue for children
    sound.playClick();
  };

  return (
    <div className="fixed inset-0 bg-sky-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.9, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 30, opacity: 0 }}
        className="bg-sky-50 rounded-3xl border-8 border-yellow-200 shadow-2xl w-full max-w-xl p-6 md:p-8 relative overflow-hidden my-auto"
      >
        {/* Cute Clouds Background decorations */}
        <div className="absolute top-2 -left-12 opacity-10 select-none text-9xl text-sky-400">☁️</div>
        <div className="absolute bottom-2 -right-12 opacity-10 select-none text-9xl text-sky-400">☁️</div>

        {/* Close button with cartoon shake */}
        <button
          onClick={() => {
            sound.playClick();
            onClose();
          }}
          className="absolute right-4 top-4 bg-amber-400 border-2 border-amber-500 hover:bg-amber-300 transition-all text-amber-950 rounded-full p-2"
        >
          <X className="w-5 h-5 stroke-[3]" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <span className="text-4xl animate-bounce inline-block select-none mb-1">⭐️</span>
          <h2 className="text-amber-800 font-extrabold text-2xl md:text-3xl font-sans flex items-center justify-center gap-1">
            Hồ Sơ Độc Học Cho Bé <Sparkles className="w-6 h-6 text-yellow-500 fill-yellow-500" />
          </h2>
          <p className="text-sky-600 text-sm font-semibold mt-1">
            Đặt tên, chọn lớp học và nhân vật bé yêu thích để nhận quà tinh nghịch nhé!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          {/* 1. Name input */}
          <div>
            <label className="block text-amber-900 font-extrabold text-base md:text-lg mb-2">
              👦 Tên của bé là gì thế?
            </label>
            <input
              type="text"
              value={name}
              maxLength={15}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="w-full bg-white border-4 border-sky-200 focus:border-sky-400 rounded-2xl px-4 py-3 text-sky-800 font-bold outline-none text-base md:text-lg font-sans shadow-inner transition-colors"
              placeholder="Nhập biệt danh của bé..."
              required
            />
          </div>

          {/* 2. Choose avatar */}
          <div>
            <label className="block text-amber-900 font-extrabold text-base md:text-lg mb-2">
              🐾 Chọn người bạn đồng hành tinh nghịch:
            </label>
            <div className="grid grid-cols-5 gap-2 md:gap-3">
              {AVATARS.map((av) => (
                <button
                  key={av.emoji}
                  type="button"
                  onClick={() => handleAvatarSelect(av.emoji)}
                  className={`text-3xl p-2 rounded-2xl border-b-4 transition-all duration-150 ${
                    selectedAvatar === av.emoji
                      ? 'bg-amber-400 border-amber-600 scale-110 shadow-md ring-4 ring-yellow-300/60'
                      : 'bg-white border-stone-200 hover:bg-sky-100 hover:scale-105 hover:border-sky-300'
                  }`}
                  title={av.label}
                >
                  <span className="inline-block select-none">{av.emoji}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Choose Grade and Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-amber-900 font-extrabold text-base md:text-lg mb-2">
                🏫 Lớp của bé:
              </label>
              <div className="flex flex-wrap gap-2">
                {GRADES.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => {
                      setSelectedGrade(grade);
                      sound.playClick();
                    }}
                    className={`flex-1 min-w-[70px] py-2 text-center font-bold text-sm rounded-xl border-b-4 transition-all ${
                      selectedGrade === grade
                        ? 'bg-emerald-400 border-emerald-600 text-white shadow-md'
                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-amber-900 font-extrabold text-base md:text-lg mb-2">
                ⚡ Mức độ bài học:
              </label>
              <div className="flex gap-2">
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      setSelectedLevel(level);
                      sound.playClick();
                    }}
                    className={`flex-1 py-2 text-center font-bold text-sm rounded-xl border-b-4 transition-all ${
                      selectedLevel === level
                        ? 'bg-sky-400 border-sky-600 text-white shadow-md'
                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Complete button */}
          <div className="pt-2">
            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full bg-gradient-to-r from-yellow-400 to-amber-400 hover:from-yellow-300 hover:to-amber-300 text-amber-950 font-black text-lg md:text-xl py-4 rounded-2xl border-b-6 border-amber-600 shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Trophy className="w-6 h-6 fill-amber-950" />
              SẮN SÀNG LÀM BÀI NÀO! 🚀
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
