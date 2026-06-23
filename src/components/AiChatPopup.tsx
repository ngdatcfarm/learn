/**
 * src/components/AiChatPopup.tsx — Step 13b Phase 7
 *
 * Modal popup với chat UI giống AILabTab (Step 9e voice input + analyze tools).
 *
 * Thay thế hoàn toàn cho "Chat với AI" tab bottom-nav (đã xóa ở Phase 2)
 * + LiveHelpIndicator popup (HS chủ động gọi GV — không phù hợp mô hình
 * Flipped Classroom, xóa ở Phase 7).
 *
 * Mount:
 *   <AiChatPopup open={aiChatOpen} onClose={...}
 *     profile={profile} setProfile={setProfile} onMeasured={refreshSkills} />
 *
 * Behavior:
 *   - Lazy-mount: chỉ render khi `open=true` (perf — AI state reset mỗi lần mở)
 *   - ModalShell wrapper với max-w-2xl, max-h-[85vh], overflow-hidden
 *   - Chat UI dùng `flex flex-col h-full` thay vì viewport calc (của AILabTab)
 *   - Voice input: dùng useAudioRecorder (mic button trong input bar)
 *
 * Cleanup liên quan:
 *   - src/components/livehelp/LiveHelpIndicator.tsx (DELETED Phase 7)
 *   - src/components/livehelp/HelpRequestModal.tsx (DELETED Phase 7)
 *   - livehelp/index.ts: bỏ exports LiveHelpIndicator + HelpRequestModal
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  Sparkles,
  HelpCircle,
  Languages,
  ListRestart,
  Volume2,
  Mic,
  MicOff,
  Square,
} from "lucide-react";
import { ChatMessage, UserProfile } from "../types";
import sound from "../utils/sound";
import { getToken } from "../api/client";
import { checkMicSupport, transcribeBlob } from "../utils/audio";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { ModalShell } from "./ui/ModalShell";

interface Props {
  open: boolean;
  onClose: () => void;
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onMeasured: () => Promise<void>;
}

const SUGGESTED_REPLIES = [
  { emoji: "📝", text: "Cấu trúc đoạn văn hay là gì?" },
  { emoji: "💻", text: "Cho mình vài từ vựng về công nghệ" },
  { emoji: "🎤", text: "Luyện nói về sở thích nhé" },
];

const INITIAL_MSG: ChatMessage = {
  id: "init-1",
  role: "assistant",
  content:
    "Chào bạn! 👋 Mình là bạn AI đồng hành của bạn. Hôm nay mình có thể giúp gì nào? Luyện nói, sửa câu, học từ mới… cứ hỏi mình nhé!",
  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
};

export default function AiChatPopup({
  open,
  onClose,
  profile,
  setProfile,
  onMeasured,
}: Props) {
  // Lazy-mount: chỉ khởi tạo state khi open=true (reset mỗi lần mở)
  if (!open) return null;

  return <AiChatContent
    onClose={onClose}
    profile={profile}
    setProfile={setProfile}
    onMeasured={onMeasured}
  />;
}

/**
 * Inner component — được mount lại mỗi lần open=true (key dựa trên session)
 * → state reset tự động, không cần cleanup logic.
 */
function AiChatContent({
  onClose,
  profile,
  setProfile,
  onMeasured,
}: {
  onClose: () => void;
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onMeasured: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<{
    msgId: string;
    type: "fix" | "suggest" | "translate";
  } | null>(null);
  const [analysisOutputs, setAnalysisOutputs] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useAudioRecorder("ai-popup-voice");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputValue;
    if (!rawText.trim() || isTyping) return;

    sound.playClick();
    setInputValue("");
    setErrorMessage(null);

    const newUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: rawText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      const token = getToken();
      const response = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: updatedMessages, userProfile: profile }),
      });

      if (!response.ok) throw new Error("Không nhận được phản hồi từ AI.");

      const data = await response.json();

      const newBotMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        content:
          data.reply ||
          data.message ||
          "Xin lỗi, mình chưa hiểu. Bạn thử hỏi lại nhé!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, newBotMessage]);
      setProfile({ ...profile, stars: profile.stars + 10 });
    } catch (err: any) {
      console.error("Chat error:", err);
      setErrorMessage(
        err?.message || "AI tạm thời không phản hồi. Bạn thử lại sau nhé!"
      );
    } finally {
      setIsTyping(false);
      onMeasured().catch(() => {});
    }
  };

  const handleAnalyzeMessage = async (
    msg: ChatMessage,
    actionType: "fix" | "suggest" | "translate"
  ) => {
    if (activeAnalysis?.msgId === msg.id && activeAnalysis?.type === actionType) {
      // Toggle off nếu click lại cùng loại
      setActiveAnalysis(null);
      return;
    }
    sound.playClick();
    const storageKey = `${msg.id}-${actionType}`;
    setActiveAnalysis({ msgId: msg.id, type: actionType });

    // Nếu đã có output cached → không gọi lại
    if (analysisOutputs[storageKey]) return;

    try {
      const token = getToken();
      const response = await fetch("/api/tutor/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: actionType, text: msg.content }),
      });

      if (!response.ok) throw new Error("AI tạm thời không phản hồi.");

      const data = await response.json();
      setAnalysisOutputs((prev) => ({
        ...prev,
        [storageKey]: data.analysis || "Chưa có gợi ý nào.",
      }));
    } catch (err: any) {
      console.error("Analysis error:", err);
      setAnalysisOutputs((prev) => ({
        ...prev,
        [storageKey]: "⚠️ Chưa kết nối được AI. Bạn thử lại sau nhé!",
      }));
    }
  };

  const handleSpeakText = (text: string) => {
    sound.speakWord(text.replace(/[*#]/g, ""));
  };

  const handleResetChat = () => {
    sound.playClick();
    if (window.confirm("Bạn muốn bắt đầu cuộc trò chuyện mới?")) {
      const fresh: ChatMessage = {
        ...INITIAL_MSG,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages([fresh]);
      setAnalysisOutputs({});
      setActiveAnalysis(null);
      setErrorMessage(null);
    }
  };

  const handleVoiceInput = async () => {
    if (!checkMicSupport()) {
      setErrorMessage("Trình duyệt không hỗ trợ micro. Bạn hãy gõ tin nhắn nhé!");
      return;
    }
    if (recorder.recording) {
      sound.playClick();
      await recorder.stopRecording();
      const blob = recorder.audioBlobRef.current;
      recorder.reset();
      if (!blob) return;
      setTranscribing(true);
      try {
        const { transcript } = await transcribeBlob(blob);
        if (transcript && transcript.trim()) {
          await handleSendMessage(transcript.trim());
        } else {
          setErrorMessage("Mình không nghe rõ — bạn thử nói lại nhé!");
        }
      } catch (e: any) {
        setErrorMessage(e?.message || "Phiên dịch thất bại, bạn thử lại nhé!");
      } finally {
        setTranscribing(false);
      }
    } else {
      sound.playClick();
      setErrorMessage(null);
      await recorder.startRecording();
    }
  };

  return (
    <ModalShell
      title="🦊 Bạn AI của mình"
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div
        className="flex flex-col h-[70vh] min-h-[420px] rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: "var(--bg-soft)",
          borderColor: "var(--border)",
        }}
      >
        {/* HEADER STRIP */}
        <div
          className="px-3 py-2 flex justify-between items-center border-b"
          style={{
            borderColor: "var(--border-soft)",
            backgroundColor: "var(--bg-elevated)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-base shadow-sm">
              🦊
            </div>
            <p className="text-[11px] font-extrabold" style={{ color: "var(--muted)" }}>
              Gõ hoặc nói — mình cùng luyện tiếng Anh nhé ✨
            </p>
          </div>
          <button
            onClick={handleResetChat}
            className="p-1.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-soft)",
              borderColor: "var(--border)",
              color: "var(--muted)",
            }}
            title="Bắt đầu lại"
          >
            <ListRestart className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ERROR BANNER */}
        {errorMessage && (
          <div
            className="px-3 py-1.5 flex items-center gap-2 text-[11px] border-b"
            style={{
              backgroundColor: "var(--warning-soft)",
              borderColor: "var(--warning)",
              color: "var(--warning)",
            }}
          >
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        {/* MESSAGES */}
        <div className="flex-grow overflow-y-auto p-3 space-y-4">
          {messages.map((msg) => {
            const isBot = msg.role === "assistant";
            const storageKey_fix = `${msg.id}-fix`;
            const storageKey_suggest = `${msg.id}-suggest`;
            const storageKey_translate = `${msg.id}-translate`;

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2 max-w-full ${
                  isBot ? "" : "flex-row-reverse"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 font-extrabold text-xs shadow-sm"
                  style={
                    isBot
                      ? {
                          background: "linear-gradient(135deg, var(--primary), var(--accent))",
                          color: "white",
                        }
                      : {
                          backgroundColor: "var(--secondary)",
                          color: "white",
                        }
                  }
                >
                  {isBot ? "🦊" : profile.name?.slice(0, 1).toUpperCase() || "M"}
                </div>

                <div className="space-y-1 max-w-[80%]">
                  <div
                    className="p-2.5 rounded-2xl text-sm leading-relaxed shadow-sm"
                    style={
                      isBot
                        ? {
                            backgroundColor: "var(--bg-card)",
                            color: "var(--foreground)",
                            borderTopLeftRadius: 4,
                          }
                        : {
                            background: "linear-gradient(135deg, var(--primary), var(--primary-strong))",
                            color: "var(--on-primary)",
                            borderTopRightRadius: 4,
                          }
                    }
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span
                      className="block text-[10px] mt-1"
                      style={{
                        color: isBot ? "var(--muted)" : "rgba(255,255,255,0.7)",
                        textAlign: isBot ? "left" : "right",
                      }}
                    >
                      {msg.timestamp}
                    </span>
                  </div>

                  {/* Action toolbar */}
                  <div
                    className={`flex items-center gap-1 flex-wrap ${
                      isBot ? "justify-start" : "justify-end"
                    }`}
                  >
                    <button
                      onClick={() => handleSpeakText(msg.content)}
                      className="px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border)",
                        color: "var(--muted)",
                      }}
                      title="Nghe đọc"
                    >
                      <Volume2 className="w-2.5 h-2.5" /> Đọc
                    </button>

                    {!isBot && (
                      <button
                        onClick={() => handleAnalyzeMessage(msg, "fix")}
                        className="px-2 py-0.5 rounded-lg border text-[10px] font-extrabold flex items-center gap-1"
                        style={
                          activeAnalysis?.msgId === msg.id && activeAnalysis?.type === "fix"
                            ? {
                                backgroundColor: "var(--primary-soft)",
                                borderColor: "var(--primary)",
                                color: "var(--primary)",
                              }
                            : {
                                backgroundColor: "var(--bg-card)",
                                borderColor: "var(--border)",
                                color: "var(--muted)",
                              }
                        }
                      >
                        <Sparkles className="w-2.5 h-2.5" /> Sửa lỗi
                      </button>
                    )}

                    {isBot && (
                      <button
                        onClick={() => handleAnalyzeMessage(msg, "suggest")}
                        className="px-2 py-0.5 rounded-lg border text-[10px] font-extrabold flex items-center gap-1"
                        style={
                          activeAnalysis?.msgId === msg.id &&
                          activeAnalysis?.type === "suggest"
                            ? {
                                backgroundColor: "var(--accent-soft)",
                                borderColor: "var(--accent)",
                                color: "var(--accent)",
                              }
                            : {
                                backgroundColor: "var(--bg-card)",
                                borderColor: "var(--border)",
                                color: "var(--muted)",
                              }
                        }
                      >
                        <HelpCircle className="w-2.5 h-2.5" /> Gợi ý
                      </button>
                    )}

                    <button
                      onClick={() => handleAnalyzeMessage(msg, "translate")}
                      className="px-2 py-0.5 rounded-lg border text-[10px] font-extrabold flex items-center gap-1"
                      style={
                        activeAnalysis?.msgId === msg.id &&
                        activeAnalysis?.type === "translate"
                          ? {
                              backgroundColor: "var(--warning-soft)",
                              borderColor: "var(--warning)",
                              color: "var(--warning)",
                            }
                          : {
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border)",
                              color: "var(--muted)",
                            }
                      }
                    >
                      <Languages className="w-2.5 h-2.5" /> Dịch
                    </button>
                  </div>

                  {/* Analysis output */}
                  <AnimatePresence>
                    {activeAnalysis?.msgId === msg.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        {activeAnalysis.type === "fix" && analysisOutputs[storageKey_fix] && (
                          <div
                            className="p-2.5 rounded-2xl text-xs leading-relaxed border"
                            style={{
                              backgroundColor: "var(--primary-soft)",
                              borderColor: "var(--primary)",
                              color: "var(--foreground)",
                            }}
                          >
                            <div
                              className="font-extrabold pb-1 mb-1 border-b text-[10px] flex items-center gap-1"
                              style={{ color: "var(--primary)" }}
                            >
                              ✨ Mình góp ý nhé:
                            </div>
                            <p className="whitespace-pre-wrap">
                              {analysisOutputs[storageKey_fix]}
                            </p>
                          </div>
                        )}

                        {activeAnalysis.type === "suggest" &&
                          analysisOutputs[storageKey_suggest] && (
                            <div
                              className="p-2.5 rounded-2xl text-xs leading-relaxed border"
                              style={{
                                backgroundColor: "var(--accent-soft)",
                                borderColor: "var(--accent)",
                                color: "var(--foreground)",
                              }}
                            >
                              <div
                                className="font-extrabold pb-1 mb-1 border-b text-[10px] flex items-center gap-1"
                                style={{ color: "var(--accent)" }}
                              >
                                💡 Gợi ý trả lời:
                              </div>
                              <div className="whitespace-pre-wrap">
                                {analysisOutputs[storageKey_suggest]}
                              </div>
                            </div>
                          )}

                        {activeAnalysis.type === "translate" &&
                          analysisOutputs[storageKey_translate] && (
                            <div
                              className="p-2.5 rounded-2xl text-xs leading-relaxed border italic"
                              style={{
                                backgroundColor: "var(--warning-soft)",
                                borderColor: "var(--warning)",
                                color: "var(--foreground-soft)",
                              }}
                            >
                              <div
                                className="font-extrabold not-italic pb-1 mb-1 text-[10px] uppercase tracking-wider"
                                style={{ color: "var(--warning)" }}
                              >
                                🇻🇳 Tiếng Việt:
                              </div>
                              <p className="whitespace-pre-wrap">
                                &ldquo;{analysisOutputs[storageKey_translate]}&rdquo;
                              </p>
                            </div>
                          )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-start gap-2">
              <div
                className="w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                style={{
                  background: "linear-gradient(135deg, var(--primary), var(--accent))",
                  color: "white",
                }}
              >
                🦊
              </div>
              <div
                className="p-2.5 rounded-2xl text-xs flex items-center gap-2 border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-soft)",
                }}
              >
                <span className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>
                  Bạn AI đang nghĩ
                </span>
                <div className="flex items-center gap-1 h-3">
                  <div className="w-1 h-2.5 rounded-full wave-bar" style={{ backgroundColor: "var(--primary)" }} />
                  <div className="w-1 h-2.5 rounded-full wave-bar" style={{ backgroundColor: "var(--primary)" }} />
                  <div className="w-1 h-2.5 rounded-full wave-bar" style={{ backgroundColor: "var(--primary)" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* SUGGESTED REPLIES */}
        <div
          className="px-3 py-2 border-t flex flex-wrap gap-1.5"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-soft)",
          }}
        >
          {SUGGESTED_REPLIES.map((s) => (
            <button
              key={s.text}
              onClick={() => handleSendMessage(s.text)}
              className="text-[11px] font-bold rounded-full px-2.5 py-1 border"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border)",
                color: "var(--foreground-soft)",
              }}
            >
              {s.emoji} {s.text}
            </button>
          ))}
        </div>

        {/* INPUT */}
        <div
          className="p-2.5 border-t flex gap-1.5 items-center"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: "var(--border-soft)",
          }}
        >
          {checkMicSupport() ? (
            <button
              onClick={handleVoiceInput}
              disabled={isTyping || transcribing}
              title={recorder.recording ? "Dừng thu (sẽ tự gửi)" : "Nói thay vì gõ"}
              className="p-2 rounded-xl shrink-0 flex items-center justify-center disabled:opacity-50"
              style={
                recorder.recording
                  ? {
                      backgroundColor: "var(--danger, var(--warning))",
                      color: "var(--on-primary, white)",
                      animation: "pulse 1.4s ease-in-out infinite",
                    }
                  : {
                      backgroundColor: "var(--bg-soft)",
                      color: "var(--muted)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {recorder.recording ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <div
              className="p-2 rounded-xl shrink-0 flex items-center justify-center"
              title="Trình duyệt không hỗ trợ micro"
              style={{
                backgroundColor: "var(--bg-soft)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
                opacity: 0.5,
              }}
            >
              <MicOff className="w-3.5 h-3.5" />
            </div>
          )}

          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendMessage();
            }}
            placeholder={
              recorder.recording
                ? "🎙️ Đang nghe..."
                : transcribing
                  ? "🦉 Đang phiên dịch..."
                  : "Nhập câu tiếng Anh của bạn…"
            }
            disabled={isTyping || transcribing || recorder.recording}
            className="flex-grow rounded-xl px-3 py-2 text-sm disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-soft)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isTyping || recorder.recording || transcribing}
            className="p-2 rounded-xl shrink-0 flex items-center justify-center disabled:opacity-50"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--on-primary)",
            }}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Recording indicator */}
        {recorder.recording && (
          <div
            className="px-3 py-1 flex items-center justify-center gap-2 text-[10px] border-t"
            style={{
              backgroundColor: "var(--danger-soft, var(--warning-soft))",
              borderColor: "var(--border-soft)",
              color: "var(--danger, var(--warning))",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--danger, var(--warning))" }}
            />
            <span className="font-extrabold">
              🎙️ Đang thu âm — {(recorder.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
