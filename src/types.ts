export interface Question {
  id: number;
  questionText: string;
  translation: string;
  emoji: string;
  illustrationType: 'apple' | 'dog' | 'cat' | 'car' | 'banana' | 'lion' | 'house' | 'bag' | 'pencil' | 'rainbow' | 'sun' | 'frog';
  options: string[];
  correctAnswer: string;
  hint: string;
}

export interface UserProfile {
  name: string;
  avatar: string; // emoji or graphic representation
  grade: string; // 'Lớp 1' | 'Lớp 2' | 'Lớp 3' | 'Lớp 4' | 'Lớp 5'
  level: 'Dễ' | 'Vừa' | 'Khó';
  stars: number;
  isLoggedIn: boolean;
}

export type AnswerState = 'unanswered' | 'correct' | 'incorrect';
