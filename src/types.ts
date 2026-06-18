// =============================================================
// CORE — Hồ sơ người dùng + bài tập (giữ nguyên từ version cũ)
// =============================================================

export type SkillId = "read" | "write" | "listen" | "speak" | "learn";

export interface UserProfile {
  // --- Tĩnh ---
  name: string;
  avatar: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  cefrLevel?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  goal?: "IELTS" | "Giao tiếp" | "Học thuật" | "Tổng quát";
  dailyGoalMinutes: 5 | 15 | 30;

  // --- Gamification (giữ lại để truy cập nhanh) ---
  stars: number;
  isLoggedIn: boolean;

  // --- Learner Model ---
  skills: LearnerSkills;
  engagement: EngagementMetrics;
}

export interface Course {
  id: string;
  title: string;
  difficulty: "Trường THPT" | "Đại học" | "IELTS" | "Học Thuật";
  lessonsCount: number;
  completedCount: number;
  durationMinutes: number;
  progress: number; // 0 to 100
  description: string;
  category: "Communication" | "Academic" | "Grammar" | "Vocabulary";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ReadingExercise {
  id: string;
  title: string;
  text: string;
  vocabWords: { word: string; meaning: string }[];
  question: string;
  options: string[];
  correctAnswer: string;
  userInput?: string;
  isCorrect?: boolean;
}

// =============================================================
// LEARNER MODEL — 5 kỹ năng cốt lõi
// Nguyên tắc: "Đo được → mới cải thiện được".
// Mỗi hoạt động trong app phải gắn với ≥ 1 metric trong đây.
// =============================================================

export type SkillTrend = "improving" | "stable" | "declining" | "unknown";

export interface SkillMetric {
  /** Số lần đã đo. Cần ≥ 5 attempts mới coi là tin cậy. */
  attempts: number;
  /** ISO date string lần đo gần nhất. */
  lastMeasured?: string;
  /** So sánh với 7 ngày trước. */
  trend: SkillTrend;
}

// --- 5 kỹ năng ---

export interface ReadMetrics extends SkillMetric {
  /** Tốc độ đọc (words per minute). */
  readSpeed: number;
  /** % trả lời đúng câu hỏi hiểu bài. */
  readComprehension: number;
  /** % từ vựng dùng đúng trong ngữ cảnh. */
  readVocabInContext: number;
}

export interface WriteMetrics extends SkillMetric {
  /** Số lỗi trên 100 từ (càng thấp càng tốt). */
  writeGrammar: number;
  /** Type-Token Ratio — độ đa dạng từ vựng (0-1). */
  writeVocabRange: number;
  /** 0-10, mạch lạc giữa các câu. */
  writeCoherence: number;
  /** 0-10, đáp ứng yêu cầu đề bài. */
  writeTaskAchievement: number;
}

export interface ListenMetrics extends SkillMetric {
  /** % nghe đúng (dictation). */
  listenAccuracy: number;
  /** % trả lời đúng câu hỏi nghe hiểu. */
  listenComprehension: number;
  /** Tốc độ tối đa HS theo kịp: 1.0 / 1.25 / 1.5. */
  listenSpeedTolerance: number;
}

export interface SpeakMetrics extends SkillMetric {
  /** % phát âm chuẩn (do AI chấm). */
  speakPronunciation: number;
  /** WPM + pauses (càng cao càng trôi chảy). */
  speakFluency: number;
  /** 0-10, ngữ điệu tự nhiên. */
  speakIntonation: number;
  /** 0-10, tự tin khi nói. */
  speakConfidence: number;
}

export interface LearnMetrics extends SkillMetric {
  /** Tổng số từ vựng đã thuộc (SRS level ≥ mature). */
  vocabKnown: number;
  /** % nhớ trung bình sau 1/7/30 ngày. */
  vocabRetention: number;
  /** Số từ dùng đúng khi nói/viết (active recall). */
  vocabActiveUse: number;
  /** % chủ điểm ngữ pháp đã làm đúng. */
  grammarMastery: number;
}

export interface LearnerSkills {
  read: ReadMetrics;
  write: WriteMetrics;
  listen: ListenMetrics;
  speak: SpeakMetrics;
  learn: LearnMetrics;
}

// =============================================================
// ENGAGEMENT — Hành vi học tập
// =============================================================

export interface EngagementMetrics {
  /** Chuỗi ngày học liên tiếp. */
  streak: number;
  /** Thời gian học trung bình mỗi phiên (phút). */
  avgSessionMinutes: number;
  /** Tổng phút học trong ngày hôm nay (daily goal bar dùng cái này). */
  minutesToday: number;
  /** Tỉ lệ làm lại bài sai (0-1). Cao = HS không bỏ cuộc. */
  retryRate: number;
  /** Tần suất dùng hint/dịch (0-1). Cao = cần hỗ trợ nhiều. */
  helpSeekingRate: number;
  /** Tỉ lệ bỏ ngang giữa chừng (0-1). */
  dropoutPerTask: number;
  /** ISO date lần cuối HS mở app. */
  lastActive?: string;
}

// =============================================================
// CONSTANTS — Giá trị khởi đầu cho HS mới
// =============================================================

export const DEFAULT_SKILLS: LearnerSkills = {
  read: {
    readSpeed: 0,
    readComprehension: 0,
    readVocabInContext: 0,
    attempts: 0,
    trend: "unknown",
  },
  write: {
    writeGrammar: 0,
    writeVocabRange: 0,
    writeCoherence: 0,
    writeTaskAchievement: 0,
    attempts: 0,
    trend: "unknown",
  },
  listen: {
    listenAccuracy: 0,
    listenComprehension: 0,
    listenSpeedTolerance: 1.0,
    attempts: 0,
    trend: "unknown",
  },
  speak: {
    speakPronunciation: 0,
    speakFluency: 0,
    speakIntonation: 0,
    speakConfidence: 0,
    attempts: 0,
    trend: "unknown",
  },
  learn: {
    vocabKnown: 0,
    vocabRetention: 0,
    vocabActiveUse: 0,
    grammarMastery: 0,
    attempts: 0,
    trend: "unknown",
  },
};

export const DEFAULT_ENGAGEMENT: EngagementMetrics = {
  streak: 0,
  avgSessionMinutes: 0,
  minutesToday: 0,
  retryRate: 0,
  helpSeekingRate: 0,
  dropoutPerTask: 0,
};

/** Cấu hình hiển thị 5 kỹ năng trên UI (icon, màu, chỉ số chính). */
export const SKILL_META: Record<
  SkillId,
  {
    label: string;
    emoji: string;
    color: string; // CSS var token
    primaryMetric: keyof ReadMetrics | keyof WriteMetrics | keyof ListenMetrics | keyof SpeakMetrics | keyof LearnMetrics;
    primaryLabel: string;
  }
> = {
  read: {
    label: "Đọc",
    emoji: "📖",
    color: "var(--primary)",
    primaryMetric: "readComprehension",
    primaryLabel: "Hiểu bài",
  },
  write: {
    label: "Viết",
    emoji: "✍️",
    color: "var(--accent)",
    primaryMetric: "writeCoherence",
    primaryLabel: "Mạch lạc",
  },
  listen: {
    label: "Nghe",
    emoji: "👂",
    color: "var(--secondary)",
    primaryMetric: "listenAccuracy",
    primaryLabel: "Chính xác",
  },
  speak: {
    label: "Nói",
    emoji: "🗣️",
    color: "var(--warning)",
    primaryMetric: "speakFluency",
    primaryLabel: "Trôi chảy",
  },
  learn: {
    label: "Học",
    emoji: "🧠",
    color: "var(--success)",
    primaryMetric: "vocabKnown",
    primaryLabel: "Từ vựng",
  },
};
