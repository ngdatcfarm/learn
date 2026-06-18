/**
 * src/components/PracticeTab.tsx — Dictation + Speaking + Shadowing (Step 9c + 9d)
 *
 * 3 chế độ luyện tập:
 *   1. Dictation: HS nghe TTS + gõ lại → server word-diff + score
 *   2. Speaking: HS đọc prompt + thu âm → STT + error analysis (Step 9b)
 *   3. Shadowing: HS nghe câu mẫu (TTS) + thu âm lặp lại → STT + word-diff vs reference
 *
 * Data flow:
 *   - Items load từ /api/practice/items?type=dictation|speaking|shadowing
 *   - Dictation: POST /api/practice/dictation/check { itemId, userInput }
 *   - Speaking: record → upload → POST /api/practice/speak/submit { itemId, audioUrl }
 *   - Shadowing: record → upload → POST /api/practice/shadowing/check { itemId, audioUrl }
 *
 * UI:
 *   - Mode pill: "📝 Dictation" | "🎤 Speaking" | "🎧 Shadowing"
 *   - Dictation card: list item → click → TTS play + textarea + check → diff với green/red
 *   - Speaking card: list item → click → prompt + record → submit → transcript + errors + score
 *   - Shadowing card: list item → click → TTS play reference + record → submit → diff vs reference
 *
 * Empty state: nếu items.length === 0 (fallback cũng không có) → "Chưa có bài luyện".
 * 9g sẽ seed content thật; fallback items đã có sẵn trong server/practice.ts.
 */

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Headphones,
  Mic,
  MicOff,
  Square,
  Play,
  RotateCcw,
  ChevronRight,
  Volume2,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  Type,
  Lightbulb,
} from "lucide-react";
import {
  PracticeItem,
  DictationCheckResult,
  SpeakSubmitResult,
  ShadowingCheckResult,
  listPracticeItems,
  checkDictation,
  submitSpeak,
  submitShadowing,
} from "../api/client";
import {
  checkMicSupport,
  startRecording,
  stopRecording,
  makeChunkedRecorder,
  uploadAudio,
} from "../utils/audio";
import sound from "../utils/sound";
import { scoreTier, SCORE_COLORS } from "../utils/format";

interface PracticeTabProps {
  onMeasured: () => Promise<void>;
}

type Mode = "dictation" | "speaking" | "shadowing";

const levelStyle: Record<string, { bg: string; fg: string }> = {
  A1: { bg: "var(--success-soft)", fg: "var(--success)" },
  A2: { bg: "var(--primary-soft)", fg: "var(--primary)" },
  B1: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  B2: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  C1: { bg: "var(--danger-soft, var(--warning-soft))", fg: "var(--accent)" },
  C2: { bg: "var(--accent-soft)", fg: "var(--accent)" },
};

export default function PracticeTab({ onMeasured }: PracticeTabProps) {
  const [mode, setMode] = useState<Mode>("dictation");
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PracticeItem | null>(null);

  // Load items when mode changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    listPracticeItems(mode)
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.error || "Không tải được danh sách bài luyện.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* HEADER */}
      <div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b"
        style={{ borderColor: "var(--border-soft)" }}
      >
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            Luyện tập
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            Dictation (nghe + gõ), Speaking (nói + AI chấm), Shadowing (nghe + lặp) 🦉
          </p>
        </div>

        {/* Mode pill */}
        <div
          className="flex gap-1 p-1 rounded-2xl border"
          style={{
            backgroundColor: "var(--bg-soft)",
            borderColor: "var(--border)",
          }}
        >
          <ModePill
            active={mode === "dictation"}
            onClick={() => {
              sound.playClick();
              setMode("dictation");
            }}
            icon={<Type className="w-3.5 h-3.5" />}
            label="Dictation"
            emoji="📝"
          />
          <ModePill
            active={mode === "speaking"}
            onClick={() => {
              sound.playClick();
              setMode("speaking");
            }}
            icon={<Mic className="w-3.5 h-3.5" />}
            label="Speaking"
            emoji="🎤"
          />
          <ModePill
            active={mode === "shadowing"}
            onClick={() => {
              sound.playClick();
              setMode("shadowing");
            }}
            icon={<Headphones className="w-3.5 h-3.5" />}
            label="Shadowing"
            emoji="🎧"
          />
        </div>
      </div>

      {/* BODY */}
      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: "var(--muted)" }}>
          Đang tải bài luyện...
        </div>
      ) : error ? (
        <div
          className="text-center py-12 text-sm rounded-2xl border"
          style={{
            color: "var(--danger, var(--warning))",
            backgroundColor: "var(--danger-soft, var(--warning-soft))",
            borderColor: "var(--danger, var(--warning))",
          }}
        >
          {error}
        </div>
      ) : items.length === 0 ? (
        <div
          className="text-center py-12 rounded-2xl border-2 border-dashed space-y-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="text-3xl">📭</div>
          <p className="text-sm font-extrabold">Chưa có bài luyện</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Vui lòng quay lại sau khi giáo viên soạn bài nhé!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ITEM LIST */}
          <div className="md:col-span-1 space-y-3">
            <h3
              className="text-xs font-extrabold uppercase tracking-widest"
              style={{ color: "var(--muted)" }}
            >
              {mode === "dictation" ? "Câu cần nghe"
                : mode === "speaking" ? "Đề bài nói"
                : "Câu mẫu shadowing"}
            </h3>
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                mode={mode}
                active={selectedItem?.id === item.id}
                onClick={() => {
                  sound.playClick();
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>

          {/* ACTIVE PANEL */}
          <div className="md:col-span-2">
            <AnimatePresence mode="wait">
              {!selectedItem ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-6 rounded-3xl h-full flex flex-col items-center justify-center text-center space-y-3 border-2 border-dashed"
                  style={{ borderColor: "var(--border)", minHeight: 360 }}
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ backgroundColor: "var(--bg-soft)" }}
                  >
                    {mode === "dictation" ? "🎧"
                      : mode === "speaking" ? "🎙️"
                      : "🎧"}
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold">Chọn bài để bắt đầu</h4>
                    <p className="text-xs mt-1 max-w-xs" style={{ color: "var(--muted)" }}>
                      Nhấn vào một bài bên trái để{" "}
                      {mode === "dictation" ? "nghe và gõ lại"
                        : mode === "speaking" ? "thu âm câu trả lời"
                        : "nghe câu mẫu rồi thu âm lặp lại"}.
                    </p>
                  </div>
                </motion.div>
              ) : mode === "dictation" ? (
                <motion.div
                  key={`dict-${selectedItem.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <DictationPanel
                    item={selectedItem}
                    onMeasured={onMeasured}
                    onNext={() => {
                      const idx = items.findIndex((i) => i.id === selectedItem.id);
                      const next = items[(idx + 1) % items.length];
                      setSelectedItem(next);
                    }}
                  />
                </motion.div>
              ) : mode === "speaking" ? (
                <motion.div
                  key={`speak-${selectedItem.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <SpeakingPanel
                    item={selectedItem}
                    onMeasured={onMeasured}
                    onNext={() => {
                      const idx = items.findIndex((i) => i.id === selectedItem.id);
                      const next = items[(idx + 1) % items.length];
                      setSelectedItem(next);
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={`shadow-${selectedItem.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <ShadowingPanel
                    item={selectedItem}
                    onMeasured={onMeasured}
                    onNext={() => {
                      const idx = items.findIndex((i) => i.id === selectedItem.id);
                      const next = items[(idx + 1) % items.length];
                      setSelectedItem(next);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mode pill
// ============================================================

function ModePill({
  active,
  onClick,
  icon,
  label,
  emoji,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  emoji: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5"
      style={{
        backgroundColor: active ? "var(--primary)" : "transparent",
        color: active ? "var(--on-primary)" : "var(--muted)",
      }}
    >
      <span>{emoji}</span>
      {label}
    </button>
  );
}

// ============================================================
// Item card
// ============================================================

function ItemCard({
  item,
  mode,
  active,
  onClick,
}: {
  key?: string | number;
  item: PracticeItem;
  mode: Mode;
  active: boolean;
  onClick: () => void;
}) {
  const levelKey = (item.level || "A2").toUpperCase();
  const levelColors = levelStyle[levelKey] || levelStyle.A2;
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full text-left p-3.5 rounded-2xl border transition-all space-y-2"
      style={{
        backgroundColor: active ? "var(--primary-soft)" : "var(--bg-card)",
        borderColor: active ? "var(--primary)" : "var(--border)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.topic && (
            <span
              className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--foreground-soft)",
              }}
            >
              {item.topic}
            </span>
          )}
          {item.level && (
            <span
              className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full"
              style={{ backgroundColor: levelColors.bg, color: levelColors.fg }}
            >
              {item.level}
            </span>
          )}
        </div>
        {active && <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--primary)" }} />}
      </div>
      <p
        className="text-xs leading-snug line-clamp-2"
        style={{ color: "var(--foreground-soft)" }}
      >
        {mode === "dictation" ? item.text
          : mode === "speaking" ? item.prompt
          : item.reference}
      </p>
    </motion.button>
  );
}

// ============================================================
// Dictation panel
// ============================================================

function DictationPanel({
  item,
  onMeasured,
  onNext,
}: {
  item: PracticeItem;
  onMeasured: () => Promise<void>;
  onNext: () => void;
}) {
  const [userInput, setUserInput] = useState("");
  const [result, setResult] = useState<DictationCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // Reset state when item changes (TTS cancel được sound.speakWord xử lý nội bộ
  // qua utterance.onend khi component unmount / click play mới)
  useEffect(() => {
    setUserInput("");
    setResult(null);
    setError(null);
    setPlaying(false);
  }, [item.id]);

  const playTTS = useCallback(() => {
    if (!item.text) return;
    sound.speakWord(
      item.text,
      () => setPlaying(true),
      () => setPlaying(false)
    );
  }, [item.text]);

  const handleCheck = async () => {
    if (!userInput.trim()) {
      setError("Bạn chưa nhập gì cả.");
      return;
    }
    sound.playClick();
    setChecking(true);
    setError(null);
    try {
      const r = await checkDictation(item.id, userInput);
      setResult(r);
      // server already records measurement + task_done; just refresh
      onMeasured().catch(() => {});
    } catch (e: any) {
      setError(e?.error || "Check thất bại.");
    } finally {
      setChecking(false);
    }
  };

  const handleRetry = () => {
    sound.playClick();
    setUserInput("");
    setResult(null);
    setError(null);
  };

  return (
    <div
      className="p-5 rounded-3xl border space-y-4 shadow-md"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--primary)",
      }}
    >
      <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
        <div className="flex items-center gap-1.5">
          <Headphones className="w-4 h-4" style={{ color: "var(--primary)" }} />
          <span className="text-sm font-extrabold">Dictation</span>
        </div>
        {item.topic && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--bg-soft)",
              color: "var(--muted)",
            }}
          >
            {item.topic} · {item.level || "A2"}
          </span>
        )}
      </div>

      {/* TTS button */}
      <div
        className="p-4 rounded-2xl border space-y-2"
        style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p
              className="text-[10px] uppercase tracking-widest font-extrabold"
              style={{ color: "var(--muted)" }}
            >
              Nghe và gõ lại
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Nhấn nút ▶ để nghe — có thể nghe nhiều lần.
            </p>
          </div>
          <button
            onClick={playTTS}
            className="p-3 rounded-2xl border transition-all"
            style={{
              backgroundColor: playing ? "var(--primary)" : "var(--bg-elevated)",
              borderColor: "var(--primary)",
              color: playing ? "var(--on-primary)" : "var(--primary)",
            }}
            title={playing ? "Đang phát..." : "Nghe"}
            aria-label="Phát âm thanh"
          >
            {playing ? <Volume2 className="w-5 h-5 animate-pulse" /> : <Play className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="space-y-1.5">
        <label
          className="text-[10px] uppercase tracking-widest block font-extrabold"
          style={{ color: "var(--muted)" }}
        >
          Câu bạn nghe được:
        </label>
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type the sentence you heard..."
          disabled={!!result}
          rows={3}
          className="w-full p-3 rounded-xl border bg-transparent outline-none text-sm leading-relaxed resize-none transition-colors focus:border-primary"
          style={{
            borderColor: "var(--border)",
            color: "var(--foreground)",
          }}
        />
        {error && (
          <p className="text-xs" style={{ color: "var(--danger, var(--warning))" }}>
            {error}
          </p>
        )}
      </div>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3"
          >
            {(() => {
              const colors = SCORE_COLORS[scoreTier(result.score, 80, 50)];
              return (
            <div
              className="p-4 rounded-2xl border space-y-2"
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.score >= 80 ? (
                    <CheckCircle2 className="w-5 h-5" style={{ color: "var(--success)" }} />
                  ) : (
                    <XCircle className="w-5 h-5" style={{ color: "var(--warning)" }} />
                  )}
                  <span className="text-base font-extrabold">
                    {result.correctCount}/{result.totalCount} từ đúng
                  </span>
                </div>
                <span
                  className="text-2xl font-extrabold"
                  style={{ color: colors.fg }}
                >
                  {result.score}%
                </span>
              </div>
              <div className="text-xs leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
                {result.diff.map((d, i) => (
                  <span
                    key={i}
                    className="mr-1.5 inline-block"
                    style={{
                      color: d.correct ? "var(--success)" : "var(--danger, var(--warning))",
                      textDecoration: d.correct ? "none" : "line-through",
                      fontWeight: d.correct ? 400 : 700,
                    }}
                  >
                    {d.word}
                  </span>
                ))}
              </div>
              <details className="text-xs">
                <summary
                  className="cursor-pointer font-extrabold"
                  style={{ color: "var(--muted)" }}
                >
                  Xem câu mẫu
                </summary>
                <p
                  className="mt-1.5 italic"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  "{result.expected}"
                </p>
              </details>
            </div>
              );
            })()}

            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-all"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-soft)",
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Thử lại
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  onNext();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--on-primary)",
                }}
              >
                Bài tiếp <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!result && (
        <button
          onClick={handleCheck}
          disabled={checking || !userInput.trim()}
          className="w-full py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--on-primary)",
          }}
        >
          {checking ? "Đang chấm..." : "Kiểm tra"} <Sparkles className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ============================================================
// Speaking panel
// ============================================================

function SpeakingPanel({
  item,
  onMeasured,
  onNext,
}: {
  item: PracticeItem;
  onMeasured: () => Promise<void>;
  onNext: () => void;
}) {
  const micSupported = checkMicSupport();
  const [recording, setRecording] = useState(false);
  // audioUrl là single source of truth cho UI; audioBlobRef giữ Blob tương ứng
  // để handleSubmit upload (Blob không cần re-render → dùng ref).
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SpeakSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  // Effect 1: sở hữu URL revocation. Khi audioUrl đổi (gồm set null),
  // cleanup của effect trước chạy → revoke URL cũ. Đây là single owner.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Effect 2: reset khi đổi item. Dừng recording, release stream, clear state.
  // setAudioUrl(null) ở cuối trigger Effect 1 cleanup để revoke URL cũ.
  useEffect(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    audioBlobRef.current = null;
    setDurationMs(0);
    setResult(null);
    setError(null);
    setRecording(false);
    setAudioUrl(null);
  }, [item.id]);

  const handleReset = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    audioBlobRef.current = null;
    setRecording(false);
    setAudioUrl(null); // triggers Effect 1 cleanup
    setDurationMs(0);
    setResult(null);
    setError(null);
  };

  const handleStartRecording = async () => {
    if (!micSupported) {
      setError("Trình duyệt không hỗ trợ thu âm.");
      return;
    }
    setError(null);
    try {
      const { recorder, stream } = await startRecording();
      recorderRef.current = recorder;
      streamRef.current = stream;
      makeChunkedRecorder(recorder, () => {
        // chunks tracked in recorder._chunks
      });
      startTimeRef.current = Date.now();
      setRecording(true);
    } catch (e: any) {
      setError(e?.message || "Không truy cập được micro.");
    }
  };

  const handleStopRecording = async () => {
    if (!recorderRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    setDurationMs(elapsed);
    try {
      const blob = await stopRecording(recorderRef.current, streamRef.current || undefined);
      audioBlobRef.current = blob;
      setAudioUrl(URL.createObjectURL(blob));
      setRecording(false);
    } catch (e: any) {
      setError(e?.message || "Dừng thu âm thất bại.");
      setRecording(false);
    }
  };

  const handleSubmit = async () => {
    const blob = audioBlobRef.current;
    if (!blob) {
      setError("Bạn chưa thu âm.");
      return;
    }
    sound.playClick();
    setSubmitting(true);
    setError(null);
    try {
      // Upload to server
      const { url: uploadedUrl, mime } = await uploadAudio(blob);
      // Submit for analysis
      const r = await submitSpeak({
        itemId: item.id,
        audioUrl: uploadedUrl,
        durationMs,
        mime,
      });
      setResult(r);
      onMeasured().catch(() => {});
    } catch (e: any) {
      setError(e?.message || "Gửi thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="p-5 rounded-3xl border space-y-4 shadow-md"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--primary)",
      }}
    >
      <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
        <div className="flex items-center gap-1.5">
          <Mic className="w-4 h-4" style={{ color: "var(--primary)" }} />
          <span className="text-sm font-extrabold">Speaking</span>
        </div>
        {item.topic && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--bg-soft)",
              color: "var(--muted)",
            }}
          >
            {item.topic} · {item.level || "A2"}
          </span>
        )}
      </div>

      {/* Prompt */}
      <div
        className="p-4 rounded-2xl border space-y-2"
        style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
      >
        <p
          className="text-[10px] uppercase tracking-widest font-extrabold"
          style={{ color: "var(--muted)" }}
        >
          Đề bài:
        </p>
        <p className="text-sm leading-relaxed italic" style={{ color: "var(--foreground)" }}>
          "{item.prompt}"
        </p>
      </div>

      {/* Mic controls */}
      {!micSupported ? (
        <div
          className="p-4 rounded-2xl border text-center space-y-2"
          style={{
            backgroundColor: "var(--warning-soft)",
            borderColor: "var(--warning)",
          }}
        >
          <MicOff className="w-6 h-6 mx-auto" style={{ color: "var(--warning)" }} />
          <p className="text-xs font-extrabold">Trình duyệt không hỗ trợ micro</p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            Hãy dùng Chrome, Edge, hoặc Safari mới nhất.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {!recording ? (
              <button
                onClick={handleStartRecording}
                disabled={!!result}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{
                  backgroundColor: "var(--danger, var(--primary))",
                  color: "var(--on-primary)",
                }}
              >
                <Mic className="w-4 h-4" />
                {audioUrl ? "Thu lại" : "Bắt đầu thu"}
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all animate-pulse"
                style={{
                  backgroundColor: "var(--danger, var(--warning))",
                  color: "var(--on-primary, white)",
                }}
              >
                <Square className="w-4 h-4" /> Dừng lại
              </button>
            )}
          </div>

          {audioUrl && !recording && !result && (
            <div
              className="p-3 rounded-2xl border space-y-2"
              style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
            >
              <p
                className="text-[10px] font-extrabold uppercase tracking-widest"
                style={{ color: "var(--muted)" }}
              >
                Bản thu của bạn ({(durationMs / 1000).toFixed(1)}s):
              </p>
              <audio src={audioUrl} controls className="w-full" style={{ height: 40 }} />
            </div>
          )}

          {error && (
            <p
              className="text-xs text-center"
              style={{ color: "var(--danger, var(--warning))" }}
            >
              {error}
            </p>
          )}

          {!result && audioUrl && !submitting && (
            <button
              onClick={handleSubmit}
              className="w-full py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--on-primary)",
              }}
            >
              Gửi cho AI chấm <Sparkles className="w-4 h-4" />
            </button>
          )}

          {submitting && (
            <div
              className="text-center text-xs py-2"
              style={{ color: "var(--muted)" }}
            >
              🦉 Đang nghe AI chấm bài... (có thể mất 5-10 giây)
            </div>
          )}
        </div>
      )}

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3"
          >
            {/* Score */}
            {(() => {
              const colors = SCORE_COLORS[scoreTier(result.analysis.overall_score, 7, 5)];
              return (
            <div
              className="p-4 rounded-2xl border space-y-2"
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" style={{ color: "var(--primary)" }} />
                  <span className="text-sm font-extrabold">Điểm tổng</span>
                </div>
                <span
                  className="text-2xl font-extrabold"
                  style={{ color: colors.fg }}
                >
                  {result.analysis.overall_score}/10
                </span>
              </div>
              <p className="text-sm italic" style={{ color: "var(--foreground-soft)" }}>
                {result.analysis.encouragement}
              </p>
            </div>
              );
            })()}

            {/* Transcript */}
            <div
              className="p-4 rounded-2xl border space-y-2"
              style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
            >
              <p
                className="text-[10px] font-extrabold uppercase tracking-widest"
                style={{ color: "var(--muted)" }}
              >
                Transcript ({result.confidence}):
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--foreground)" }}
              >
                {result.transcript || (
                  <span style={{ color: "var(--muted)" }}>(trống)</span>
                )}
              </p>
            </div>

            {/* Errors */}
            {result.analysis.errors.length > 0 ? (
              <div
                className="p-4 rounded-2xl border space-y-2"
                style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
              >
                <p
                  className="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5"
                  style={{ color: "var(--muted)" }}
                >
                  <Lightbulb className="w-3 h-3" /> Gợi ý sửa ({result.analysis.errors.length}):
                </p>
                <ul className="space-y-2">
                  {result.analysis.errors.map((err, i) => (
                    <li
                      key={i}
                      className="text-xs p-2.5 rounded-lg border space-y-0.5"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-soft)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: "var(--primary-soft)",
                            color: "var(--primary)",
                          }}
                        >
                          {err.type}
                        </span>
                        {err.original && (
                          <span style={{ color: "var(--danger, var(--warning))", textDecoration: "line-through" }}>
                            {err.original}
                          </span>
                        )}
                        {err.expected && (
                          <>
                            <ArrowRight className="w-2.5 h-2.5" style={{ color: "var(--muted)" }} />
                            <span style={{ color: "var(--success)" }}>{err.expected}</span>
                          </>
                        )}
                      </div>
                      {err.hint && (
                        <p style={{ color: "var(--muted)" }} className="leading-snug">
                          💡 {err.hint}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div
                className="p-3 rounded-2xl border text-center"
                style={{
                  backgroundColor: "var(--success-soft)",
                  borderColor: "var(--success)",
                }}
              >
                <CheckCircle2
                  className="w-5 h-5 mx-auto"
                  style={{ color: "var(--success)" }}
                />
                <p className="text-xs font-extrabold mt-1">Tuyệt vời! Không có lỗi nào 🎉</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  sound.playClick();
                  handleReset();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-all"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-soft)",
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Thử lại
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  handleReset();
                  onNext();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--on-primary)",
                }}
              >
                Bài tiếp <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Shadowing panel (Step 9d)
// ============================================================
//
// Flow: nghe TTS câu mẫu → thu âm HS lặp lại → upload + STT → word-diff vs reference.
// Skill tracked: listen.accuracy (luyện nghe + bắt chước).

function ShadowingPanel({
  item,
  onMeasured,
  onNext,
}: {
  item: PracticeItem;
  onMeasured: () => Promise<void>;
  onNext: () => void;
}) {
  const micSupported = checkMicSupport();
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  // audioUrl single-owner pattern (xem debugging.md → audioUrl ownership).
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ShadowingCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  // Effect 1: sở hữu URL revocation. Khi audioUrl đổi (gồm set null),
  // cleanup của effect trước chạy → revoke URL cũ. Single owner pattern.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Effect 2: reset khi đổi item. Dừng recording, release stream, clear state.
  // setAudioUrl(null) ở cuối trigger Effect 1 cleanup để revoke URL cũ.
  useEffect(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    audioBlobRef.current = null;
    setDurationMs(0);
    setResult(null);
    setError(null);
    setRecording(false);
    setPlaying(false);
    setAudioUrl(null);
  }, [item.id]);

  const handlePlayReference = useCallback(() => {
    if (!item.reference) return;
    sound.speakWord(
      item.reference,
      () => setPlaying(true),
      () => setPlaying(false)
    );
  }, [item.reference]);

  const handleStartRecording = async () => {
    if (!micSupported) {
      setError("Trình duyệt không hỗ trợ thu âm.");
      return;
    }
    setError(null);
    try {
      const { recorder, stream } = await startRecording();
      recorderRef.current = recorder;
      streamRef.current = stream;
      makeChunkedRecorder(recorder, () => {
        // chunks tracked in recorder._chunks
      });
      startTimeRef.current = Date.now();
      setRecording(true);
    } catch (e: any) {
      setError(e?.message || "Không truy cập được micro.");
    }
  };

  const handleStopRecording = async () => {
    if (!recorderRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    setDurationMs(elapsed);
    try {
      const blob = await stopRecording(recorderRef.current, streamRef.current || undefined);
      audioBlobRef.current = blob;
      setAudioUrl(URL.createObjectURL(blob));
      setRecording(false);
    } catch (e: any) {
      setError(e?.message || "Dừng thu âm thất bại.");
      setRecording(false);
    }
  };

  const handleReset = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    audioBlobRef.current = null;
    setRecording(false);
    setAudioUrl(null); // triggers Effect 1 cleanup
    setDurationMs(0);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    const blob = audioBlobRef.current;
    if (!blob) {
      setError("Bạn chưa thu âm.");
      return;
    }
    sound.playClick();
    setSubmitting(true);
    setError(null);
    try {
      const { url: uploadedUrl, mime } = await uploadAudio(blob);
      const r = await submitShadowing({
        itemId: item.id,
        audioUrl: uploadedUrl,
        durationMs,
        mime,
      });
      setResult(r);
      onMeasured().catch(() => {});
    } catch (e: any) {
      setError(e?.message || "Gửi thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="p-5 rounded-3xl border space-y-4 shadow-md"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--primary)",
      }}
    >
      <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--border-soft)" }}>
        <div className="flex items-center gap-1.5">
          <Headphones className="w-4 h-4" style={{ color: "var(--primary)" }} />
          <span className="text-sm font-extrabold">Shadowing</span>
        </div>
        {item.topic && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--bg-soft)",
              color: "var(--muted)",
            }}
          >
            {item.topic} · {item.level || "A2"}
          </span>
        )}
      </div>

      {/* Reference + TTS */}
      <div
        className="p-4 rounded-2xl border space-y-2"
        style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <p
              className="text-[10px] uppercase tracking-widest font-extrabold"
              style={{ color: "var(--muted)" }}
            >
              Câu mẫu — nghe rồi lặp lại:
            </p>
            <p
              className="text-sm leading-relaxed italic mt-1"
              style={{ color: "var(--foreground)" }}
            >
              "{item.reference}"
            </p>
          </div>
          <button
            onClick={handlePlayReference}
            className="p-3 rounded-2xl border transition-all shrink-0"
            style={{
              backgroundColor: playing ? "var(--primary)" : "var(--bg-elevated)",
              borderColor: "var(--primary)",
              color: playing ? "var(--on-primary)" : "var(--primary)",
            }}
            title={playing ? "Đang phát..." : "Nghe"}
            aria-label="Phát câu mẫu"
          >
            {playing ? <Volume2 className="w-5 h-5 animate-pulse" /> : <Play className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mic controls */}
      {!micSupported ? (
        <div
          className="p-4 rounded-2xl border text-center space-y-2"
          style={{
            backgroundColor: "var(--warning-soft)",
            borderColor: "var(--warning)",
          }}
        >
          <MicOff className="w-6 h-6 mx-auto" style={{ color: "var(--warning)" }} />
          <p className="text-xs font-extrabold">Trình duyệt không hỗ trợ micro</p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            Hãy dùng Chrome, Edge, hoặc Safari mới nhất.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {!recording ? (
              <button
                onClick={handleStartRecording}
                disabled={!!result}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{
                  backgroundColor: "var(--danger, var(--primary))",
                  color: "var(--on-primary)",
                }}
              >
                <Mic className="w-4 h-4" />
                {audioUrl ? "Thu lại" : "Bắt đầu thu"}
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all animate-pulse"
                style={{
                  backgroundColor: "var(--danger, var(--warning))",
                  color: "var(--on-primary, white)",
                }}
              >
                <Square className="w-4 h-4" /> Dừng lại
              </button>
            )}
          </div>

          {audioUrl && !recording && !result && (
            <div
              className="p-3 rounded-2xl border space-y-2"
              style={{ backgroundColor: "var(--bg-soft)", borderColor: "var(--border-soft)" }}
            >
              <p
                className="text-[10px] font-extrabold uppercase tracking-widest"
                style={{ color: "var(--muted)" }}
              >
                Bản thu của bạn ({(durationMs / 1000).toFixed(1)}s):
              </p>
              <audio src={audioUrl} controls className="w-full" style={{ height: 40 }} />
            </div>
          )}

          {error && (
            <p
              className="text-xs text-center"
              style={{ color: "var(--danger, var(--warning))" }}
            >
              {error}
            </p>
          )}

          {!result && audioUrl && !submitting && (
            <button
              onClick={handleSubmit}
              className="w-full py-3 px-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--on-primary)",
              }}
            >
              Gửi chấm <Sparkles className="w-4 h-4" />
            </button>
          )}

          {submitting && (
            <div
              className="text-center text-xs py-2"
              style={{ color: "var(--muted)" }}
            >
              🦉 Đang nghe AI so sánh... (có thể mất 5-10 giây)
            </div>
          )}
        </div>
      )}

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3"
          >
            {(() => {
              const colors = SCORE_COLORS[scoreTier(result.score, 80, 50)];
              return (
                <div
                  className="p-4 rounded-2xl border space-y-2"
                  style={{
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {result.score >= 80 ? (
                        <CheckCircle2 className="w-5 h-5" style={{ color: "var(--success)" }} />
                      ) : (
                        <XCircle className="w-5 h-5" style={{ color: "var(--warning)" }} />
                      )}
                      <span className="text-base font-extrabold">
                        {result.correctCount}/{result.totalCount} từ đúng
                      </span>
                    </div>
                    <span
                      className="text-2xl font-extrabold"
                      style={{ color: colors.fg }}
                    >
                      {result.score}%
                    </span>
                  </div>
                  <div
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    {result.diff.map((d, i) => (
                      <span
                        key={i}
                        className="mr-1.5 inline-block"
                        style={{
                          color: d.correct ? "var(--success)" : "var(--danger, var(--warning))",
                          textDecoration: d.correct ? "none" : "line-through",
                          fontWeight: d.correct ? 400 : 700,
                        }}
                      >
                        {d.word}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                    Transcript: "{result.transcript || "(trống)"}"
                  </p>
                </div>
              );
            })()}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  sound.playClick();
                  handleReset();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-all"
                style={{
                  backgroundColor: "var(--bg-soft)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-soft)",
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Thử lại
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  handleReset();
                  onNext();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--on-primary)",
                }}
              >
                Bài tiếp <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
