/**
 * src/utils/audio.ts — MediaRecorder wrapper + Gemini STT helper (Step 9a + 9b)
 *
 * Step 9a: cung cấp API getUserMedia + MediaRecorder cho 9c/9d/9e.
 * Step 9b: thêm transcribeBlob() — upload audio lên server rồi gọi /api/tutor/transcribe.
 *
 * Lưu ý:
 *   - getUserMedia + MediaRecorder chỉ chạy trên HTTPS (hoặc localhost).
 *   - Một số browser (Safari iOS cũ) chưa support MediaRecorder — checkMicSupport() giúp FE
 *     ẩn mic controls gracefully.
 *   - transcribeBlob() gọi multipart /api/practice/audio/upload + /api/tutor/transcribe
 *     (server đọc file từ disk). Plan nói rằng transcribe endpoint nhận audio_url, nên
 *     flow = upload trước → lấy url → transcribe(url).
 *
 * 9e sẽ dùng transcribeBlob để inject transcript vào input chat.
 */

import { getToken } from "../api/client";

/**
 * Check browser support for audio recording.
 * Returns false nếu không có getUserMedia hoặc MediaRecorder.
 */
export function checkMicSupport(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof window.MediaRecorder !== "undefined"
  );
}

/**
 * Request mic permission + start recording.
 * Caller is responsible for stopping via stopRecording().
 *
 * @returns { recorder, stream } — caller can call .stop() on recorder, or track via chunks.
 */
export async function startRecording(): Promise<{
  recorder: MediaRecorder;
  stream: MediaStream;
}> {
  if (!checkMicSupport()) {
    throw new Error("Trình duyệt không hỗ trợ thu âm.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // mimeType: webm/opus preferred (Chromium, Firefox); Safari → "audio/mp4"
  const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  let chosenType = "";
  for (const t of preferredTypes) {
    if (MediaRecorder.isTypeSupported(t)) {
      chosenType = t;
      break;
    }
  }
  const recorder = new MediaRecorder(
    stream,
    chosenType ? { mimeType: chosenType } : undefined
  );
  recorder.start();
  return { recorder, stream };
}

/**
 * Stop the recorder, return the recorded Blob.
 * Caller nên gọi stream.getTracks().forEach(t => t.stop()) để release mic.
 */
export function stopRecording(
  recorder: MediaRecorder,
  stream?: MediaStream
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (recorder.state === "inactive") {
      // Edge: already stopped
      reject(new Error("Recorder đã dừng."));
      return;
    }
    recorder.onstop = () => {
      const blob = new Blob(
        (recorder as any).chunks ? [] : [], // chunks handled via ondataavailable
        { type: recorder.mimeType || "audio/webm" }
      );
      // Reconstruct from internal data: we attach chunks via ondataavailable in caller
      // If chunks are tracked separately (caller passed chunks), use that.
      const chunks = (recorder as any)._chunks as Blob[] | undefined;
      if (chunks && chunks.length > 0) {
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      } else {
        // Fallback — recorder may have internal data
        resolve(blob);
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    recorder.onerror = (e: any) => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      reject(new Error(e?.error?.message || "Recording error"));
    };
    recorder.stop();
  });
}

/**
 * Helper: build a recorder that auto-tracks chunks.
 * Use this in components to simplify state mgmt.
 */
export function makeChunkedRecorder(
  recorder: MediaRecorder,
  onChunk: (chunk: Blob) => void
): void {
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) {
      onChunk(e.data);
      // also stash on recorder for stopRecording() fallback
      if (!(recorder as any)._chunks) (recorder as any)._chunks = [];
      (recorder as any)._chunks.push(e.data);
    }
  };
}

/**
 * Upload an audio Blob to /api/practice/audio/upload.
 * Returns the public URL.
 */
export async function uploadAudio(blob: Blob): Promise<{
  url: string;
  bytes: number;
  mime: string;
}> {
  const token = getToken();
  if (!token) throw new Error("Chưa đăng nhập.");
  const form = new FormData();
  // File name với extension phù hợp mime
  const ext = blob.type.includes("mp4")
    ? "mp4"
    : blob.type.includes("ogg")
    ? "ogg"
    : "webm";
  form.append("file", new File([blob], `recording.${ext}`, { type: blob.type }));
  const res = await fetch("/api/practice/audio/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload thất bại (HTTP ${res.status})`;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return { url: data.url, bytes: data.bytes, mime: data.mime };
}

/**
 * Transcribe an audio Blob via /api/tutor/transcribe.
 * Flow: upload → get url → transcribe.
 * Returns the transcript string.
 */
export async function transcribeBlob(blob: Blob): Promise<{
  transcript: string;
  confidence: "low" | "medium" | "high";
}> {
  const { url } = await uploadAudio(blob);
  const token = getToken();
  if (!token) throw new Error("Chưa đăng nhập.");
  const res = await fetch("/api/tutor/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ audio_url: url, mime: blob.type || "audio/webm" }),
  });
  if (!res.ok) {
    let msg = `Transcribe thất bại (HTTP ${res.status})`;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return {
    transcript: data.transcript || "",
    confidence: data.confidence || "low",
  };
}
