/**
 * server/jobs/audioCleanup.ts — Hard-delete expired speak_recordings
 *
 * Cron hourly: xóa row khi expires_at < NOW().
 * Schema design: audio_url/audio_duration_ms là transient; transcript + analysis
 * cũng bị xóa cùng row (theo user spec: "STT → AI error analysis → lưu transcript
 * + errors → xóa audio"). Nếu sau này muốn giữ transcript lâu hơn, tách bảng.
 */
import { query, ResultSetHeader } from "../../db/client";

export async function runAudioCleanup(): Promise<{ rowsAffected: number }> {
  const res = (await query<ResultSetHeader>(
    `DELETE FROM speak_recordings
     WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  )) as unknown as ResultSetHeader;
  return { rowsAffected: res.affectedRows ?? 0 };
}
