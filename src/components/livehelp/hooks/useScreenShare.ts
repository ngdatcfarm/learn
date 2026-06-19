/**
 * src/components/livehelp/hooks/useScreenShare.ts
 *
 * Step 12c Phase 2 — P2P screen share via getDisplayMedia + simple-peer.
 *
 * Chỉ HS mới share được (GV chỉ nhận). Signaling events (từ server):
 *  - call:screen-offer   {sessionId, sdp, from, from_role}
 *  - call:screen-answer  {sessionId, sdp, from, from_role}
 *  - call:screen-ice     {sessionId, candidate, from, from_role}
 *  - call:screen-stop    {sessionId, from, from_role}
 *  - call:peer-left      {sessionId, user_id, role} (dùng chung từ useVoiceCall)
 *
 * Lifecycle:
 *  - HS: idle → startShare() → getDisplayMedia() → requesting → connected
 *  - HS: stopShare() hoặc track ended (browser "Stop sharing") → stopped
 *  - GV: idle → receive offer → auto-create peer → connected (render video)
 *  - GV: receive stop → stopped
 *
 * Browser behavior: khi HS click "Stop sharing" trong browser chrome (tab dưới),
 * track ended event fires → hook tự stopShare() → emit call:screen-stop cho GV.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import SimplePeer from "simple-peer";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type ScreenShareStatus = "idle" | "requesting" | "connected" | "stopped" | "error";

export interface UseScreenShareOptions {
  socket: Socket | null;
  sessionId?: string;
  /** true = HS (cho phép start/stop), false = GV (chỉ nhận). */
  isInitiator: boolean;
}

export interface UseScreenShareReturn {
  status: ScreenShareStatus;
  error: string | null;
  /** Local stream (HS self-view, sau khi getDisplayMedia). */
  localStream: MediaStream | null;
  /** Remote stream (GV side nhận). */
  remoteStream: MediaStream | null;
  /** HS bắt đầu share — gọi khi click "Chia sẻ màn hình". */
  startShare: () => Promise<void>;
  /** HS dừng share. */
  stopShare: () => void;
}

export function useScreenShare({
  socket,
  sessionId,
  isInitiator,
}: UseScreenShareOptions): UseScreenShareReturn {
  const [status, setStatus] = useState<ScreenShareStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // ============================================================
  // Cleanup
  // ============================================================
  const cleanup = useCallback((emitStop: boolean) => {
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (emitStop && socket && sessionId) {
      socket.emit("call:screen-stop", { sessionId });
    }
    setRemoteStream(null);
    setLocalStream(null);
  }, [socket, sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // Create peer
  // ============================================================
  const createPeer = useCallback(
    (initiator: boolean, stream?: MediaStream): SimplePeer.Instance => {
      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream,
        config: { iceServers: ICE_SERVERS },
      });

      peer.on("signal", (data) => {
        if (!socket || !sessionId) return;
        if (data.type === "offer") {
          socket.emit("call:screen-offer", { sessionId, sdp: data });
        } else if (data.type === "answer") {
          socket.emit("call:screen-answer", { sessionId, sdp: data });
        } else if ("candidate" in data && data.candidate) {
          socket.emit("call:screen-ice", { sessionId, candidate: data });
        }
      });

      peer.on("connect", () => {
        setStatus("connected");
      });

      peer.on("stream", (remote) => {
        setRemoteStream(remote);
        // GV attaches to <video> ref trong ScreenSharePanel qua useEffect
      });

      peer.on("error", (err) => {
        console.error("[useScreenShare] peer error:", err);
        setError(err.message || "Screen share failed");
        setStatus("error");
        cleanup(false);
      });

      peer.on("close", () => {
        setStatus("stopped");
        cleanup(false);
      });

      return peer;
    },
    [socket, sessionId, isInitiator, cleanup]
  );

  // ============================================================
  // Public: startShare (HS only)
  // ============================================================
  const startShare = useCallback(async () => {
    if (!isInitiator) {
      setError("Chỉ HS mới có thể chia sẻ màn hình.");
      return;
    }
    if (!socket || !sessionId) {
      setError("Chưa kết nối socket hoặc chưa có session.");
      return;
    }
    if (peerRef.current) return;
    try {
      cleanup(false);
      setError(null);
      setStatus("requesting");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false, // không lấy audio hệ thống
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      // Lắng nghe khi user click "Stop sharing" trong browser chrome
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        // User stopped from browser UI → cleanup + emit stop
        cleanup(true);
        setStatus("stopped");
      });
      const peer = createPeer(true, stream);
      peerRef.current = peer;
    } catch (e: any) {
      console.error("[useScreenShare] startShare failed:", e);
      setError(e?.message || "Không truy cập được màn hình.");
      setStatus("error");
      cleanup(false);
    }
  }, [isInitiator, socket, sessionId, createPeer, cleanup]);

  // ============================================================
  // Public: stopShare (HS only)
  // ============================================================
  const stopShare = useCallback(() => {
    cleanup(true);
    setStatus("stopped");
  }, [cleanup]);

  // ============================================================
  // Socket event listeners (GV nhận offer; cả 2 nhận stop/peer-left)
  // ============================================================
  useEffect(() => {
    if (!socket || !sessionId) return;

    const onOffer = (payload: { sessionId: string; sdp: any; from: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (isInitiator) return; // HS tự gửi offer, không nhận
      if (peerRef.current) return; // đã có peer
      const peer = createPeer(false);
      peer.signal(payload.sdp);
      peerRef.current = peer;
    };

    const onAnswer = (payload: { sessionId: string; sdp: any; from: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (!isInitiator) return; // GV không gửi answer cho chính nó
      if (peerRef.current) {
        peerRef.current.signal(payload.sdp);
      }
    };

    const onIce = (payload: { sessionId: string; candidate: any; from: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (peerRef.current) {
        try { peerRef.current.signal(payload.candidate); } catch (e) {
          console.warn("[useScreenShare] ICE signal failed:", e);
        }
      }
    };

    const onStop = (payload: { sessionId: string; from: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (!peerRef.current) return;
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
      setStatus("stopped");
      cleanup(false);
    };

    const onPeerLeft = (payload: { sessionId: string; user_id: string; role: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (!peerRef.current) return;
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
      setStatus("stopped");
      cleanup(false);
    };

    socket.on("call:screen-offer", onOffer);
    socket.on("call:screen-answer", onAnswer);
    socket.on("call:screen-ice", onIce);
    socket.on("call:screen-stop", onStop);
    socket.on("call:peer-left", onPeerLeft);

    return () => {
      socket.off("call:screen-offer", onOffer);
      socket.off("call:screen-answer", onAnswer);
      socket.off("call:screen-ice", onIce);
      socket.off("call:screen-stop", onStop);
      socket.off("call:peer-left", onPeerLeft);
    };
  }, [socket, sessionId, isInitiator, createPeer, cleanup]);

  return {
    status,
    error,
    localStream,
    remoteStream,
    startShare,
    stopShare,
  };
}
