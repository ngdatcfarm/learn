import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, 
  Clock, 
  Signal, 
  ArrowRight, 
  ChevronRight, 
  Layers, 
  Award,
  BookMarked,
  Volume2
} from "lucide-react";
import { Course } from "../types";
import { COURSES_DATA } from "../data/coursesData";
import sound from "../utils/sound";

interface CoursesTabProps {
  onStartChat: () => void;
}

export default function CoursesTab({ onStartChat }: CoursesTabProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);

  const activeCourse = COURSES_DATA.find(c => c.id === selectedCourseId);

  // Simulated lesson micro-flashcards for interaction!
  const practiceCards: Record<string, { term: string; phonetic: string; explanation: string; example: string }[]> = {
    "course-1": [
      { term: "Counterargument", phonetic: "/ˈkaʊntəreɪɡjumənt/", explanation: "Luận điểm phản bác một lập trường đưa ra trước đó.", example: "To build a robust debate speech, always formulate a logical counterargument." },
      { term: "Rebuttal", phonetic: "/rɪˈbʌtl/", explanation: "Sự bác bỏ bằng chứng, chứng minh luận điểm đối thủ sai.", example: "Her sharp rebuttal silenced the opposing panel." },
      { term: "Fallacy", phonetic: "/ˈfæləsi/", explanation: "Ngụy biện, lỗi sai lập luận mang tính hệ thống.", example: "Relying on emotions rather than logical facts is a common fallacy." }
    ],
    "course-2": [
      { term: "Colloquialism", phonetic: "/kəˈləʊkwiəlɪzəm/", explanation: "Văn phong văn nói mật thiết, từ ngữ đời thường.", example: "'Wanna' and 'gonna' are typical colloquialisms common in teenage slang." },
      { term: "Polite inquiries", phonetic: "/pəˈlaɪt ɪnˈkwaɪəriz/", explanation: "Các mẫu câu hỏi thăm lịch sự (VD: 'Could you please...').", example: "Polite inquiries help break the ice in international universities." }
    ],
    "course-3": [
      { term: "Analyse", phonetic: "/ˈænəlaɪz/", explanation: "Phân tích cụ thể các thành phần cấu tạo.", example: "Students must analyse scientific diagrams during SAT text passages." },
      { term: "Slight nuance", phonetic: "/slaɪt ˈnjuːɑːns/", explanation: "Sắc thái ý nghĩa khác biệt cực kỳ nhỏ.", example: "Understanding slight nuances determines high TOEFL results." }
    ],
    "course-4": [
      { term: "Cohesion", phonetic: "/kəʊˈhiːʒn/", explanation: "Tính mạch lạc, liên kết ngữ nghĩa giữa các câu văn.", example: "Use logical connectors like 'consequently' to reinforce sentence cohesion." },
      { term: "Academic tone", phonetic: "/ˌækəˈdemɪk təʊn/", explanation: "Phong cách chuẩn mực học thuật, khách quan và không dùng từ lóng.", example: "Keep your IELTS Writing Task 2 in a strict academic tone." }
    ]
  };

  const activeFlashcards = selectedCourseId ? (practiceCards[selectedCourseId] || []) : [];

  const handleStartPractice = (courseId: string) => {
    sound.playClick();
    setSelectedCourseId(courseId);
    setCurrentCardIndex(0);
  };

  const handleNextCard = () => {
    sound.playClick();
    if (currentCardIndex < activeFlashcards.length - 1) {
      setCurrentCardIndex(prev => prev + 1);
    } else {
      setSelectedCourseId(null);
    }
  };

  return (
    <div id="student-courses" className="w-full max-w-5xl mx-auto space-y-6">
      
      {/* Upper header summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Layers className="w-5.5 h-5.5 text-teal-400" />
            Khóa học phân cấp Học thuật & Luyện thi
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-0.5">Tập trung nâng tầm năng lực đàm thoại học thuật, SAT và viết luận luận điểm.</p>
        </div>
        <div className="text-xs text-slate-500 font-bold bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 shrink-0">
          Tổng số: <span className="text-teal-400 font-extrabold">{COURSES_DATA.length} Giáo trình</span>
        </div>
      </div>

      {/* Main layout grid containing list and practice module overlay */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Course List Tab */}
        <div className="md:col-span-2 space-y-4">
          {COURSES_DATA.map((course) => (
            <div 
              key={course.id}
              className="bg-[#111625] hover:bg-[#151b2d] border border-slate-800/80 rounded-2xl p-5 transition-gradient flex flex-col sm:flex-row justify-between gap-5 relative overflow-hidden"
            >
              {/* Absract aesthetic technical overlay watermark */}
              <div className="absolute -right-2 top-0 text-9xl opacity-[0.02] font-black select-none pointer-events-none">
                {course.difficulty}
              </div>

              <div className="space-y-3.5 flex-grow">
                {/* Meta details */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[9px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded border ${
                    course.difficulty === "IELTS" 
                      ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                      : course.difficulty === "Học Thuật"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-teal-500/10 text-teal-400 border-teal-505/20"
                  }`}>
                    {course.difficulty}
                  </span>
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase">
                    {course.category}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-white font-extrabold text-base md:text-lg tracking-tight hover:text-teal-400 cursor-pointer transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed max-w-xl">
                    {course.description}
                  </p>
                </div>

                {/* Lower stats meters */}
                <div className="flex items-center gap-4 text-[11px] text-slate-500 font-bold pt-1">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" /> {course.lessonsCount} chương học
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {course.durationMinutes} phút tự học
                  </span>
                </div>
              </div>

              {/* Progress and button drawer */}
              <div className="flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end gap-4 border-t sm:border-t-0 border-slate-800/60 pt-4 sm:pt-0 shrink-0 min-w-[130px]">
                <div className="text-right space-y-1 w-full sm:w-auto">
                  <div className="text-[10px] text-slate-500 font-extrabold uppercase">Tiến trình học</div>
                  <div className="flex items-center sm:justify-end gap-1.5">
                    <span className="text-sm font-black text-white">{course.progress}%</span>
                    <span className="text-[10px] text-slate-500">({course.completedCount}/{course.lessonsCount})</span>
                  </div>
                  {/* Progress Line */}
                  <div className="w-24 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900 hidden sm:block">
                    <div className="h-full bg-teal-400" style={{ width: `${course.progress}%` }} />
                  </div>
                </div>

                <button
                  onClick={() => handleStartPractice(course.id)}
                  className="bg-slate-950 hover:bg-slate-900 text-teal-400 border border-slate-800 hover:border-teal-500/40 px-3.5 py-1.5 rounded-xl text-xs font-black transition-gradient cursor-pointer flex items-center gap-1 group active:scale-98 select-none"
                >
                  Học tiếp 
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* COLUMN 3: Active flashcard dynamic training workspace */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!selectedCourseId ? (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-[#111625]/40 border border-dashed border-slate-800 p-6 rounded-3xl h-full flex flex-col items-center justify-center text-center space-y-3"
              >
                <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-center text-slate-600 text-2xl select-none">
                  📓
                </div>
                <div>
                  <h4 className="text-slate-300 font-extrabold text-sm">Chưa có bài tập mở rộng</h4>
                  <p className="text-slate-500 text-[11px] max-w-xs mt-1">
                    Nhấn vào nút **"Học tiếp"** trên bất kỳ khóa học nào để rèn luyện Flashcard từ vựng chuyên môn ngay lập tức!
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="active-state"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="bg-[#111625] border border-slate-805 p-5 rounded-3xl space-y-4 shadow-xl tech-glow-teal"
              >
                <div className="flex justify-between items-center pb-2 border-b border-slate-805">
                  <div className="flex items-center gap-1.5">
                    <BookMarked className="w-4.5 h-4.5 text-teal-400" />
                    <span className="text-xs font-black text-white">Flashcard Luyện tập</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    Thứ tự: {currentCardIndex + 1}/{activeFlashcards.length}
                  </span>
                </div>

                {/* Main Flashcard display */}
                {activeFlashcards[currentCardIndex] && (
                  <motion.div 
                    key={currentCardIndex}
                    initial={{ x: 10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="space-y-4"
                  >
                    {/* Visual Card core */}
                    <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-900 space-y-3 relative group">
                      
                      <div className="flex justify-between items-center">
                        <span className="text-base font-black text-white tracking-tight">
                          {activeFlashcards[currentCardIndex].term}
                        </span>
                        
                        <button
                          onClick={() => {
                            sound.speakWord(activeFlashcards[currentCardIndex].term);
                          }}
                          className="p-1.5 bg-slate-900 text-teal-400 hover:text-teal-300 border border-slate-800 rounded-lg shrink-0 cursor-pointer active:scale-90"
                          title="Phát âm chuẩn"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="text-[10px] text-teal-400 font-extrabold font-mono tracking-tight select-none">
                        {activeFlashcards[currentCardIndex].phonetic}
                      </div>

                      <div className="text-xs text-slate-300 font-medium border-t border-slate-800/50 pt-2 pb-1">
                        🇻🇳 {activeFlashcards[currentCardIndex].explanation}
                      </div>
                    </div>

                    {/* Example section style like technical code text */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Mẫu câu ứng dụng:</span>
                      <p className="text-slate-300 italic text-xs leading-relaxed bg-[#0B0F19] p-3 rounded-xl border border-slate-900 font-sans">
                        "{activeFlashcards[currentCardIndex].example}"
                      </p>
                    </div>

                    {/* Quick navigation actions */}
                    <button
                      onClick={handleNextCard}
                      className="w-full bg-teal-500 hover:bg-teal-400 text-[#090D16] py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 select-none"
                    >
                      {currentCardIndex === activeFlashcards.length - 1 ? "Hoàn thành Lượt" : "Thẻ Tiếp Theo"}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}

                {/* Fast Link block with conversational tutor */}
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-900 text-center">
                  <p className="text-[10px] text-slate-400 leading-snug">
                    Muốn thực hành ghép từ vựng này vào câu thảo luận thực tế?
                  </p>
                  <button 
                    onClick={onStartChat}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-extrabold uppercase mt-2 inline-flex items-center gap-1"
                  >
                    Gặp AI Tutor Ngay <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

    </div>
  );
}
