/**
 * server/turn.ts — TURN credentials provider abstraction
 *
 * Trả time-limited TURN credentials cho WebRTC ICE servers (voice + screen share).
 * Frontend dùng credentials này qua `getTurnCredentials()` (src/api/client.ts).
 *
 * Hỗ trợ 2 provider qua env `TURN_PROVIDER`:
 *
 *   - "twilio" (default kể từ 2026-06-21): Twilio Network Traversal Service (NTS).
 *     Free 1GB/tháng. Không restrict peer IP (cross-network CGN/private đều OK).
 *     Username: `${TWILIO_API_KEY_SID}:${unixExpTimestamp}`
 *     Credential: base64(HMAC-SHA1(TWILIO_API_KEY_SECRET, unixExpTimestamp))
 *     URLs: global.turn.twilio.com:3478 (udp/tcp/tls) + :443 fallback.
 *
 *   - "cfarm": self-hosted coturn trên english.cfarm.vn (RFC 7635 use-auth-secret).
 *     Username: `${unixExp}:${userId}`
 *     Credential: base64(HMAC-SHA1(TURN_SECRET, username))
 *     Lưu ý: coturn default denied-peer-ip chặn CGN (100.64.0.0/10) và private ranges
 *     → không relay được cho HS trên 4G/WiFi NAT. Chỉ dùng khi cả 2 peer cùng LAN
 *     hoặc cùng public IP.
 *
 * Mặc định NÊN dùng Twilio cho production. cfarm chỉ dùng cho dev/LAN test.
 *
 * TTL: 24h (client re-fetch khi hết hạn).
 */

import crypto from "node:crypto";

export interface TurnCredentials {
  /** Mảng TURN URL đầy đủ (transport variants). Browser sẽ tự thử từng cái. */
  urls: string[];
  /** Username cho STUN/TURN auth (RFC 5389/7635). */
  username: string;
  /** Credential (= password) cho STUN/TURN auth. */
  credential: string;
  /** Thời gian sống của credentials (giây). */
  ttl: number;
  /** Provider đang dùng — để frontend log/audit. */
  provider: "twilio" | "cfarm";
}

// ============================================================
// Twilio Network Traversal Service (NTS)
// https://www.twilio.com/docs/stun-turn/api
// ============================================================

function generateTwilioCredentials(): TurnCredentials {
  const sid = process.env.TWILIO_API_KEY_SID;
  const secret = process.env.TWILIO_API_KEY_SECRET;
  if (!sid || !secret) {
    throw new Error(
      "Twilio TURN chưa cấu hình — set TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET trong .env.",
    );
  }

  const ttl = 24 * 3600;
  // Unix timestamp (giây) — Twilio check credential chưa expire dựa vào giá trị này.
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${sid}:${timestamp}`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(timestamp.toString())
    .digest("base64");

  return {
    urls: [
      "turn:global.turn.twilio.com:3478?transport=udp",
      "turn:global.turn.twilio.com:3478?transport=tcp",
      "turn:global.turn.twilio.com:443?transport=tcp",
      "turns:global.turn.twilio.com:5349?transport=tcp",
      "turns:global.turn.twilio.com:443?transport=tcp",
    ],
    username,
    credential,
    ttl,
    provider: "twilio",
  };
}

// ============================================================
// Self-hosted coturn (cfarm.vn) — RFC 7635 use-auth-secret
// ============================================================

function generateCfarmCredentials(userId: string): TurnCredentials {
  const secret = process.env.TURN_SECRET;
  const host = process.env.TURN_HOST;
  if (!secret || !host) {
    throw new Error(
      "Self-hosted TURN chưa cấu hình — set TURN_SECRET + TURN_HOST trong .env.",
    );
  }

  const ttl = 24 * 3600;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${exp}:${userId}`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return {
    urls: [
      `turn:${host}:3478?transport=udp`,
      `turn:${host}:3478?transport=tcp`,
      `turns:${host}:5349?transport=tcp`,
    ],
    username,
    credential,
    ttl,
    provider: "cfarm",
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Sinh TURN credentials theo provider đang cấu hình.
 *
 * @param userId — User ID của người request (chỉ dùng cho cfarm scheme).
 *                Twilio không cần userId — credential chung cho mọi client.
 * @returns { urls, username, credential, ttl, provider }
 *
 * @throws Error nếu provider chưa cấu hình đúng env vars.
 */
export function generateTurnCredentials(userId: string): TurnCredentials {
  const provider = (process.env.TURN_PROVIDER || "twilio").toLowerCase();

  switch (provider) {
    case "twilio":
      return generateTwilioCredentials();
    case "cfarm":
      return generateCfarmCredentials(userId);
    default:
      throw new Error(
        `TURN_PROVIDER không hợp lệ: "${provider}". Dùng "twilio" hoặc "cfarm".`,
      );
  }
}

/**
 * Trả về thông tin provider hiện tại (dùng cho /api/health endpoint).
 */
export function getTurnProviderInfo(): {
  provider: string;
  configured: boolean;
  freeTier?: { monthlyGb: number; estimatedMinutesAt32kbps: number };
} {
  const provider = (process.env.TURN_PROVIDER || "twilio").toLowerCase();
  if (provider === "twilio") {
    const configured = !!(
      process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET
    );
    return {
      provider,
      configured,
      freeTier: {
        monthlyGb: 1,
        // 32 kbps Opus = 4 KB/s = 240 KB/min = ~0.000234 GB/min → ~4272 phút/tháng
        estimatedMinutesAt32kbps: 4272,
      },
    };
  }
  if (provider === "cfarm") {
    return {
      provider,
      configured: !!(process.env.TURN_SECRET && process.env.TURN_HOST),
    };
  }
  return { provider, configured: false };
}