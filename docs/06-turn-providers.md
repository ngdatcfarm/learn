# TURN providers — Twilio NTS vs self-hosted coturn

> Áp dụng cho voice call + screen share ở Step 12c/12d.
> Cập nhật: 2026-06-21 (chuyển từ coturn sang Twilio NTS do vấn đề 403 Forbidden IP).

---

## ⚠️ SECURITY NOTICE — Rotate API Key ngay

API Key Secret `aLf6LyplBKw7NA88jjup7vHkTa122xEA` đã được paste trong chat AI debugging (2026-06-21).
**Twilio NTS yêu cầu API Key (Standard) + Secret — KHÔNG dùng Auth Token làm HMAC secret.**

**Auth Token = master credential = full account access** (gọi điện, SMS, drain credit). Nếu ai đó lấy được → mất toàn bộ account.

**Action ngay**:
1. Twilio Console → Account → API keys & tokens
2. Click rotate icon bên cạnh `learn-turn-server`
3. Save secret MỚI vào `.env` trên server
4. Rebuild + restart

---

## TL;DR

**Production nên dùng Twilio Network Traversal Service (NTS)** — đã được wire xong ở commit hiện tại. Self-hosted coturn (cfarm) chỉ dùng cho dev/LAN test.

```bash
# /var/www/english.cfarm.vn/.env
TURN_PROVIDER=twilio
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Standard API Key
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # 32-char secret từ Console
```

**KHÔNG dùng Auth Token** — không phải scheme cho NTS, master credential security risk.

---

## Vì sao chuyển sang Twilio

### Vấn đề với self-hosted coturn

coturn **hard-code compile-time defaults** cho `denied-peer-ip`:
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (private LAN)
- `100.64.0.0/10` (RFC 6598 Carrier-Grade NAT — phổ biến ở 4G)
- `127.0.0.0/8`, `169.254.0.0/16`, v.v.

→ CGN/private peer IP bị **403 Forbidden IP** → TURN không relay → DTLS handshake fail.

**Không có config flag nào disable defaults**. Phải recompile coturn.

### Twilio NTS work

- Auth qua **API Key HMAC** (RFC 7635-like, Twilio-specific).
- Không restrict peer IP.
- Cross-network (4G ↔ WiFi, VPN) work luôn.

---

## Setup Twilio (5 phút)

### 1. Đăng ký / đăng nhập

- https://console.twilio.com/
- Verify phone → free $15.50 trial credit
- NTS **free 1 GB/tháng** riêng

### 2. Tạo API Key

- Console → Account → API keys & tokens
- **Create API key**
- Friendly name: `learn-turn-server`
- Region: mặc định
- **Key type: Standard** ← QUAN TRỌNG (Master không dùng được cho NTS)
- Create → **SAVE SID + SECRET NGAY**

Kết quả:
```
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Set env trên server

```bash
ssh root@103.166.183.215
cd /var/www/english.cfarm.vn
nano .env
```

```bash
# TURN provider (mặc định: twilio)
TURN_PROVIDER=twilio

# Twilio NTS — API Key (Standard), KHÔNG phải Auth Token
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# (optional - rollback về cfarm nếu cần)
# TURN_PROVIDER=cfarm
# TURN_SECRET=<existing>
# TURN_HOST=english.cfarm.vn
```

### 4. Rebuild + restart

```bash
git pull origin main
npm run build
pm2 restart learn
pm2 logs learn --lines 20
```

### 5. Verify

```bash
TOKEN=$(curl --data-raw '{"username":"hs2","password":"1234"}' \
  -H 'Content-Type: application/json' -s -X POST \
  http://localhost:3000/api/auth/login \
  | grep -oP '"token":"\K[^"]+' | head -1)

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/live/help/turn-credentials
```

Kỳ vọng:
```json
{
  "urls": [
    "turn:global.turn.twilio.com:3478?transport=udp",
    "turn:global.turn.twilio.com:3478?transport=tcp",
    "turn:global.turn.twilio.com:443?transport=tcp",
    "turns:global.turn.twilio.com:5349?transport=tcp",
    "turns:global.turn.twilio.com:443?transport=tcp"
  ],
  "username": "SKxxx:1750xxxxxxx",
  "credential": "base64-hmac",
  "ttl": 86400,
  "provider": "twilio"
}
```

---

## Capacity planning

- Free tier: 1 GB/tháng
- Voice 32 kbps Opus: ~4,272 phút/tháng
- 10 HS × 4 buổi × 30 phút = 1,200 phút/tháng → **FREE**

---

## Rollback

```bash
sed -i 's/^TURN_PROVIDER=.*/TURN_PROVIDER=cfarm/' /var/www/english.cfarm.vn/.env
pm2 restart learn
# NHƯNG: cfarm chỉ work LAN test, cross-network vẫn 403.
```

## References

- Twilio NTS docs: https://www.twilio.com/docs/stun-turn/api
- ICE / TURN RFC 8656: https://datatracker.ietf.org/doc/html/rfc8656