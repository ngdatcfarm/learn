/**
 * server/audit.ts — Shared audit log helper
 *
 * Ghi mọi admin action vào bảng audit_log.
 * - actorId: user id của admin (null = system/cron)
 * - action:  string ngắn gọn (e.g. 'user.reset_password')
 * - targetType/targetId: optional — đối tượng bị tác động
 * - details: optional — context JSON (old value, reason, ...)
 * - ip: optional — request IP
 *
 * Usage:
 *   await logAudit({ actorId: admin.id, action: "user.reset_password", targetId: userId, details: { username } });
 */
import { query, ResultSetHeader } from "../db/client";

export interface AuditInput {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export async function logAudit(input: AuditInput): Promise<void> {
  await query<ResultSetHeader>(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.actorId,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.details ? JSON.stringify(input.details) : null,
      input.ip ?? null,
    ]
  );
}
