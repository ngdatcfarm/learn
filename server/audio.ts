/**
 * server/audio.ts — Audio upload + serve (Step 9a)
 *
 * Endpoints:
 *   - POST /api/practice/audio/upload — multipart, single file
 *       Mục đích: HS record audio (Web Speech/MediaRecorder) cho các practice activity.
 *       Multer ghi file vào ${UPLOAD_DIR}/audio/{userId}/{uuid}.{ext},
 *       trả về URL public để <audio src=...> dùng được.
 *       KHÔNG lưu row DB ở đây — practice endpoints (Speaking/Shadowing) sẽ INSERT
 *       speak_recordings kèm expires_at + transcript + analysis.
 *   - GET /api/practice/audio/health — noop liveness check.
 *
 * Giới hạn:
 *   - Max 15MB (đủ cho 5-7 phút WebM/Opus ~ 1-3MB, double cho safety).
 *   - Mime: audio/webm | audio/ogg | audio/mp4 (Chromium, Firefox, Safari).
 *   - User-scoped: mỗi user có thư mục riêng → tự nhiên partition.
 *
 * Static serve:
 *   - server.ts mount /uploads (chứa UPLOAD_DIR) với maxAge 7d.
 *   - Trả về URL dạng /uploads/audio/{userId}/{uuid}.{ext}.
 *
 * Edge cases (per plan):
 *   - File quá lớn → 413 (Multer tự throw).
 *   - Sai mime → 415.
 *   - Disk đầy → Multer throw ENOSPC → 500, FE retry.
 *   - User chưa auth → 401 (requireUser trước multer).
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireUser } from "./auth";

export const audioRouter = Router();

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIMES = new Set(["audio/webm", "audio/ogg", "audio/mp4"]);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const AUDIO_DIR = path.join(UPLOAD_DIR, "audio");

// ============================================================
// Multer disk storage — per-user subdir + uuid filename
// ============================================================

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const user = (req as any).user as { id: string } | undefined;
    if (!user || !user.id) {
      // requireUser should have run first; defensive
      return cb(new Error("Unauthorized"), "");
    }
    const userDir = path.join(AUDIO_DIR, user.id);
    try {
      fs.mkdirSync(userDir, { recursive: true });
    } catch (err: any) {
      return cb(err, "");
    }
    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    const uuid = crypto.randomUUID();
    // multer's mimetype — pick ext from allowed list
    const ext =
      file.mimetype === "audio/webm"
        ? "webm"
        : file.mimetype === "audio/ogg"
        ? "ogg"
        : file.mimetype === "audio/mp4"
        ? "mp4"
        : "bin";
    cb(null, `${uuid}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      const err = new Error(`Mime không hỗ trợ: ${file.mimetype}`);
      (err as any).code = "UNSUPPORTED_MIME";
      return cb(err);
    }
    cb(null, true);
  },
});

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/practice/audio/health
 */
audioRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, maxBytes: MAX_AUDIO_BYTES });
});

/**
 * POST /api/practice/audio/upload
 * Body: multipart/form-data, field "file"
 * Response: { url, bytes, mime }
 *
 * Note: requireUser MUST run before multer (so req.user is populated for destination()).
 */
audioRouter.post(
  "/upload",
  async (req: Request, res: Response, next: (err?: any) => void) => {
    const user = await requireUser(req, res);
    if (!user) return; // requireUser already sent 401
    // Stash user on req so the multer destination callback + final handler can read it
    (req as any).user = user;
    next();
  },
  (req: Request, res: Response) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: `File quá lớn. Tối đa ${MAX_AUDIO_BYTES / 1024 / 1024}MB.`,
          });
        }
        if (err.code === "UNSUPPORTED_MIME") {
          return res.status(415).json({ error: err.message });
        }
        console.error("Audio upload error:", err);
        return res.status(500).json({ error: err.message || "Upload thất bại" });
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      const user = (req as any).user as { id: string } | undefined;
      if (!file) {
        return res.status(400).json({ error: "Thiếu file." });
      }
      if (!user || !user.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      // /uploads/audio/{userId}/{filename}
      const url = `/uploads/audio/${user.id}/${file.filename}`;
      res.json({
        ok: true,
        url,
        bytes: file.size,
        mime: file.mimetype,
      });
    });
  }
);

export { UPLOAD_DIR, AUDIO_DIR };

/**
 * Validate rằng audioUrl là 1 public path trỏ tới file trong AUDIO_DIR.
 * Throw với message rõ ràng nếu path không hợp lệ (path traversal, prefix sai, ...).
 * Dùng chung cho /api/tutor/transcribe (9b) + /api/practice/speak/submit (9c)
 * + bất kỳ caller nào trong tương lai (9d shadowing, 9e free chat).
 */
export function assertSafeUploadUrl(audioUrl: string): void {
  if (!audioUrl.startsWith("/uploads/")) {
    throw new Error("audioUrl phải bắt đầu bằng /uploads/.");
  }
  const rel = audioUrl.replace(/^\//, "");
  const abs = path.join(UPLOAD_DIR, rel);
  if (!abs.startsWith(AUDIO_DIR)) {
    throw new Error("Path traversal không hợp lệ.");
  }
}
