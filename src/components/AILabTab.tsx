import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, 
  Sparkles, 
  CheckCircle, 
  HelpCircle, 
  Languages, 
  RotateCcw, 
  AlertCircle, 
  UserSquare2, 
  Bot, 
  Check, 
  Volume2,
  ListRestart
} from "lucide-react";
import { ChatMessage, UserProfile } from "../types";
import sound from "../utils/sound";

interface AILabTabProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
}

export default function AILabTab({ profile, setProfile }: AILabTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      role: "assistant",
      content: "Hello! I am your Apex AI Tutor. Welcome to the Deep Focus Lab. What English topic would you like to discuss today? We can practice free chat, draft a college admission essay, or dive into SAT word training.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<{ msgId: string; type: "fix" | "suggest" | "translate" } | null>(null);
  const [analysisOutputs, setAnalysisOutputs] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
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
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      // Call server proxy route
      const response = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          userProfile: profile
        })
      });

      if (!response.ok) {
        throw new Error("Không thể nhận phản hồi từ máy chủ AI.");
      }

      const data = await response.json();
      
      const newBotMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        content: data.text || "I was unable to formulate a response. Let us try reformulating your statement.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, newBotMessage]);

      // Inc stats
      const updatedProfile = {
        ...profile,
        stars: profile.stars + 10,
        stats: {
          ...profile.stats,
          chatsCompleted: profile.stats.chatsCompleted + 1,
          dailyGoalProgress: Math.min(100, profile.stats.dailyGoalProgress + 15)
        }
      };
      setProfile(updatedProfile);

    } catch (err: any) {
      console.error("Chat fetch error:", err);
      setErrorMessage("Đã xảy ra sự cố kết nối máy chủ AI Tutor. Đang chạy offline helper panel.");
      
      // Local backup answering
      setTimeout(() => {
        const backupMessage: ChatMessage = {
          id: `bot-backup-${Date.now()}`,
          role: "assistant",
          content: "As your backup offline mentor, that sounds fantastic! (Note: Connect your GEMINI_API_KEY in Secrets context to activate advanced dynamic conversational capabilities!)",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, backupMessage]);
      }, 1000);

    } finally {
      setIsTyping(false);
    }
  };

  // Sửa lỗi / Gợi ý / Dịch helper triggers
  const handleAnalyzeMessage = async (msg: ChatMessage, actionType: "fix" | "suggest" | "translate") => {
    sound.playClick();
    const storageKey = `${msg.id}-${actionType}`;

    // If already open, close the analysis popover
    if (activeAnalysis?.msgId === msg.id && activeAnalysis?.type === actionType) {
      setActiveAnalysis(null);
      return;
    }

    if (analysisOutputs[storageKey]) {
      setActiveAnalysis({ msgId: msg.id, type: actionType });
      return;
    }

    setActiveAnalysis({ msgId: msg.id, type: actionType });
    setAnalysisOutputs(prev => ({ ...prev, [storageKey]: "Đang phân tích dữ liệu lượng tử..." }));

    try {
      const response = await fetch("/api/tutor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionType,
          text: msg.content
        })
      });

      if (!response.ok) {
        throw new Error("Không thể kết nối máy chủ phân tích của AI.");
      }

      const data = await response.json();
      setAnalysisOutputs(prev => ({
        ...prev,
        [storageKey]: data.analysis || "Không có nhận xét."
      }));

    } catch (err: any) {
      console.error("Analysis error:", err);
      setAnalysisOutputs(prev => ({
        ...prev,
        [storageKey]: "⚠️ Không thể phân tích ngoại tuyến. Vui lòng kiểm tra phím GEMINI_API_KEY."
      }));
    }
  };

  const handleSpeakText = (text: string) => {
    sound.speakWord(text.replace(/[*#]/g, ""));
  };

  const handleResetChat = () => {
    sound.playClick();
    if (window.confirm("Bạn có chắc chắn muốn làm mới phòng thoại AI?")) {
      setMessages([
        {
          id: "init-1",
          role: "assistant",
          content: "Hello! I am your Apex AI Tutor. Welcome to the Deep Focus Lab. What English topic would you like to discuss today? We can practice free chat, draft a college admission essay, or dive into SAT word training.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setAnalysisOutputs({});
      setActiveAnalysis(null);
      setErrorMessage(null);
    }
  };

  return (
    <div id="ai-lab-workspace" className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-[#0E1321] rounded-3xl border border-slate-800/90 overflow-hidden shadow-2xl relative">
      <div className="absolute inset-x-0 h-40 bg-gradient-to-b from-teal-500/5 to-transparent pointer-events-none" />

      {/* AI Lab Header */}
      <div className="bg-[#12192B]/90 border-b border-slate-800/80 px-4 py-3.5 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-500 to-teal-400 p-[1.5px]">
            <div className="w-full h-full rounded-[10.5px] bg-[#0F1321] flex items-center justify-center">
              <Bot className="w-5 h-5 text-teal-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-black text-white tracking-tight">Apex AI Chat Tutor</h3>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Notion AI-inspired Deep-Work Workspace • Model: gemini-3.5-flash</p>
          </div>
        </div>

        <button
          onClick={handleResetChat}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors cursor-pointer"
          title="Làm mới cuộc thoại"
        >
          <ListRestart className="w-4 h-4" />
        </button>
      </div>

      {/* Error / Warning Alert Banner */}
      {errorMessage && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-amber-500 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Chat messages feed */}
      <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-thin relative z-10">
        {messages.map((msg) => {
          const isBot = msg.role === "assistant";
          const storageKey_fix = `${msg.id}-fix`;
          const storageKey_suggest = `${msg.id}-suggest`;
          const storageKey_translate = `${msg.id}-translate`;

          return (
            <div 
              key={msg.id}
              className={`flex items-start gap-3 max-w-full ${isBot ? "" : "flex-row-reverse"}`}
            >
              {/* Initials badge */}
              <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center shrink-0 font-extrabold text-xs border ${
                isBot 
                  ? "bg-slate-900 border-slate-800 text-teal-400" 
                  : "bg-gradient-to-tr from-indigo-500 to-indigo-600 border-slate-800 text-white"
              }`}>
                {isBot ? "AI" : (profile.name ? profile.name.slice(0,2).toUpperCase() : "ME")}
              </div>

              {/* Message Bubble Block */}
              <div className="space-y-2 max-w-xl md:max-w-2xl">
                <div className={`p-4 rounded-3xl text-sm leading-relaxed ${
                  isBot 
                    ? "bg-[#111726]/90 border border-slate-800/80 text-slate-250 rounded-tl-sm" 
                    : "bg-indigo-600 text-white rounded-tr-sm"
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  
                  {/* Subtle date tracker */}
                  <span className={`block text-[9px] mt-2 font-mono ${isBot ? "text-slate-500 text-left" : "text-indigo-300 text-right"}`}>
                    {msg.timestamp}
                  </span>
                </div>

                {/* Notion AI Coach Toolbar - Sát bubble */}
                <div className={`flex items-center gap-1.5 ${isBot ? "justify-start" : "justify-end"}`}>
                  
                  {/* Speech Trigger */}
                  <button
                    onClick={() => handleSpeakText(msg.content)}
                    className="p-1 px-2 hover:bg-slate-850 bg-slate-900/50 border border-slate-800/50 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                    title="Đọc to câu văn này"
                  >
                    <Volume2 className="w-3 h-3" /> Nói
                  </button>

                  {/* Sửa Lỗi (Only for User message) */}
                  {!isBot && (
                    <button
                      onClick={() => handleAnalyzeMessage(msg, "fix")}
                      className={`p-1 px-2 bg-slate-900/50 border rounded-lg text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1 ${
                        activeAnalysis?.msgId === msg.id && activeAnalysis?.type === "fix"
                          ? "border-teal-505 bg-teal-500/10 text-teal-300"
                          : "border-slate-800/50 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-teal-400" /> Sửa lỗi
                    </button>
                  )}

                  {/* Gợi Ý (Only for Bot response) */}
                  {isBot && (
                    <button
                      onClick={() => handleAnalyzeMessage(msg, "suggest")}
                      className={`p-1 px-2 bg-slate-900/50 border rounded-lg text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1 ${
                        activeAnalysis?.msgId === msg.id && activeAnalysis?.type === "suggest"
                          ? "border-violet-505 bg-violet-500/10 text-violet-300"
                          : "border-slate-800/50 text-slate-400 hover:text-white"
                      }`}
                    >
                      <HelpCircle className="w-3 h-3 text-violet-400" /> Gợi ý trả lời
                    </button>
                  )}

                  {/* Dịch (Available for both) */}
                  <button
                    onClick={() => handleAnalyzeMessage(msg, "translate")}
                    className={`p-1 px-2 bg-slate-900/50 border rounded-lg text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1 ${
                      activeAnalysis?.msgId === msg.id && activeAnalysis?.type === "translate"
                        ? "border-amber-505 bg-amber-500/10 text-amber-300"
                        : "border-slate-800/50 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Languages className="w-3 h-3 text-amber-500" /> Dịch nghĩa
                  </button>

                </div>

                {/* Inline Analysis result block using monospaced layout */}
                <AnimatePresence>
                  {activeAnalysis?.msgId === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {activeAnalysis.type === "fix" && analysisOutputs[storageKey_fix] && (
                        <div className="bg-[#121B27] border border-teal-500/20 p-4 rounded-2xl text-[12px] text-slate-200 mt-2 space-y-2 font-mono leading-relaxed max-w-full select-text shadow-lg">
                          <div className="flex items-center gap-1 text-teal-400 font-extrabold pb-1 border-b border-teal-500/10">
                            🔍 PHÂN TÍCH LÝ THUYẾT & NGỮ PHÁP (MONO):
                          </div>
                          <p className="whitespace-pre-wrap">{analysisOutputs[storageKey_fix]}</p>
                        </div>
                      )}

                      {activeAnalysis.type === "suggest" && analysisOutputs[storageKey_suggest] && (
                        <div className="bg-[#161224] border border-violet-500/20 p-4 rounded-2xl text-[12px] text-slate-200 mt-2 space-y-2.5 font-mono leading-relaxed max-w-full select-text shadow-lg">
                          <div className="flex items-center gap-1 text-violet-400 font-extrabold pb-1 border-b border-violet-500/10">
                            💡 KIẾN NGHỊ BẮT NHỊP ĐÀM THOẠI:
                          </div>
                          <div className="whitespace-pre-wrap">{analysisOutputs[storageKey_suggest]}</div>
                          <p className="text-[10px] text-slate-400 font-sans italic pt-1 border-t border-slate-800/50">
                            *Click chuột sao chép các phản hồi trên đắp vào ô nhập văn bản để luyện tập hiệu quả!*
                          </p>
                        </div>
                      )}

                      {activeAnalysis.type === "translate" && analysisOutputs[storageKey_translate] && (
                        <div className="bg-yellow-500/5 border border-yellow-500/20 p-3.5 rounded-xl text-xs text-slate-350 italic mt-2 leading-relaxed">
                          <div className="text-[10px] font-black text-amber-500 uppercase font-sans tracking-widest pb-1">BẢN DỊCH VIỆT NGỮ:</div>
                          <p className="whitespace-pre-wrap text-slate-300 font-medium">"{analysisOutputs[storageKey_translate]}"</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </div>
          );
        })}

        {/* AI Thinking Waveform loader */}
        {isTyping && (
          <div className="flex items-start gap-3">
            <div className="w-8.5 h-8.5 rounded-xl bg-slate-900 border border-slate-800 text-teal-400 flex items-center justify-center font-bold text-xs select-none">
              AI
            </div>
            <div className="bg-[#111726] border border-slate-800/80 rounded-3xl rounded-tl-sm p-4 text-sm max-w-sm flex items-center gap-3">
              <span className="text-xs font-bold text-[#6D7A94]">AI đang tính toán</span>
              <div className="flex items-center gap-1 h-3.5 mt-0.5">
                <div className="w-1 h-3 bg-teal-400 rounded-full wave-bar" />
                <div className="w-1 h-3 bg-teal-400 rounded-full wave-bar" />
                <div className="w-1 h-3 bg-teal-400 rounded-full wave-bar" />
                <div className="w-1 h-3 bg-teal-400 rounded-full wave-bar" />
                <div className="w-1 h-3 bg-teal-400 rounded-full wave-bar" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Fast-reply buttons inside chat container */}
      <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-900/60 relative z-10 flex flex-wrap gap-2">
        <button
          onClick={() => handleSendMessage("Could you explain how to structure a PEEL academic paragraph?")}
          className="text-[10px] font-bold bg-[#141B2E] hover:bg-[#18233D] rounded-full px-3 py-1.5 border border-slate-800 text-slate-300 transition-colors cursor-pointer select-none"
        >
          📝 Làm sao cấu trúc đoạn PEEL?
        </button>
        <button
          onClick={() => handleSendMessage("Suggest some high-scoring vocabulary words for speaking about technological advancements.")}
          className="text-[10px] font-bold bg-[#141B2E] hover:bg-[#18233D] rounded-full px-3 py-1.5 border border-slate-800 text-slate-300 transition-colors cursor-pointer select-none"
        >
          💻 Từ vựng IELTS chủ đề Tech nâng cao?
        </button>
      </div>

      {/* Input bar */}
      <div className="bg-[#12192B]/95 border-t border-slate-800/80 p-4 relative z-10 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendMessage();
          }}
          placeholder="Nhập đại ý tranh biện, câu văn của bạn tại đây..."
          disabled={isTyping}
          className="flex-grow bg-slate-950/90 border border-slate-800 placeholder-slate-500 rounded-xl px-4 py-3.5 text-xs text-white placeholder:text-[11px] focus:border-teal-500/50 transition-colors disabled:opacity-50"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputValue.trim() || isTyping}
          className="p-3.5 bg-teal-500 hover:bg-teal-400 disabled:bg-slate-800 text-[#090D16] disabled:text-slate-600 rounded-xl hover:scale-102 active:scale-98 transition-all shrink-0 cursor-pointer flex items-center justify-center select-none"
        >
          <Send className="w-4 h-4 text-[#090D16]" />
        </button>
      </div>

    </div>
  );
}
