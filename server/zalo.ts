/**
 * server/zalo.ts — Stub abstraction cho Zalo OA/ZNS
 *
 * Step 6 = stub. Real API integration ở Step 7+.
 *
 * 3 lựa chọn production (chọn sau khi có OA business verify):
 *   - Zalo ZNS: transactional, per-SĐT, free tier ~200 tin/tháng → fit 10 HS
 *   - Zalo OA broadcast: PH phải follow OA, free ~vài nghìn/tháng
 *   - Email SMTP: fallback, unlimited
 *
 * ZNS API khi ready:
 *   POST https://business.openapi.zalo.me/message/template
 *   Authorization: Bearer <access_token>
 *   { phone, template_id, template_data }
 */

import crypto from "node:crypto";

export interface ZaloConfig {
  oaId: string;
  accessToken: string;
  templateId: string;
}

export interface ZaloSendResult {
  ok: boolean;
  stub: true;
  messageId: string;
  recipientId: string;
  templateId: string;
  sentAt: string;
}

/**
 * Stub: log ra console + trả về result giả. Khi ready, thay thân hàm bằng
 * fetch() thật tới Zalo business.openapi.zalo.me.
 */
export async function sendZaloMessage(
  cfg: ZaloConfig,
  recipientId: string,
  data: Record<string, unknown>
): Promise<ZaloSendResult> {
  const messageId = crypto.randomUUID();
  // Log structured để dev/devops dễ debug
  console.log(
    `[zalo:stub] → recipient=${recipientId} template=${cfg.templateId} oa=${cfg.oaId}`,
    JSON.stringify(data)
  );
  return {
    ok: true,
    stub: true,
    messageId,
    recipientId,
    templateId: cfg.templateId,
    sentAt: new Date().toISOString(),
  };
}
