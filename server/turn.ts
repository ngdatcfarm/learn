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
 *
 *     Dùng official `twilio` SDK (`client.tokens.create()`) để sinh credentials.
 *     SDK Twilio tự handle HMAC-SHA1 spec chính xác — không tự implement
 *     để tránh sai scheme (đã từng gặp 401 do sai format khi tự build credential).
 *
 *     Server-side env: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.
 *     Auth Token CHỈ dùng trong SDK call (server-side) — KHÔNG BAO GIỜ
 *     lộ xuống client. SDK trả về ephemeral username + credential (TTL 24h)
 *     mà browser sử dụng — đó là cái duy nhất xuất hiện trong response.
 *
 *   - "cfarm": self-hosted coturn trên english.cfarm.vn (RFC 7635 use-auth-secret).
 *     Lưu ý: coturn default denied-peer-ip chặn CGN (100.64.0.0/10) và private ranges
 *     → không relay được cho HS trên 4G/WiFi NAT. Chỉ dùng khi cả 2 peer cùng LAN.
 *
 * Mặc định NÊN dùng Twilio cho production. cfarm chỉ dùng cho dev/LAN test.
 *
 * Caching: Twilio SDK call tốn ~200-500ms. Cache trong memory cho TTL của token
 * để tránh gọi Twilio API mỗi lần browser request credentials. Mỗi user fetch
 * credentials dùng chung Twilio credentials (cùng account-wide) — cache hit OK.
 */

import twilio from "twilio";
import crypto from "node:crypto";

export interface TurnCredentials {
  /** Mảng TURN URL đầy đủ (transport variants). Browser sẽ tự thử từng cái. */
  urls: string[];
  /** Username cho STUN/TURN auth (time-limited, SDK generate). */
  username: string;
  /** Credential (= password) cho STUN/TURN auth (time-limited, SDK generate). */
  credential: string;
  /** Thời gian sống của credentials (giây). */
  ttl: number;
  /** Provider đang dùng — để frontend log/audit. */
  provider: "twilio" | "cfarm";
}

// ============================================================
// Twilio Network Traversal Service (NTS) — dùng official SDK
// https://www.twilio.com/docs/stun-turn/api
// ============================================================

interface CachedTwilioCreds {
  creds: TurnCredentials;
  /** Unix ms khi cache expire. */
  expiresAtMs: number;
}

let _twilioCache: CachedTwilioCreds | null = null;

/**
 * Extract URLs từ Twilio ice_server object. SDK trả về:
 *  - `url` (string, singular, legacy)
 *  - `urls` (string | string[], plural, current)
 * → Normalize về string[].
 */
function extractUrls(server: { url?: string; urls?: string | string[] }): string[] {
  if (server.urls) {
    return Array.isArray(server.urls) ? server.urls : [server.urls];
  }
  if (server.url) {
    return [server.url];
  }
  return [];
}

async function generateTwilioCredentials(): Promise<TurnCredentials> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio TURN chưa cấu hình — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN trong .env.",
    );
  }

  // Cache hit — tránh gọi Twilio API mỗi lần fetch credentials
  const now = Date.now();
  if (_twilioCache && _twilioCache.expiresAtMs > now + 60_000) {
    return _twilioCache.creds;
  }

  // Dùng SDK chính thức — handle đúng HMAC-SHA1 spec, không tự build credential
  const client = twilio(accountSid, authToken);
  const token = await client.tokens.create({ ttl: 86400 });

  if (!token.iceServers || token.iceServers.length === 0) {
    throw new Error("Twilio SDK trả về iceServers rỗng.");
  }

  // Gộp URLs từ tất cả iceServers (Twilio trả vài servers với transports khác nhau)
  // username + credential share chung cho tất cả iceServers trong cùng token.
  const urls: string[] = [];
  let username = "";
  let credential = "";

  for (const server of token.iceServers) {
    const srv = server as unknown as {
      url?: string;
      urls?: string | string[];
      username?: string;
      credential?: string;
    };
    if (srv.username && !username) username = srv.username;
    if (srv.credential && !credential) credential = srv.credential;
    const serverUrls = extractUrls(srv);
    urls.push(...serverUrls);
  }

  // Fallback: nếu iceServers không có user/cred, dùng top-level (legacy SDK)
  if (!username && token.username) username = token.username;
  if (!credential && (token as unknown as { password?: string }).password) {
    credential = (token as unknown as { password: string }).password;
  }

  if (!username || !credential) {
    throw new Error("Twilio SDK trả về username/credential rỗng.");
  }
  if (urls.length === 0) {
    throw new Error("Twilio SDK trả về URLs rỗng.");
  }

  // TTL có thể là string hoặc number tùy SDK version
  const ttlRaw = token.ttl;
  const ttl =
    typeof ttlRaw === "string" ? parseInt(ttlRaw, 10) || 86400 : ttlRaw || 86400;

  const creds: TurnCredentials = {
    urls,
    username,
    credential,
    ttl,
    provider: "twilio",
  };

  // Cache đến lúc gần expire (trừ 60s buffer để tránh edge case)
  _twilioCache = { creds, expiresAtMs: now + ttl * 1000 };
  return creds;
}

// ============================================================
// Self-hosted coturn (cfarm.vn) — RFC 7635 use-auth-secret
// Giữ lại cho dev/LAN test và rollback nếu Twilio fail
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
 *                Twilio credentials là account-wide (share cho mọi user).
 * @returns { urls, username, credential, ttl, provider }
 *
 * @throws Error nếu provider chưa cấu hình đúng env vars.
 */
export async function generateTurnCredentials(
  userId: string,
): Promise<TurnCredentials> {
  const provider = (process.env.TURN_PROVIDER || "twilio").toLowerCase();

  switch (provider) {
    case "twilio":
      return await generateTwilioCredentials();
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
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
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