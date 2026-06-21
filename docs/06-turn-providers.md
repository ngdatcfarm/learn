# TURN providers — Twilio NTS vs self-hosted coturn

> Áp dụng cho voice call + screen share ở Step 12c/12d.
> Cập nhật: 2026-06-21 (chuyển từ coturn sang Twilio NTS do vấn đề 403 Forbidden IP).

---

## TL;DR

**Production nên dùng Twilio Network Traversal Service (NTS)** — đã được wire xong ở commit hiện tại. Self-hosted coturn (cfarm) chỉ dùng cho dev/LAN test.

```bash
# /var/www/english.cfarm.vn/.env
TURN_PROVIDER=twilio
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Vì sao chuyển sang Twilio

### Vấn đề với self-hosted coturn

Sau nhiều giờ debug cross-network voice call, đã xác định được root cause:

- coturn **hard-code compile-time defaults** cho `denied-peer-ip` gồm các ranges:
  - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (private LAN)
  - `100.64.0.0/10` (RFC 6598 Carrier-Grade NAT — phổ biến ở 4G)
  - `127.0.0.0/8`, `169.254.0.0/16`, v.v.
- Khi browser tạo `CREATE_PERMISSION` (bước bắt buộc trước khi TURN relay data), coturn **check denied-peer-ip TRƯỚC allowed-peer-ip**.
- Default deny → CGN/private peer IP bị **403 Forbidden IP** → TURN không relay được data outbound.
- DTLS handshake cần bidirectional → fail → "disconnected" trong ~200ms.

**Không có config flag nào disable defaults**. Phải recompile coturn từ source (2-4 giờ).

### Tại sao Twilio NTS work

- Twilio là TURN-as-a-Service — infrastructure của họ không restrict peer IP.
- Auth qua **API Key HMAC** (giống RFC 7635 nhưng Twilio-specific scheme).
- Twilio tin tưởng client (đã auth qua Key Secret) → cho phép relay tới **bất kỳ** peer IP.
- Cross-network (4G ↔ WiFi, VPN, firewall) work luôn.

---

## Setup Twilio (5 phút)

### 1. Đăng ký / đăng nhập

- https://console.twilio.com/
- Trial account OK (cần verify phone, free $15.50 credit)
- Network Traversal Service **free 1 GB/tháng** riêng — không trừ vào trial credit trừ khi vượt 1GB.

### 2. Tạo API Key (Standard, KHÔNG phải Master)

- Console → Account → API keys & tokens
- Hoặc search "API keys" trên top-right search box
- Click **Create API key**
- Friendly name: `learn-turn-server`
- Region: mặc định (United States / us1) — NTS dùng global edge, region không quan trọng
- **Key type: Standard** ← QUAN TRỌNG (Master không dùng cho NTS được)
- Click Create → **SAVE SID + SECRET NGAY** (secret chỉ hiện 1 lần!)

Kết quả:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Set env trên server

```bash
ssh root@103.166.183.215
cd /var/www/english.cfarm.vn
nano .env
```

Thêm vào:
```bash
# TURN provider (mặc định: twilio)
TURN_PROVIDER=twilio

# Twilio Network Traversal Service
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# (optional - nếu muốn rollback test cfarm)
# TURN_PROVIDER=cfarm
# TURN_SECRET=<existing>
# TURN_HOST=english.cfarm.vn
```

Lưu file: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 4. Rebuild + restart

```bash
cd /var/www/english.cfarm.vn
git pull origin main        # code đã có server/turn.ts (commit hiện tại)
npm run build
pm2 restart learn
pm2 logs learn --lines 20  # check "Server running"
```

### 5. Verify

**Test endpoint**:
```bash
# Login trước để lấy token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nguyen","password":"nguyen123"}'
# → trả về { token: "..." }

# Test turn-credentials
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/live/help/turn-credentials
```

Kỳ vọng response:
```json
{
  "urls": [
    "turn:global.turn.twilio.com:3478?transport=udp",
    "turn:global.turn.twilio.com:3478?transport=tcp",
    "turn:global.turn.twilio.com:3478?transport=tls",
    "turn:global.turn.twilio.com:443?transport=tcp",
    "turn:global.turn.twilio.com:443?transport=tls"
  ],
  "username": "SKaea070...:1750521600",
  "credential": "base64-hmac-sha1...",
  "ttl": 86400,
  "provider": "twilio"
}
```

**Test browser-side**:
1. Mở https://english.cfarm.vn/turn-test.html (cần login trước ở tab chính)
2. Click "Run diagnostic"
3. Kỳ vọng: `relay: 3` (UDP/TCP/TLS) — không phải 0

---

## Cách dùng

### Switch provider nhanh (không cần restart ngoài PM2)

```bash
# Sang Twilio
sed -i 's/^TURN_PROVIDER=.*/TURN_PROVIDER=twilio/' /var/www/english.cfarm.vn/.env
pm2 restart learn

# Sang cfarm (rollback)
sed -i 's/^TURN_PROVIDER=.*/TURN_PROVIDER=cfarm/' /var/www/english.cfarm.vn/.env
pm2 restart learn
```

### Health check (optional)

Thêm vào `/api/health` response:
```json
{
  "status": "ok",
  "turn": {
    "provider": "twilio",
    "configured": true,
    "freeTier": { "monthlyGb": 1, "estimatedMinutesAt32kbps": 4272 }
  }
}
```

Server `getTurnProviderInfo()` trong `server/turn.ts` đã có sẵn — chỉ cần gọi và merge vào health response.

---

## Capacity planning

| Metric | Value | Notes |
|--------|-------|-------|
| Free tier | 1 GB/tháng | Network Traversal data only |
| Codec | Opus 32 kbps | Voice quality OK cho HS |
| Bitrate | 4 KB/s = 0.000234 GB/min | Opus mono 32kbps |
| **Free minutes** | **~4,272 phút/tháng** | Per-direction (GV + HS = 2x data) |
| **Free bidirectional minutes** | **~2,136 phút/tháng** | Cả 2 chiều tính là 1 session |
| Usage ước tính | 10 HS × 4 buổi × 30 phút = 1,200 phút/tháng | **FREE hoàn toàn** |
| Headroom | ~78% free tier còn lại | Cho expand / debugging |

### Nếu vượt 1GB

- Trial: trừ vào $15.50 credit
- Paid: $0.40/GB (~$0.0004/MB)
- 100 HS × 30 phút × 4 buổi = 12,000 phút = ~2.8 GB = **~$0.72/tháng**

---

## Security

- **API Key Secret** treat như password. KHÔNG commit vào git.
- File `.env` đã có trong `.gitignore`.
- Nếu lỡ commit → **xoay key ngay** (Twilio Console → API keys → rotate).
- Frontend chỉ thấy `username` + `credential` (TTL 24h) — không có secret.
- Mỗi user có thể fetch credentials riêng (qua `requireRole` check) nhưng Twilio credentials là chung cho cả app — không có risk escalate.

---

## Tại sao KHÔNG dùng Programmable Voice (Custom Voice Solutions)

Twilio Console có nhiều sản phẩm Voice — **Network Traversal Service (NTS)** là đúng cái cần cho WebRTC P2P. **Programmable Voice** (Custom Voice Solutions card) là Twilio làm media server chính, **không phải** P2P:

| | NTS (đang dùng) | Programmable Voice |
|---|---|---|
| WebRTC P2P | Giữ nguyên | Không dùng |
| Media server | P2P (qua TURN relay) | Twilio |
| Screen share | simple-peer | Không có (phải dùng P2P riêng) |
| Cross-network NAT | ✓ | ✓ |
| Code change | 1 module mới | Rewrite voice flow (2-3 ngày) |
| Chi phí | FREE 1GB/tháng | $0.012/phút |

**Programmable Voice chỉ dùng khi**:
- App chỉ có voice (không cần screen share)
- Cần call recording + AI transcription (Voice Intelligence)
- Cần IVR / call queuing / multi-party conference

Không phải use case của Step 12d. **Giữ NTS.**

---

## Rollback plan (nếu Twilio có vấn đề)

```bash
# 1. Stop PM2
pm2 stop learn

# 2. Switch provider
sed -i 's/^TURN_PROVIDER=.*/TURN_PROVIDER=cfarm/' /var/www/english.cfarm.vn/.env

# 3. Đảm bảo cfarm vars có sẵn
grep -E '^TURN_SECRET=|^TURN_HOST=' /var/www/english.cfarm.vn/.env

# 4. Restart
pm2 restart learn
```

Nhưng nhớ: cfarm chỉ work cho LAN test. Cross-network vẫn sẽ fail với 403 như cũ.

---

## References

- Twilio NTS docs: https://www.twilio.com/docs/stun-turn/api
- ICE / TURN RFC 8656: https://datatracker.ietf.org/doc/html/rfc8656
- coturn denied-peer-ip defaults: https://github.com/coturn/coturn/blob/master/src/server/turn_server.c
- Simple-peer: https://github.com/feross/simple-peer