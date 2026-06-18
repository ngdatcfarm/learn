/**
 * src/components/FlashcardSession.tsx — SRS flashcard session (Step 9f)
 *
 * Modal-style overlay mở từ CoursesTab. Flow:
 *   1. Load `GET /api/flashcards/due?limit=20` → list thẻ cần ôn
 *   2. Với mỗi thẻ: hiển thị mặt trước (term) → click "Lật" → mặt sau
 *      (phonetic + nghĩa + ví dụ) → 4 nút Again/Hard/Good/Easy
 *   3. Mỗi click nút → `POST /api/flashcards/review` (quality 1/3/4/5)
 *   4. Cuối session: chúc mừng + nút "Xong"
 *
 * UX:
 * - Click mặt trước = "Lật" (KHÔNG cần nút riêng)
 * - 4 nút map sang SM-2 quality: Again=1, Hard=3, Good=4, Easy=5
 * - Sound + animation: thẻ lật có transition 3D (rotate Y)
 * - Tracker measurement "vocabReviewed" mỗi lần review (vocabKnown++)
 * - trackEvent task_done cuối session
 *
 * Empty state: nếu không có thẻ nào → "Bạn đã ôn hết hôm nay! 🎉"
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Volume2,
  RotateCw,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import {
  FlashcardItem,
  listDueFlashcards,
  reviewFlashcard,
  recordMeasurement,
  trackEvent,
} from "../api/client";
import sound from "../utils/sound";
import { SCORE_COLORS } from "../utils/format";

interface FlashcardSessionProps {
  onClose: () => void;
  onMeasured?: () => Promise<void>;
}

type Quality = 1 | 3 | 4 | 5;

const QUALITY_BUTTONS: Array<{
  q: Quality;
  label: string;
  hint: string;
  color: { bg: string; border: string; fg: string };
}> = [
  {
    q: 1,
    label: "Quên",
    hint: "<1 phút",
    color: SCORE_COLORS.bad,
  },
  {
    q: 3,
    label: "Khó",
    hint: "Lặp lại sớm",
    color: SCORE_COLORS.warn,
  },
  {
    q: 4,
    label: "Tốt",
    hint: "Đúng giờ",
    color: {
      bg: "var(--primary-soft)",
      border: "var(--primary)",
      fg: "var(--primary)",
    },
  },
  {
    q: 5,
    label: "Dễ",
    hint: "Kéo dài",
    color: SCORE_COLORS.good,
  },
];

export default function FlashcardSession({
  onClose,
  onMeasured,
}: FlashcardSessionProps) {
  const [items, setItems] = useState<FlashcardItem[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ============================================================
  // Load due cards on mount
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listDueFlashcards(20);
        if (cancelled) return;
        setItems(res.items);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.error || "Không tải được danh sách thẻ.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentItem = items?.[currentIndex];
  const totalCards = items?.length ?? 0;
  const progress = totalCards > 0 ? reviewedCount / totalCards : 0;

  // ============================================================
  // Submit review → advance to next card (or finish)
  // ============================================================
  const handleReview = useCallback(
    async (quality: Quality) => {
      if (!currentItem || submitting) return;
      setSubmitting(true);
      setError(null);
      sound.playClick();
      try {
        await reviewFlashcard(currentItem.vocabId, quality);

        // Measurement: HS đã "recall" 1 vocab (thấy + đánh giá)
        // Fire-and-forget — không block UI; server lỗi thì bỏ qua.
        void Promise.allSettled([
          recordMeasurement({ skill: "learn", metric: "vocabActiveUse", value: 1 }),
          recordMeasurement({ skill: "learn", metric: "vocabKnown", value: 1 }),
        ]).catch(() => {});

        const nextReviewed = reviewedCount + 1;
        setReviewedCount(nextReviewed);

        // Quality < 3 (Again) → thêm nhẹ tiếng "boing" để HS biết
        if (quality === 1) sound.playIncorrect();
        else if (quality === 5) sound.playSuccess();

        if (nextReviewed >= totalCards) {
          setDone(true);
          // Task done cho cuối session
          try {
            await trackEvent("task_done");
            await onMeasured?.();
          } catch {}
        } else {
          setCurrentIndex((idx) => idx + 1);
          setFlipped(false);
        }
      } catch (e: any) {
        setError(e?.error || "Lưu review thất bại. Thử lại nhé.");
      } finally {
        setSubmitting(false);
      }
    },
    [currentItem, submitting, reviewedCount, totalCards, onMeasured]
  );

  // ============================================================
  // Card flip handlers
  // ============================================================
  const handleFlip = useCallback(() => {
    sound.playClick();
    setFlipped(true);
  }, []);

  const handleSpeak = useCallback((text: string) => {
    sound.speakWord(text);
  }, []);

  // ============================================================
  // Keyboard: Space = flip / 1,3,4,5 = quality (khi đã lật)
  // ============================================================
  useEffect(() => {
    if (done || !currentItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!flipped) handleFlip();
      } else if (flipped && ["1", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        handleReview(Number(e.key) as Quality);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, currentItem, flipped, handleFlip, handleReview]);

  // ============================================================
  // RENDER
  // ============================================================

  // Loading
  if (items === null && !error) {
    return (
      <SessionShell onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div
            className="w-12 h-12 rounded-2xl border-4 border-t-transparent animate-spin"
            style={{ borderColor: "var(--primary)" }}
          />
          <p className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            Đang tải thẻ của bạn...
          </p>
        </div>
      </SessionShell>
    );
  }

  // Error
  if (error && !items) {
    return (
      <SessionShell onClose={onClose}>
        <div className="text-center py-16 space-y-3">
          <div className="text-5xl">😢</div>
          <p className="text-sm font-extrabold">{error}</p>
          <button
            onClick={onClose}
            className="mt-2 px-4 py-2 rounded-xl text-xs font-extrabold"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            Đóng
          </button>
        </div>
      </SessionShell>
    );
  }

  // Empty (đã ôn hết)
  if (items && items.length === 0) {
    return (
      <SessionShell onClose={onClose}>
        <div className="text-center py-16 space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="text-7xl"
          >
            🎉
          </motion.div>
          <h3 className="text-xl font-extrabold">Bạn đã ôn hết hôm nay!</h3>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Quay lại sau nhé — thẻ mới sẽ tới hạn vào lần ôn tiếp theo.
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-5 py-2.5 rounded-xl text-sm font-extrabold"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            Xong
          </button>
        </div>
      </SessionShell>
    );
  }

  // Done (đã review hết thẻ trong session)
  if (done) {
    return (
      <SessionShell onClose={onClose}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center py-12 space-y-5"
        >
          <motion.div
            initial={{ rotate: -15, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="inline-flex w-24 h-24 rounded-3xl items-center justify-center text-5xl"
            style={{ backgroundColor: "var(--success-soft)" }}
          >
            🏆
          </motion.div>
          <div>
            <h3 className="text-2xl font-extrabold mb-1">Hoàn thành!</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Bạn vừa ôn <strong>{reviewedCount}</strong> thẻ từ vựng. Giỏi quá! 🌟
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl text-sm font-extrabold inline-flex items-center gap-2"
            style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
          >
            <CheckCircle2 className="w-4 h-4" /> Quay lại khóa học
          </button>
        </motion.div>
      </SessionShell>
    );
  }

  // Active session
  return (
    <SessionShell onClose={onClose}>
      <div className="space-y-5">
        {/* HEADER — progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: "var(--primary)" }} />
              <span className="text-sm font-extrabold">Ôn tập SRS</span>
            </div>
            <span
              className="text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: "var(--bg-soft)",
                color: "var(--muted)",
              }}
            >
              {reviewedCount + 1}/{totalCards}
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-soft)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: "var(--primary)" }}
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* CARD */}
        <AnimatePresence mode="wait">
          {currentItem && (
            <motion.div
              key={currentItem.vocabId}
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative h-72 sm:h-80"
              style={{ perspective: "1200px" }}
            >
              <motion.div
                className="absolute inset-0 cursor-pointer"
                onClick={handleFlip}
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.5, type: "spring", stiffness: 80 }}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* FRONT */}
                <div
                  className="absolute inset-0 rounded-3xl border-2 p-6 flex flex-col items-center justify-center text-center gap-4"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--primary)",
                    backfaceVisibility: "hidden",
                  }}
                >
                  {currentItem.topic && (
                    <span
                      className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: "var(--primary-soft)",
                        color: "var(--primary)",
                      }}
                    >
                      {currentItem.topic}
                      {currentItem.level ? ` · ${currentItem.level}` : ""}
                    </span>
                  )}
                  <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                    {currentItem.term}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeak(currentItem.term);
                    }}
                    className="p-2 rounded-xl border inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: "var(--bg-soft)",
                      borderColor: "var(--border)",
                      color: "var(--primary)",
                    }}
                    title="Nghe phát âm"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold">Nghe</span>
                  </button>
                  <div
                    className="absolute bottom-4 left-0 right-0 text-[10px] font-bold tracking-wide flex items-center justify-center gap-1"
                    style={{ color: "var(--muted)" }}
                  >
                    <RotateCw className="w-3 h-3" />
                    Click để lật
                  </div>
                  {currentItem.isNew && (
                    <span
                      className="absolute top-3 right-3 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--accent-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      Mới
                    </span>
                  )}
                </div>

                {/* BACK */}
                <div
                  className="absolute inset-0 rounded-3xl border-2 p-5 sm:p-6 flex flex-col gap-3 overflow-y-auto"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--success)",
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl sm:text-2xl font-extrabold tracking-tight">
                        {currentItem.term}
                      </div>
                      {currentItem.phonetic && (
                        <div
                          className="text-xs font-bold mt-0.5"
                          style={{ color: "var(--primary)" }}
                        >
                          {currentItem.phonetic}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSpeak(currentItem.term);
                      }}
                      className="p-2 rounded-xl border"
                      style={{
                        backgroundColor: "var(--bg-soft)",
                        borderColor: "var(--border)",
                        color: "var(--primary)",
                      }}
                      title="Nghe lại"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {currentItem.explanation && (
                    <div
                      className="p-3 rounded-2xl text-sm"
                      style={{
                        backgroundColor: "var(--bg-soft)",
                        color: "var(--foreground-soft)",
                      }}
                    >
                      🇻🇳 {currentItem.explanation}
                    </div>
                  )}

                  {currentItem.example && (
                    <div className="space-y-1">
                      <span
                        className="text-[10px] uppercase tracking-widest block font-bold"
                        style={{ color: "var(--muted)" }}
                      >
                        Ví dụ:
                      </span>
                      <p
                        className="text-sm italic leading-relaxed p-3 rounded-xl border"
                        style={{
                          backgroundColor: "var(--bg-soft)",
                          borderColor: "var(--border-soft)",
                          color: "var(--foreground-soft)",
                        }}
                      >
                        "{currentItem.example}"
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* QUALITY BUTTONS — chỉ hiện khi đã lật */}
        <AnimatePresence>
          {flipped && currentItem && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="grid grid-cols-4 gap-2"
            >
              {QUALITY_BUTTONS.map((b) => (
                <button
                  key={b.q}
                  onClick={() => handleReview(b.q)}
                  disabled={submitting}
                  className="px-2 py-3 rounded-2xl border-2 flex flex-col items-center gap-0.5 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: b.color.bg,
                    borderColor: b.color.border,
                    color: b.color.fg,
                  }}
                  title={`Phím ${b.q}`}
                >
                  <span className="text-xs sm:text-sm font-extrabold">
                    {b.label}
                  </span>
                  <span
                    className="text-[9px] font-bold hidden sm:block"
                    style={{ opacity: 0.8 }}
                  >
                    {b.hint}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ERROR */}
        {error && (
          <p
            className="text-xs text-center font-bold"
            style={{ color: "var(--danger, var(--warning))" }}
          >
            {error}
          </p>
        )}

        {/* HINT FOOTER */}
        <p
          className="text-[10px] text-center font-bold tracking-wide"
          style={{ color: "var(--muted)" }}
        >
          {flipped
            ? "Chọn mức độ nhớ của bạn · Phím tắt: 1 / 3 / 4 / 5"
            : "Nhấn Space hoặc click thẻ để lật"}
        </p>
      </div>
    </SessionShell>
  );
}

// ============================================================
// SessionShell — backdrop + modal container
// ============================================================
function SessionShell({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border shadow-2xl"
        style={{
          backgroundColor: "var(--bg)",
          borderColor: "var(--border)",
        }}
      >
        <div className="p-5 sm:p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg"
            style={{ color: "var(--muted)" }}
            title="Đóng (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
