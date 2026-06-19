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
 */

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { useLiveHelp } from "./hooks/useLiveHelp";
import { HelpRequestModal } from "./HelpRequestModal";
import { LiveHelpModal } from "./LiveHelpModal";

export function LiveHelpIndicator() {
  const { activeSession } = useLiveHelp();
  const [showRequest, setShowRequest] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const handleClick = () => {
    if (activeSession) {
      setShowChat(true);
    } else {
      setShowRequest(true);
    }
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
      </AnimatePresence>
    </>
  );
}