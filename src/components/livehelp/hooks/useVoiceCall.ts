/**
 * src/components/livehelp/hooks/useVoiceCall.ts
 *
 * Step 12c — P2P voice call qua simple-peer + signaling qua socket.
 *
 * Lifecycle:
 *  - idle → startCall() (initiator) hoặc nhận call:offer (callee, status='incoming')
 *  - idle → acceptCall() (callee) → status='connected' khi peer.on('connect')
 *  - connected → toggleMute() / endCall()
 *  - endCall() → emit call:hangup → other side destroy
 *
 * Socket: dùng chung từ useLiveHelpSocket (pass vào qua prop). Signaling events:
 *  - call:offer    {sessionId, sdp, from, from_role}
 *  - call:answer   {sessionId, sdp, from, from_role}
 *  - call:ice      {sessionId, candidate, from, from_role}
 *  - call:hangup   {sessionId, from, from_role}
 *  - call:peer-left {sessionId, user_id, role}  (từ server khi peer disconnect)
 *
 * ICE servers:
 *  - STUN Google miễn phí (mặc định — đủ cho cùng WiFi, NAT thường)
 *  - TURN self-hosted (cfarm.vn coturn) — fetch qua /api/live/help/turn-credentials
 *    cần thiết cho cross-network (4G, VPN, firewall). Nếu TURN chưa cấu hình
 *    trên server → fallback STUN-only (peer error với symmetric NAT).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import SimplePeer from "simple-peer";
import { getTurnCredentials } from "../../../api/client";

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** ICE servers dùng khi chưa fetch được TURN credentials (STUN-only). */
const FALLBACK_ICE_SERVERS: RTCIceServer[] = STUN_SERVERS;

export type CallStatus = "idle" | "calling" | "incoming" | "connected" | "ended" | "error";

export interface UseVoiceCallOptions {
  /** Socket instance từ useLiveHelpSocket. */
  socket: Socket | null;
  /** Session ID cần join room. */
  sessionId?: string;
  /** Auto-answer incoming call (nếu false → UI hiển thị "Cuộc gọi đến" + nút accept). */
  autoAnswer?: boolean;
}

export interface UseVoiceCallReturn {
  status: CallStatus;
  muted: boolean;
  error: string | null;
  /** Local mic stream (cho audio element nếu muốn self-listen). */
  localStream: MediaStream | null;
  /** Remote stream — attach vào <audio autoPlay /> để nghe peer. */
  remoteStream: MediaStream | null;
  /** Thời gian call (giây). */
  durationSec: number;
  /** Bắt đầu gọi (caller side). */
  startCall: () => Promise<void>;
  /** Chấp nhận cuộc gọi đến (callee side). */
  acceptCall: () => Promise<void>;
  /** Từ chối cuộc gọi đến. */
  rejectCall: () => void;
  /** Kết thúc call (cả 2 phía). */
  endCall: () => void;
  /** Bật/tắt mic. */
  toggleMute: () => void;
}

export function useVoiceCall({
  socket,
  sessionId,
  autoAnswer = false,
}: UseVoiceCallOptions): UseVoiceCallReturn {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(FALLBACK_ICE_SERVERS);

  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const callStartRef = useRef<number | null>(null);
  const durationTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOfferRef = useRef<{ sdp: unknown; from: string } | null>(null);

  // ============================================================
  // Fetch TURN credentials on mount (cùng với khi socket connect).
  // Nếu server chưa cấu hình TURN → fallback STUN-only.
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    getTurnCredentials()
      .then((creds) => {
        if (cancelled) return;
        setIceServers([
          ...STUN_SERVERS,
          {
            urls: creds.urls,
            username: creds.username,
            credential: creds.credential,
          },
        ]);
      })
      .catch((err) => {
        // 503 = TURN_SECRET/TURN_HOST chưa set trên server. Fallback STUN-only.
        if (!cancelled) {
          console.warn(
            "[useVoiceCall] TURN credentials không khả dụng, dùng STUN-only:",
            err
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ============================================================
  // Cleanup
  // ============================================================
  const cleanup = useCallback(() => {
    if (durationTickRef.current) {
      clearInterval(durationTickRef.current);
      durationTickRef.current = null;
    }
    callStartRef.current = null;
    setDurationSec(0);
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // Duration timer
  // ============================================================
  const startDurationTimer = useCallback(() => {
    if (durationTickRef.current) return;
    callStartRef.current = Date.now();
    durationTickRef.current = setInterval(() => {
      if (callStartRef.current) {
        setDurationSec(Math.floor((Date.now() - callStartRef.current) / 1000));
      }
    }, 1000);
  }, []);

  // ============================================================
  // Get mic stream
  // ============================================================
  const getMic = useCallback(async (): Promise<MediaStream> => {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  }, []);

  // ============================================================
  // Create peer (caller hoặc callee)
  // ============================================================
  const createPeer = useCallback(
    (initiator: boolean, stream: MediaStream): SimplePeer.Instance => {
      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream,
        config: { iceServers },
      });

      peer.on("signal", (data) => {
        if (!socket || !sessionId) return;
        if (data.type === "offer") {
          socket.emit("call:offer", { sessionId, sdp: data });
        } else if (data.type === "answer") {
          socket.emit("call:answer", { sessionId, sdp: data });
        } else if ("candidate" in data && data.candidate) {
          socket.emit("call:ice", { sessionId, candidate: data });
        }
      });

      peer.on("connect", () => {
        setStatus("connected");
        startDurationTimer();
      });

      peer.on("stream", (remote) => {
        setRemoteStream(remote);
        // Tạo audio element ẩn để auto-play (browser policy yêu cầu user gesture trước đó)
        if (!remoteAudioRef.current) {
          const audio = new Audio();
          audio.autoplay = true;
          audio.srcObject = remote;
          remoteAudioRef.current = audio;
        } else {
          remoteAudioRef.current.srcObject = remote;
        }
      });

      peer.on("error", (err) => {
        console.error("[useVoiceCall] peer error:", err);
        setError(err.message || "Voice call failed");
        setStatus("error");
        cleanup();
      });

      peer.on("close", () => {
        setStatus("ended");
        cleanup();
      });

      return peer;
    },
    [socket, sessionId, startDurationTimer, cleanup, iceServers]
  );

  // ============================================================
  // Public: startCall (caller)
  // ============================================================
  const startCall = useCallback(async () => {
    if (!socket || !sessionId) {
      setError("Chưa kết nối socket hoặc chưa có session.");
      return;
    }
    if (peerRef.current) return; // đang trong call
    try {
      cleanup();
      setError(null);
      setStatus("calling");
      const stream = await getMic();
      setLocalStream(stream);
      const peer = createPeer(true, stream);
      peerRef.current = peer;
    } catch (e: any) {
      console.error("[useVoiceCall] startCall failed:", e);
      setError(e?.message || "Không truy cập được microphone.");
      setStatus("error");
      cleanup();
    }
  }, [socket, sessionId, getMic, createPeer, cleanup]);

  // ============================================================
  // Public: acceptCall (callee)
  // ============================================================
  const acceptCall = useCallback(async () => {
    const pending = pendingOfferRef.current;
    if (!socket || !sessionId || !pending) {
      setError("Không có cuộc gọi đến.");
      return;
    }
    if (peerRef.current) return;
    try {
      const stream = await getMic();
      setLocalStream(stream);
      const peer = createPeer(false, stream);
      peer.signal(pending.sdp as any);
      peerRef.current = peer;
      pendingOfferRef.current = null;
      setStatus("calling");
    } catch (e: any) {
      console.error("[useVoiceCall] acceptCall failed:", e);
      setError(e?.message || "Không truy cập được microphone.");
      setStatus("error");
      pendingOfferRef.current = null;
      cleanup();
    }
  }, [socket, sessionId, createPeer, getMic, cleanup]);

  // ============================================================
  // Public: rejectCall (callee)
  // ============================================================
  const rejectCall = useCallback(() => {
    if (!socket || !sessionId) return;
    socket.emit("call:hangup", { sessionId });
    pendingOfferRef.current = null;
    setStatus("idle");
  }, [socket, sessionId]);

  // ============================================================
  // Public: endCall
  // ============================================================
  const endCall = useCallback(() => {
    if (socket && sessionId && peerRef.current) {
      socket.emit("call:hangup", { sessionId });
    }
    setStatus("ended");
    cleanup();
  }, [socket, sessionId, cleanup]);

  // ============================================================
  // Public: toggleMute
  // ============================================================
  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
  }, [localStream]);

  // ============================================================
  // Socket event listeners
  // ============================================================
  useEffect(() => {
    if (!socket || !sessionId) return;

    const onOffer = (payload: { sessionId: string; sdp: any; from: string; from_role: string }) => {
      if (payload.sessionId !== sessionId) return;
      // Bỏ qua nếu offer từ chính mình
      if (peerRef.current) return;
      pendingOfferRef.current = { sdp: payload.sdp, from: payload.from };
      if (autoAnswer) {
        acceptCall();
      } else {
        setStatus("incoming");
      }
    };

    const onAnswer = (payload: { sessionId: string; sdp: any; from: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (peerRef.current) {
        peerRef.current.signal(payload.sdp);
      }
    };

    const onIce = (payload: { sessionId: string; candidate: any; from: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (peerRef.current) {
        try { peerRef.current.signal(payload.candidate); } catch (e) {
          console.warn("[useVoiceCall] ICE signal failed:", e);
        }
      }
    };

    const onHangup = (payload: { sessionId: string; from: string }) => {
      if (payload.sessionId !== sessionId) return;
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch {}
        peerRef.current = null;
      }
      setStatus("ended");
      cleanup();
    };

    const onPeerLeft = (payload: { sessionId: string; user_id: string; role: string }) => {
      if (payload.sessionId !== sessionId) return;
      // Peer disconnect → kết thúc call (đỡ phải đợi ICE timeout)
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch {}
        peerRef.current = null;
      }
      setStatus("ended");
      cleanup();
    };

    socket.on("call:offer", onOffer);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice", onIce);
    socket.on("call:hangup", onHangup);
    socket.on("call:peer-left", onPeerLeft);

    return () => {
      socket.off("call:offer", onOffer);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice", onIce);
      socket.off("call:hangup", onHangup);
      socket.off("call:peer-left", onPeerLeft);
    };
  }, [socket, sessionId, autoAnswer, acceptCall, cleanup]);

  return {
    status,
    muted,
    error,
    localStream,
    remoteStream,
    durationSec,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
  };
}
