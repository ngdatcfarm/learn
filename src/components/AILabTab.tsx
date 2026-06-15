import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  Sparkles,
  HelpCircle,
  Languages,
  ListRestart,
  Bot,
  Volume2,
} from "lucide-react";
import { ChatMessage, UserProfile } from "../types";
import sound from "../utils/sound";
import { getToken, recordMeasurement, trackEvent } from "../api/client";

interface AILabTabProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onMeasured: () => Promise<void>;
}

export default function AILabTab({ profile, setProfile, onMeasured }: AILabTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      role: "assistant",
      content:
        "Chào bạn! 👋 Mình là bạn AI đồng hành của bạn. Hôm nay mình có thể giúp gì nào? Luyện nói, sửa câu, học từ mới… cứ hỏi mình nhé!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<{ msgId: string; type: "fix" | "suggest" | "translate" } | null>(null);
  const [analysisOutputs, setAnalysisOutputs] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        content: data.text || "Mình chưa nghĩ ra câu trả lời, bạn thử lại nhé!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, newBotMessage]);

      // Optimistic +stars (client-side gamification, instant feedback)
      setProfile({ ...profile, stars: profile.stars + 10 });

      // Server: mỗi lượt chat = 1 attempt speak + 1 vocabActiveUse
      void Promise.allSettled([
        recordMeasurement({ skill: "speak", metric: "speakFluency", value: 1 }),
        recordMeasurement({ skill: "learn", metric: "vocabActiveUse", value: 1 }),
        trackEvent("task_done"),
      ])
        .then(() => onMeasured())
        .catch((e) => console.warn("AILab measurement failed:", e));
    } catch (err: any) {
      console.error("Chat fetch error:", err);
      setErrorMessage("Mất kết nối với AI rồi 😅 — mình đang dùng chế độ offline tạm thời nhé.");

      setTimeout(() => {
        const backupMessage: ChatMessage = {
          id: `bot-backup-${Date.now()}`,
          role: "assistant",
          content:
            "Câu hỏi hay đấy! (Gợi ý: thêm GEMINI_API_KEY vào file .env.local để mình trả lời chi tiết hơn nhé 💡)",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, backupMessage]);
      }, 1000);
    } finally {
      setIsTyping(false);
    }
  };

  const handleAnalyzeMessage = async (msg: ChatMessage, actionType: "fix" | "suggest" | "translate") => {
    sound.playClick();
    const storageKey = `${msg.id}-${actionType}`;

    if (activeAnalysis?.msgId === msg.id && activeAnalysis?.type === actionType) {
      setActiveAnalysis(null);
      return;
    }

    if (analysisOutputs[storageKey]) {
      setActiveAnalysis({ msgId: msg.id, type: actionType });
      return;
    }

    setActiveAnalysis({ msgId: msg.id, type: actionType });
    setAnalysisOutputs((prev) => ({ ...prev, [storageKey]: "Mình đang xem nhé..." }));

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
      setMessages([
        {
          id: "init-1",
          role: "assistant",
          content:
            "Chào bạn! 👋 Mình là bạn AI đồng hành của bạn. Hôm nay mình có thể giúp gì nào? Luyện nói, sửa câu, học từ mới… cứ hỏi mình nhé!",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setAnalysisOutputs({});
      setActiveAnalysis(null);
      setErrorMessage(null);
    }
  };

  return (
    <div
      className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-160px)] min-h-[500px] rounded-3xl border overflow-hidden shadow-lg relative"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      {/* HEADER */}
      <div
        className="px-4 py-3.5 flex justify-between items-center border-b relative"
        style={{
          borderColor: "var(--border-soft)",
          backgroundColor: "var(--bg-elevated)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="floaty w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-xl shadow-sm">
            🦊
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold tracking-tight">Bạn AI của mình</h3>
              <span className="w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: "var(--success)" }} />
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
              Sẵn sàng giúp bạn luyện tiếng Anh ✨
            </p>
          </div>
        </div>

        <button
          onClick={handleResetChat}
          className="p-2 rounded-xl border transition-colors"
          style={{
            backgroundColor: "var(--bg-soft)",
            borderColor: "var(--border)",
            color: "var(--muted)",
          }}
          title="Bắt đầu lại"
        >
          <ListRestart className="w-4 h-4" />
        </button>
      </div>

      {/* ERROR BANNER */}
      {errorMessage && (
        <div
          className="px-4 py-2 flex items-center gap-2 text-xs border-b"
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
      <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-5">
        {messages.map((msg) => {
          const isBot = msg.role === "assistant";
          const storageKey_fix = `${msg.id}-fix`;
          const storageKey_suggest = `${msg.id}-suggest`;
          const storageKey_translate = `${msg.id}-translate`;

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 max-w-full ${isBot ? "" : "flex-row-reverse"}`}
            >
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-extrabold text-sm shadow-sm"
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
                {isBot ? "🦊" : (profile.name ? profile.name.slice(0, 1).toUpperCase() : "M")}
              </div>

              {/* Bubble + actions */}
              <div className="space-y-1.5 max-w-[80%]">
                <div
                  className="p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm"
                  style={
                    isBot
                      ? {
                          backgroundColor: "var(--bg-soft)",
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
                    className="block text-[10px] mt-1.5"
                    style={{
                      color: isBot ? "var(--muted)" : "rgba(255,255,255,0.7)",
                      textAlign: isBot ? "left" : "right",
                    }}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {/* Action toolbar */}
                <div className={`flex items-center gap-1.5 flex-wrap ${isBot ? "justify-start" : "justify-end"}`}>
                  <button
                    onClick={() => handleSpeakText(msg.content)}
                    className="px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors"
                    style={{
                      backgroundColor: "var(--bg-soft)",
                      borderColor: "var(--border)",
                      color: "var(--muted)",
                    }}
                    title="Nghe đọc"
                  >
                    <Volume2 className="w-3 h-3" /> Đọc
                  </button>

                  {!isBot && (
                    <button
                      onClick={() => handleAnalyzeMessage(msg, "fix")}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-extrabold flex items-center gap-1 transition-colors"
                      style={
                        activeAnalysis?.msgId === msg.id && activeAnalysis?.type === "fix"
                          ? {
                              backgroundColor: "var(--primary-soft)",
                              borderColor: "var(--primary)",
                              color: "var(--primary)",
                            }
                          : {
                              backgroundColor: "var(--bg-soft)",
                              borderColor: "var(--border)",
                              color: "var(--muted)",
                            }
                      }
                    >
                      <Sparkles className="w-3 h-3" style={{ color: "var(--primary)" }} /> Sửa lỗi
                    </button>
                  )}

                  {isBot && (
                    <button
                      onClick={() => handleAnalyzeMessage(msg, "suggest")}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-extrabold flex items-center gap-1 transition-colors"
                      style={
                        activeAnalysis?.msgId === msg.id && activeAnalysis?.type === "suggest"
                          ? {
                              backgroundColor: "var(--accent-soft)",
                              borderColor: "var(--accent)",
                              color: "var(--accent)",
                            }
                          : {
                              backgroundColor: "var(--bg-soft)",
                              borderColor: "var(--border)",
                              color: "var(--muted)",
                            }
                      }
                    >
                      <HelpCircle className="w-3 h-3" style={{ color: "var(--accent)" }} /> Gợi ý trả lời
                    </button>
                  )}

                  <button
                    onClick={() => handleAnalyzeMessage(msg, "translate")}
                    className="px-2.5 py-1 rounded-lg border text-[11px] font-extrabold flex items-center gap-1 transition-colors"
                    style={
                      activeAnalysis?.msgId === msg.id && activeAnalysis?.type === "translate"
                        ? {
                            backgroundColor: "var(--warning-soft)",
                            borderColor: "var(--warning)",
                            color: "var(--warning)",
                          }
                        : {
                            backgroundColor: "var(--bg-soft)",
                            borderColor: "var(--border)",
                            color: "var(--muted)",
                          }
                    }
                  >
                    <Languages className="w-3 h-3" style={{ color: "var(--warning)" }} /> Dịch
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
                          className="p-4 rounded-2xl text-sm leading-relaxed border"
                          style={{
                            backgroundColor: "var(--primary-soft)",
                            borderColor: "var(--primary)",
                            color: "var(--foreground)",
                          }}
                        >
                          <div
                            className="font-extrabold pb-1 mb-1 border-b text-xs flex items-center gap-1"
                            style={{
                              color: "var(--primary)",
                              borderColor: "var(--primary)",
                            }}
                          >
                            ✨ Mình góp ý nhé:
                          </div>
                          <p className="whitespace-pre-wrap">{analysisOutputs[storageKey_fix]}</p>
                        </div>
                      )}

                      {activeAnalysis.type === "suggest" && analysisOutputs[storageKey_suggest] && (
                        <div
                          className="p-4 rounded-2xl text-sm leading-relaxed border"
                          style={{
                            backgroundColor: "var(--accent-soft)",
                            borderColor: "var(--accent)",
                            color: "var(--foreground)",
                          }}
                        >
                          <div
                            className="font-extrabold pb-1 mb-1 border-b text-xs flex items-center gap-1"
                            style={{
                              color: "var(--accent)",
                              borderColor: "var(--accent)",
                            }}
                          >
                            💡 Gợi ý trả lời:
                          </div>
                          <div className="whitespace-pre-wrap">{analysisOutputs[storageKey_suggest]}</div>
                        </div>
                      )}

                      {activeAnalysis.type === "translate" && analysisOutputs[storageKey_translate] && (
                        <div
                          className="p-4 rounded-2xl text-sm leading-relaxed border italic"
                          style={{
                            backgroundColor: "var(--warning-soft)",
                            borderColor: "var(--warning)",
                            color: "var(--foreground-soft)",
                          }}
                        >
                          <div
                            className="font-extrabold not-italic pb-1 mb-1 text-xs uppercase tracking-wider"
                            style={{ color: "var(--warning)" }}
                          >
                            🇻🇳 Tiếng Việt:
                          </div>
                          <p className="whitespace-pre-wrap">"{analysisOutputs[storageKey_translate]}"</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}

        {/* TYPING */}
        {isTyping && (
          <div className="flex items-start gap-2.5">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
              style={{
                background: "linear-gradient(135deg, var(--primary), var(--accent))",
                color: "white",
              }}
            >
              🦊
            </div>
            <div
              className="p-3.5 rounded-2xl text-sm flex items-center gap-2 border"
              style={{
                backgroundColor: "var(--bg-soft)",
                borderColor: "var(--border-soft)",
              }}
            >
              <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>
                Bạn AI đang nghĩ
              </span>
              <div className="flex items-center gap-1 h-3.5">
                <div className="w-1 h-3 rounded-full wave-bar" style={{ backgroundColor: "var(--primary)" }} />
                <div className="w-1 h-3 rounded-full wave-bar" style={{ backgroundColor: "var(--primary)" }} />
                <div className="w-1 h-3 rounded-full wave-bar" style={{ backgroundColor: "var(--primary)" }} />
                <div className="w-1 h-3 rounded-full wave-bar" style={{ backgroundColor: "var(--primary)" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* SUGGESTED REPLIES */}
      <div
        className="px-4 py-2 border-t flex flex-wrap gap-2"
        style={{
          backgroundColor: "var(--bg-soft)",
          borderColor: "var(--border-soft)",
        }}
      >
        {[
          { emoji: "📝", text: "Cấu trúc đoạn văn hay là gì?" },
          { emoji: "💻", text: "Cho mình vài từ vựng về công nghệ" },
          { emoji: "🎤", text: "Luyện nói về sở thích nhé" },
        ].map((s) => (
          <button
            key={s.text}
            onClick={() => handleSendMessage(s.text)}
            className="text-xs font-bold rounded-full px-3 py-1.5 border transition-colors"
            style={{
              backgroundColor: "var(--bg-card)",
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
        className="p-3 border-t flex gap-2"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-soft)",
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendMessage();
          }}
          placeholder="Nhập câu tiếng Anh của bạn…"
          disabled={isTyping}
          className="flex-grow rounded-xl px-4 py-3 text-sm transition-colors disabled:opacity-50"
          style={{
            backgroundColor: "var(--bg-soft)",
            borderColor: "var(--border)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputValue.trim() || isTyping}
          className="p-3 rounded-xl transition-all shrink-0 flex items-center justify-center disabled:opacity-50"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--on-primary)",
          }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
