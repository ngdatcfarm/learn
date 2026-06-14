import { Course, ReadingExercise } from "../types";

export const COURSES_DATA: Course[] = [
  {
    id: "course-1",
    title: "Bứt phá kỹ năng Thuyết trình & Tranh biện (Academic Debate)",
    difficulty: "IELTS",
    lessonsCount: 12,
    completedCount: 4,
    durationMinutes: 180,
    progress: 33,
    description: "Rèn luyện tư duy phản biện, cách lập luận (PEEL) và từ vựng học thuật trình độ cao.",
    category: "Communication"
  },
  {
    id: "course-2",
    title: "Intermediate English Communication for Teenagers",
    difficulty: "Trường THPT",
    lessonsCount: 15,
    completedCount: 11,
    durationMinutes: 240,
    progress: 73,
    description: "Nâng cấp giao tiếp hàng ngày tự nhiên, các mẫu câu ứng xử lịch sự trong môi trường học đường.",
    category: "Communication"
  },
  {
    id: "course-3",
    title: "Chiến thuật Đọc hiểu SAT / TOEFL Academic Texts",
    difficulty: "Học Thuật",
    lessonsCount: 10,
    completedCount: 1,
    durationMinutes: 150,
    progress: 10,
    description: "Phân tích cấu trúc đoạn văn, luyện đoán nghĩa từ vựng phức tạp trong bài đọc chính thống.",
    category: "Academic"
  },
  {
    id: "course-4",
    title: "Ứng dụng AI Lab trong Luyện viết IELTS Writing Task 2",
    difficulty: "Đại học",
    lessonsCount: 8,
    completedCount: 6,
    durationMinutes: 120,
    progress: 75,
    description: "Sử dụng các prompt chuyên sâu để tự học, nhận xét lỗi sai cấu trúc bài luận học thuật.",
    category: "Grammar"
  }
];

export const READING_EXERCISES: ReadingExercise[] = [
  {
    id: "read-1",
    title: "The Rise of Quantum Computing",
    text: "Quantum computing represents a paradigm shift in processing power. Unlike classical computers which use bits (0s and 1s) as basic units of information, quantum computers employ qubits. These qubits can exist in a state of superposition, enabling simultaneous calculations at an unprecedented scale.",
    vocabWords: [
      { word: "Paradigm shift", meaning: "Sự thay đổi căn bản về nhận thức" },
      { word: "Superposition", meaning: "Trạng thái chồng chập lượng tử" },
      { word: "Unprecedented", meaning: "Chưa từng có tiền lệ" }
    ],
    question: "What is the primary difference between classical and quantum computer units described?",
    options: [
      "Classical computers run faster than quantum qubits",
      "Qubits can exist in superposition while classical bits are binary 0 or 1",
      "Quantum computers do not process statistical metrics"
    ],
    correctAnswer: "Qubits can exist in superposition while classical bits are binary 0 or 1"
  },
  {
    id: "read-2",
    title: "Artificial Intelligence in Modern Medicine",
    text: "AI is revolutionizing healthcare diagnostics by training models on millions of clinical scans. Deep learning algorithms are now capable of pinpointing micro-anomalies in biological tissues with accuracy scores exceeding veteran radiologists, substantially accelerating patient triage workflows.",
    vocabWords: [
      { word: "Anomalies", meaning: "Sự bất thường, dị thường" },
      { word: "Radiologists", meaning: "Bác sĩ chẩn đoán hình ảnh" },
      { word: "Triage workflows", meaning: "Quy trình phân loại và điều trị bệnh nhân" }
    ],
    question: "According to the passage, how does AI improve modern diagnostics?",
    options: [
      "By replacing all human medical doctors entirely",
      "By training models to pinpoint micro-anomalies with high accuracy",
      "By focusing strictly on medicine compound development"
    ],
    correctAnswer: "By training models to pinpoint micro-anomalies with high accuracy"
  }
];
