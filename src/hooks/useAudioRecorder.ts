/**
 * src/hooks/useAudioRecorder.ts — Reusable mic recording state machine (Step 9d)
 *
 * Encapsulates the audio recording lifecycle shared by SpeakingPanel và ShadowingPanel:
 *   - start/stop mic qua MediaRecorder
 *   - audioUrl state (single-owner effect, xem debugging.md → audioUrl ownership)
 *   - audioBlobRef (lưu Blob để upload, không trigger re-render)
 *   - durationMs (set khi stop)
 *   - error state
 *   - reset() — release stream, clear blob, setAudioUrl(null) trigger URL revoke
 *   - Auto-reset khi `resetKey` đổi (vd: item.id khi user chọn bài khác)
 *
 * Return: { audioUrl, audioBlobRef, durationMs, recording, error, startRecording,
 *           stopRecording, reset }
 *
 * Caller tự quản lý:
 *   - `submitting` (đang chờ API) — đặt ngoài hook vì state này
 *     thuộc về flow submit, không thuộc recording lifecycle
 *   - TTS `playing` state (chỉ có ở ShadowingPanel)
 *   - result state
 *
 * Lưu ý:
 *   - Hook KHÔNG gọi URL.revokeObjectURL trực tiếp trong start/stop; chỉ setAudioUrl(null)
 *     để Effect 1 cleanup xử lý (single-owner pattern, tránh 2 effect fight).
 *   - getUserMedia + MediaRecorder chỉ chạy trên HTTPS (hoặc localhost). Caller nên
 *     checkMicSupport() trước khi gọi startRecording.
 */

import { useState, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import {
  startRecording as lowLevelStartRecording,
  stopRecording as lowLevelStopRecording,
  makeChunkedRecorder,
} from "../utils/audio";

export interface UseAudioRecorderResult {
  audioUrl: string | null;
  /** Ref giữ Blob tương ứng với audioUrl. Dùng để upload (không trigger re-render). */
  audioBlobRef: MutableRefObject<Blob | null>;
  durationMs: number;
  recording: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  /** Stop + clear stream, blob, state. Không touch `submitting` hay `result`. */
  reset: () => void;
}

export function useAudioRecorder(resetKey: string): UseAudioRecorderResult {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [recording, setRecording] = useState(false);
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

  // Effect 2: reset khi resetKey đổi (vd: user chọn bài khác).
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
    setError(null);
    setRecording(false);
    setAudioUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const { recorder, stream } = await lowLevelStartRecording();
      recorderRef.current = recorder;
      streamRef.current = stream;
      makeChunkedRecorder(recorder, () => {
        // chunks tracked trong recorder._chunks (xem audio.ts)
      });
      startTimeRef.current = Date.now();
      setRecording(true);
    } catch (e: any) {
      setError(e?.message || "Không truy cập được micro.");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    setDurationMs(elapsed);
    try {
      const blob = await lowLevelStopRecording(
        recorderRef.current,
        streamRef.current || undefined
      );
      audioBlobRef.current = blob;
      setAudioUrl(URL.createObjectURL(blob));
      setRecording(false);
    } catch (e: any) {
      setError(e?.message || "Dừng thu âm thất bại.");
      setRecording(false);
    }
  }, []);

  const reset = useCallback(() => {
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
    setError(null);
  }, []);

  return {
    audioUrl,
    audioBlobRef,
    durationMs,
    recording,
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
