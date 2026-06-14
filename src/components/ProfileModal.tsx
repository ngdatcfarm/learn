import { useState } from "react";
import { motion } from "motion/react";
import { 
  UserSquare2, 
  X, 
  Check, 
  Trash2, 
  Sparkles, 
  Award,
  CircleDot
} from "lucide-react";
import { UserProfile } from "../types";
import sound from "../utils/sound";

interface ProfileModalProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onClose: () => void;
}

export default function ProfileModal({ profile, setProfile, onClose }: ProfileModalProps) {
  const [tempName, setTempName] = useState(profile.name);
  const [tempLevel, setTempLevel] = useState(profile.level);

  const handleSave = () => {
    sound.playSuccess();
    setProfile({
      ...profile,
      name: tempName || "Nguyên",
      level: tempLevel
    });
    onClose();
  };

  const handleClearStats = () => {
    sound.playClick();
    if (window.confirm("Bạn muốn thiết lập lại toàn bộ tiến trình học tập hiện tại về mặc định?")) {
      setProfile({
        name: "Nguyên",
        avatar: "N",
        level: "Intermediate",
        stars: 120,
        streak: 5,
        isLoggedIn: true,
        stats: {
          wordsLearned: 14,
          chatsCompleted: 2,
          studyMinutes: 45,
          dailyGoalProgress: 40
        }
      });
      setTempName("Nguyên");
      setTempLevel("Intermediate");
      alert("Đã thiết lập lại dữ liệu học tập!");
    }
  };

  return (
    <div className="fixed inset-0 bg-[#070a12]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#111726] border border-slate-800 p-6 rounded-3xl max-w-md w-full relative space-y-6 shadow-2xl overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />

        {/* Modal Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800 relative z-10">
          <div className="flex items-center gap-2">
            <UserSquare2 className="w-5.5 h-5.5 text-teal-400" />
            <span className="text-sm font-black text-white">Quản lý Hồ sơ học tập (Apex AI)</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 px-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="space-y-4.5 relative z-10">
          
          {/* Avatar and Info */}
          <div className="flex items-center gap-3.5 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-805">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-400 to-indigo-500 flex items-center justify-center text-lg font-black text-white select-none">
              {(tempName || "N").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-white font-extrabold text-sm tracking-tight">{profile.name || "Nguyên"}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Mã thành viên: #APEX-14890</div>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            
            {/* Field 1: Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">Tên học sinh:</label>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                maxLength={25}
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:border-teal-500/50 transition-colors"
                placeholder="Nhập tên học sinh..."
              />
            </div>

            {/* Field 2: Target Level Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">Trình độ mục tiêu AI:</label>
              <div className="grid grid-cols-3 gap-2">
                {(["Beginner", "Intermediate", "Advanced"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      sound.playClick();
                      setTempLevel(l);
                    }}
                    className={`p-3 rounded-xl border text-center text-xs transition-gradient cursor-pointer font-bold ${
                      tempLevel === l
                        ? "bg-teal-500/10 border-teal-505 text-teal-400"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-705"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed pt-1 select-none">
                *Cài đặt này sẽ thay đổi độ phản xạ, từ vựng và chủ đề mà AI Tutor biên soạn cho bạn.*
              </p>
            </div>

          </div>

          {/* Risk resets */}
          <div className="border-t border-slate-800/60 pt-4">
            <button
              onClick={handleClearStats}
              className="text-[10px] font-black text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer select-none"
            >
              <Trash2 className="w-3.5 h-3.5" /> Khôi phục dữ liệu học tập ban đầu
            </button>
          </div>

        </div>

        {/* Modal Actions */}
        <div className="flex gap-2.5 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white py-3 rounded-xl text-xs font-black transition-colors cursor-pointer select-none"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-teal-500 hover:bg-teal-400 text-[#090D16] py-3 rounded-xl text-xs font-black transition-colors hover:scale-102 transition-transform cursor-pointer select-none flex items-center justify-center gap-1"
          >
            <Check className="w-4 h-4 shrink-0" /> Lưu cấu hình
          </button>
        </div>

      </motion.div>
    </div>
  );
}
