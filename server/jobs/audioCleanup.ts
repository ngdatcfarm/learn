/**
 * server/jobs/audioCleanup.ts — Hard-delete expired speak_recordings
 *
 * Step 9a: rewrite để cũng xóa file audio vật lý trên disk trước khi xóa row.
 * Cron hourly: tìm rows có expires_at < NOW() → fs.unlink(audio_url) → bulk DELETE.
 *
 * Schema design: audio_url/audio_duration_ms là transient; transcript + analysis
 * cũng bị xóa cùng row (theo user spec: "STT → AI error analysis → lưu transcript
 * + errors → xóa audio"). Nếu sau này muốn giữ transcript lâu hơn, tách bảng.
 *
 * Edge cases:
 *   - File đã bị xóa trước (ENOENT) → swallow, tiếp tục.
 *   - audio_url NULL hoặc không phải /uploads/... → skip unlink.
 *   - Bulk DELETE với IN (...) — nếu list quá lớn có thể chunk, hiện tại 10HS × vài
 *     recordings/week thì <100 rows mỗi cron tick, không cần chunking.
 */
import fs from "node:fs";
import path from "node:path";
import { query, ResultSetHeader, RowDataPacket } from "../../db/client";
import { UPLOAD_DIR } from "../audio";

interface ExpiredRow extends RowDataPacket {
  id: string;
  audio_url: string | null;
}

export async function runAudioCleanup(): Promise<{ rowsAffected: number; filesDeleted: number }> {
  // 1. Lấy danh sách row sắp hết hạn (đọc trước để biết file nào cần unlink)
  const rows = (await query<ExpiredRow[]>(
    `SELECT id, audio_url FROM speak_recordings
     WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  )) as ExpiredRow[];

  if (rows.length === 0) {
    return { rowsAffected: 0, filesDeleted: 0 };
  }

  // 2. Unlink từng file (swallow ENOENT — file có thể đã bị xóa thủ công)
  let filesDeleted = 0;
  for (const row of rows) {
    if (!row.audio_url) continue;
    // audio_url format: /uploads/audio/{userId}/{uuid}.{ext}
    // Strip leading "/" → relative path inside UPLOAD_DIR
    const rel = row.audio_url.replace(/^\//, "");
    const abs = path.join(UPLOAD_DIR, rel);
    // Safety: chỉ unlink nếu path nằm trong UPLOAD_DIR (chống traversal)
    if (!abs.startsWith(UPLOAD_DIR)) continue;
    try {
      fs.unlinkSync(abs);
      filesDeleted += 1;
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.warn(`[audioCleanup] unlink failed for ${abs}:`, err.message);
      }
      // ENOENT → file gone, vẫn count row đã xử lý
    }
  }

  // 3. Bulk DELETE
  const res = (await query<ResultSetHeader>(
    `DELETE FROM speak_recordings
     WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  )) as unknown as ResultSetHeader;

  return { rowsAffected: res.affectedRows ?? 0, filesDeleted };
}
