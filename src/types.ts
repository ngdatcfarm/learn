export interface UserProfile {
  name: string;
  avatar: string; // Minimal modern technical letters or avatar
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  stars: number;
  streak: number;
  isLoggedIn: boolean;
  stats: {
    wordsLearned: number;
    chatsCompleted: number;
    studyMinutes: number;
    dailyGoalProgress: number; // e.g. 60%
  };
}

export interface Course {
  id: string;
  title: string;
  difficulty: 'Trường THPT' | 'Đại học' | 'IELTS' | 'Học Thuật';
  lessonsCount: number;
  completedCount: number;
  durationMinutes: number;
  progress: number; // 0 to 100
  description: string;
  category: 'Communication' | 'Academic' | 'Grammar' | 'Vocabulary';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
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
