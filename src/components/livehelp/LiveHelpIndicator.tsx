/**
 * src/components/livehelp/LiveHelpIndicator.tsx
 *
 * Floating widget góc dưới phải màn hình — chỉ dành cho HS.
 *
 * States:
 *  - idle: nút tròn "🆘 Cần hỗ trợ" (pulse nhẹ nếu đang trong bài)
 *  - active: badge "🟢 GV đang hỗ trợ bạn" + click mở LiveHelpModal
 *
 * Click → mở HelpRequestModal (nếu không có session) hoặc LiveHelpModal (nếu đã có).
 *
 * Step 12d P3: cũng lắng nghe `observe:incoming` (GV muốn observe) + mount
 * ObserveIncomingModal + ObservePassiveView (khi HS đã accept).
 *
 * Stale session recovery: nếu nhận `call:peer-left` cho 1 passive observe
 * session mà KHÔNG có `observe:ended` trước → tự emit `observe:end` để
 * server cleanup (GV đã đóng tab mà không cleanup).
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { useLiveHelp } from "./hooks/useLiveHelp";
import { useLiveHelpSocket } from "./hooks/useLiveHelpSocket";
import { HelpRequestModal } from "./HelpRequestModal";
import { LiveHelpModal } from "./LiveHelpModal";
import { ObserveIncomingModal } from "./ObserveIncomingModal";
import { ObservePassiveView } from "./ObservePassiveView";
import type { ObserveIncomingEvent } from "./hooks/useLiveHelpSocket";

export function LiveHelpIndicator() {
  const { activeSession } = useLiveHelp();
  const [showRequest, setShowRequest] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Step 12d P3: observe mode state
  const [incomingObserve, setIncomingObserve] = useState<ObserveIncomingEvent | null>(null);
  const [passiveObserveSessionId, setPassiveObserveSessionId] = useState<string | null>(null);
  // Track teacher name separately because we clear `incomingObserve` on accept
  // (modal đóng), nhưng vẫn cần hiển thị tên GV trong passive view.
  const [passiveTeacherName, setPassiveTeacherName] = useState<string>("GV");

  const handleClick = () => {
    if (activeSession) {
      setShowChat(true);
    } else {
      setShowRequest(true);
    }
  };

  // ---- Observe socket listeners ----
  const { socket, emitObserveEnd } = useLiveHelpSocket({
    onObserveIncoming: (e) => {
      // HS mới nhận offer → show modal
      setIncomingObserve(e);
    },
    onObserveEnded: () => {
      // Cả 2 phía kết thúc → clear local state
      setIncomingObserve(null);
      setPassiveObserveSessionId(null);
    },
    onCallPeerLeft: (e) => {
      // Stale recovery: peer (GV) dropped mà không emit observe:end.
      // HS tự cleanup để DB không kẹt ở status='active'.
      if (e.sessionId === passiveObserveSessionId && e.role === "teacher") {
        console.log("[LiveHelpIndicator] stale recovery: GV dropped, emitting observe:end");
        emitObserveEnd(e.sessionId, "teacher_left");
        setPassiveObserveSessionId(null);
      }
    },
  });

  // Track teacher name across accept — modal close clears incomingObserve.
  useEffect(() => {
    if (incomingObserve) {
      setPassiveTeacherName(incomingObserve.teacher_name || "GV");
    }
  }, [incomingObserve]);

  const handleAcceptObserve = (sessionId: string) => {
    socket?.emit("observe:accept", { sessionId });
    setIncomingObserve(null);
    setPassiveObserveSessionId(sessionId);
  };

  const handleRejectObserve = (sessionId: string) => {
    socket?.emit("observe:reject", { sessionId });
    setIncomingObserve(null);
  };

  return (
    <>
      <motion.button
        onClick={handleClick}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-20 right-4 z-40 rounded-full shadow-2xl flex items-center gap-2 px-4 py-3 font-extrabold text-xs"
        style={{
          backgroundColor: activeSession ? "var(--success)" : "var(--primary)",
          color: "#fff",
        }}
        title={activeSession ? "GV đang hỗ trợ bạn — click để xem" : "Cần hỗ trợ? Click để gửi yêu cầu"}
      >
        {activeSession ? (
          <>
            <MessageCircle className="w-4 h-4" />
            <span>GV đang hỗ trợ</span>
            <span
              className="w-2 h-2 rounded-full bg-white animate-pulse"
              style={{ animationDuration: "1.5s" }}
            />
          </>
        ) : (
          <>
            <LifeBuoy className="w-4 h-4" />
            <span>Cần hỗ trợ?</span>
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {showRequest && (
          <HelpRequestModal
            onClose={() => setShowRequest(false)}
            onCreated={() => {
              setShowRequest(false);
              setShowChat(true); // mở luôn chat để HS chờ
            }}
          />
        )}
        {showChat && <LiveHelpModal onClose={() => setShowChat(false)} />}
        {incomingObserve && (
          <ObserveIncomingModal
            payload={incomingObserve}
            onAccept={handleAcceptObserve}
            onReject={handleRejectObserve}
          />
        )}
        {passiveObserveSessionId && (
          <ObservePassiveView
            socket={socket}
            sessionId={passiveObserveSessionId}
            teacherName={passiveTeacherName}
            onEnd={() => setPassiveObserveSessionId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}