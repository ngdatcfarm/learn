import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { X, Trophy } from 'lucide-react';
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
    sound.speakWord(emoji);
    sound.playClick();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.92, y: 15, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 15, opacity: 0 }}
        className="bg-white rounded-3xl border-3 border-slate-900 neo-shadow-lg w-full max-w-xl p-6 md:p-8 relative overflow-hidden my-auto"
      >
        {/* Close button with cartoon shake */}
        <button
          onClick={() => {
            sound.playClick();
            onClose();
          }}
          className="absolute right-4 top-4 bg-rose-300 border-2 border-slate-900 hover:bg-rose-400 transition-all text-slate-900 rounded-xl p-2 cursor-pointer"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Header */}
        <div className="text-center mb-6 select-none">
          <span className="text-4xl animate-bounce inline-block mb-1">⭐️</span>
          <h2 className="text-slate-900 font-extrabold text-2xl md:text-3xl font-sans flex items-center justify-center gap-1.5 leading-snug">
            Hồ Sơ Của Bé Yêu
          </h2>
          <p className="text-slate-500 font-bold text-xs md:text-sm mt-1">
            Đặt tên, chọn lớp học và nhân vật bé yêu thích để bắt đầu hành trình!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          {/* 1. Name input */}
          <div>
            <label className="block text-slate-900 font-extrabold text-base md:text-lg mb-2 select-none">
              👦 Tên của bé là gì thế?
            </label>
            <input
              type="text"
              value={name}
              maxLength={15}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="w-full bg-white border-3 border-slate-900 rounded-2xl px-4 py-3 text-slate-900 font-extrabold outline-none text-base md:text-lg font-sans neo-shadow-sm focus:bg-sky-50 transition-colors"
              placeholder="Nhập biệt danh của bé..."
              required
            />
          </div>

          {/* 2. Choose avatar */}
          <div>
            <label className="block text-slate-900 font-extrabold text-base md:text-lg mb-2 select-none">
              🐾 Chọn người bạn đồng hành tinh nghịch:
            </label>
            <div className="grid grid-cols-5 gap-2 md:gap-3">
              {AVATARS.map((av) => (
                <button
                  key={av.emoji}
                  type="button"
                  onClick={() => handleAvatarSelect(av.emoji)}
                  className={`text-3xl p-2 rounded-2xl border-2 border-b-4 border-slate-900 transition-all ${
                    selectedAvatar === av.emoji
                      ? 'bg-yellow-300 scale-108 -translate-y-0.5 neo-shadow-sm'
                      : 'bg-white hover:bg-slate-50'
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
              <label className="block text-slate-900 font-extrabold text-base md:text-lg mb-2 select-none">
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
                    className={`flex-1 min-w-[70px] py-2 text-center font-extrabold text-xs md:text-sm rounded-xl border-2 border-b-4 border-slate-900 transition-all cursor-pointer ${
                      selectedGrade === grade
                        ? 'bg-emerald-300 text-slate-950 neo-shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-900 font-extrabold text-base md:text-lg mb-2 select-none">
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
                    className={`flex-1 py-2 text-center font-extrabold text-xs md:text-sm rounded-xl border-2 border-b-4 border-slate-900 transition-all cursor-pointer ${
                      selectedLevel === level
                        ? 'bg-sky-305 text-slate-950 neo-shadow-sm'
                        : 'bg-white text-slate-705 hover:bg-slate-50'
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
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-yellow-300 hover:bg-yellow-400 text-slate-900 font-black text-lg md:text-xl py-4 rounded-2xl border-3 border-slate-900 neo-shadow transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Trophy className="w-6 h-6 fill-slate-900" />
              SẮN SÀNG LÀM BÀI NÀO! 🚀
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
