# Deploy lên cfarm.vn — Hướng dẫn chi tiết

> Áp dụng cho lần đầu deploy và mỗi lần update code mới.
> Ngày tạo: 2026-06-15 (sau khi migrate SQLite → MySQL)

---

## Yêu cầu trước khi bắt đầu

- [ ] Đã tạo database `learn_cfarm` trong phpMyAdmin (xem `docs/01-strategy.md` nếu quên)
- [ ] Đã biết MySQL user + password (tạo trong phpMyAdmin → Privileges)
- [ ] Đã có SSH access tới `103.166.183.215`
- [ ] Code trên GitHub đã là bản mới nhất (commit `cebe5d1` hoặc mới hơn)

---

## Lần đầu deploy (full setup)

### Bước 1: SSH vào server

```bash
ssh root@103.166.183.215
# Hoặc user hosting của bạn (không phải root)
```

### Bước 2: Tìm thư mục project

```bash
# Thường là /var/www/learn, /home/username/learn, hoặc ~/learn
find / -name "package.json" -path "*/learn/*" 2>/dev/null | head -3
```

Sau khi biết path, `cd` vào đó. Ví dụ:

```bash
cd /var/www/learn
```

### Bước 3: Pull code mới nhất

```bash
git pull origin main
```

Kỳ vọng output:
```
remote: Counting objects: ...
Updating 99bf632..cebe5d1
Fast-forward
 .env.example           |  65 +++++-
 db/client.ts           | 139 +++++++--
 ...
```

### Bước 4: Cài dependencies (nếu chưa có hoặc có dependency mới)

```bash
npm install
```

Kỳ vọng: thêm `mysql2` (~9 packages). Mất ~10-30 giây.

### Bước 5: Tạo file `.env` với MySQL credentials

```bash
nano .env
```

Paste nội dung sau (thay giá trị cho đúng):

```bash
# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=learn_user
MYSQL_PASSWORD=<password_thật_của_bạn>
MYSQL_DATABASE=learn_cfarm

# App
PORT=3000
NODE_ENV=production

# Admin (đổi pass này!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<mật_khẩu_mạnh>

# Gemini AI (optional)
GEMINI_API_KEY=<api_key_nếu_có>
```

**Lưu ý bảo mật**:
- File `.env` đã có trong `.gitignore` — KHÔNG push lên GitHub
- Trên shared hosting, có thể không cần `MYSQL_HOST=localhost`, thử cả `127.0.0.1` nếu fail

Lưu file: `Ctrl+O`, `Enter`, `Ctrl+X` (nano).

### Bước 6: Chạy setup (tạo schema + seed admin)

```bash
npm run setup
```

Kỳ vọng output:
```
╔══════════════════════════════════════════════════════════╗
║  Tiếng Anh của mình — Setup (MySQL)                      ║
╚══════════════════════════════════════════════════════════╝

[1] Kiểm tra Node.js version
    ✓ Node.js v20.x.x
[2] Kiểm tra file .env
    ✓ .env tồn tại
    ✓ Đủ 4 biến MySQL bắt buộc
[3] Kiểm tra npm dependencies
    ✓ node_modules đã có sẵn
[4] Test kết nối MySQL
    ✓ Kết nối OK — MySQL 8.0.xx
[5] Apply database migrations
    ✓ Applied: v1 (initial)
[6] Kiểm tra admin account
    ✓ Tạo admin mặc định:
       Username: admin
       Password: admin123    ← đổi sau!
[7] Verify schema còn nguyên vẹn
    ✓ Đủ 12 tables
    ✓ Admin count: 1
```

**Nếu fail ở bước 4** (Test kết nối MySQL) → xem [Troubleshooting](#troubleshooting) bên dưới.

### Bước 7: Build production bundle

```bash
npm run build
```

Kỳ vọng: tạo ra `dist/server.cjs` (~31KB) + `dist/index.html` + assets.

### Bước 8: Khởi động lại với PM2

```bash
# Nếu chưa có PM2
npm install -g pm2

# Stop app cũ (nếu có)
pm2 stop learn
pm2 delete learn

# Start mới
pm2 start npm --name learn -- start

# Xem log
pm2 logs learn --lines 50
```

Kỳ vọng log:
```
✓ MySQL connected
✓ Serving static dist/
🚀 Server running on http://0.0.0.0:3000
```

### Bước 9: Verify

```bash
# Health check
curl http://localhost:3000/api/health

# Kỳ vọng: {"status":"ok","timestamp":"..."}
```

Hoặc mở browser: `http://103.166.183.215:3000`

### Bước 10: Lưu startup script

```bash
pm2 startup
pm2 save
```

Để server tự chạy lại sau khi reboot.

---

## Update code mới (lần 2 trở đi)

Mỗi lần có commit mới trên GitHub:

```bash
cd /var/www/learn
git pull origin main
npm install         # chỉ khi package.json đổi
npm run setup       # idempotent — an toàn
npm run build
pm2 restart learn
pm2 logs learn --lines 20   # xem log
```

Nhanh hơn nhiều so với lần đầu.

---

## Troubleshooting

### Lỗi: "Không kết nối được MySQL"

```
FATAL: Không kết nối được MySQL.
    Lỗi: connect ECONNREFUSED 127.0.0.1:3306
```

**Nguyên nhân & cách sửa**:

1. **`MYSQL_HOST` sai**: Thử các giá trị:
   - `localhost`
   - `127.0.0.1`
   - `103.166.183.215` (IP server)
   - Hoặc hỏi hosting provider

2. **MySQL chưa chạy** (trên VPS):
   ```bash
   systemctl status mysql
   systemctl start mysql
   ```

3. **Database chưa tạo**: Vào phpMyAdmin → Databases → tạo `learn_cfarm`

4. **User chưa có quyền**: Vào phpMyAdmin → Privileges → chỉnh user `learn_user`:
   - Grant all privileges on database `learn_cfarm`
   - Host: `%` (any) hoặc `localhost`

### Lỗi: "Access denied for user"

```
FATAL: Lỗi: Access denied for user 'learn_user'@'localhost' (using password: YES)
```

→ Password trong `.env` sai. Vào phpMyAdmin reset password cho user.

### Lỗi: "Unknown database 'learn_cfarm'"

→ Database chưa tạo. Vào phpMyAdmin → Databases → tạo mới.

### Lỗi: "Table 'users' doesn't exist"

→ Migrations chưa chạy. Chạy lại:
```bash
npm run setup
```

### Lỗi: Port 3000 đã bị chiếm

Đổi port trong `.env`:
```
PORT=3001
```

Rồi restart PM2.

### Xem log chi tiết

```bash
pm2 logs learn --lines 100
pm2 logs learn --err   # chỉ lỗi
```

---

## Backup & Restore

### Backup thủ công (qua phpMyAdmin)

1. Vào phpMyAdmin → chọn database `learn_cfarm`
2. Tab **Export** → Method: Custom
3. Format: SQL
4. Click **Go** → download file `.sql`

### Backup tự động (Step 10a — in-process cron)

App tự chạy backup MySQL mỗi ngày qua `server/jobs/dbBackup.ts`. Không cần SSH setup gì thêm — chỉ cần đảm bảo:

**1. `mysqldump` + `gzip` có trên PATH** (mặc định có trên cfarm.vn / Ubuntu / CentOS):
```bash
which mysqldump gzip
# Kỳ vọng: /usr/bin/mysqldump, /bin/gzip
```

**2. Backup dir tồn tại + app user có quyền ghi**:
```bash
# Mặc định: <project>/backups (relative). Production nên dùng path tuyệt đối:
sudo mkdir -p /var/backups/learn
sudo chown $USER:$USER /var/backups/learn
```

**3. Cấu hình trong `.env`** (optional — defaults đã hợp lý):
```bash
BACKUP_DIR=/var/backups/learn   # mặc định: <project>/backups
BACKUP_HOUR=3                   # giờ chạy (mặc định 3 = 03:00 sáng)
```

**Cách hoạt động:**
- Cron job `db_backup` chạy hourly (1 lần/giờ) — giống `audioCleanup` và `parentReports`
- Mỗi tick: check NOW() có trong cửa sổ ±15 phút của `BACKUP_HOUR` không
- Nếu đúng → spawn `mysqldump` → pipe qua `gzip` → ghi file `learn-YYYYMMDD-HHMM.sql.gz`
- Idempotent: nếu file backup của hôm nay đã tồn tại → skip (không overwrite)
- Rotation: tự động xoá file cũ, chỉ giữ lại 7 file gần nhất
- Mỗi lần chạy (thành công/lỗi) đều ghi vào bảng `cron_job_runs` — admin xem ở Admin Dashboard → tab "Cron"

**File output ví dụ:**
```
/var/backups/learn/
├── learn-20260618-0307.sql.gz   # 7 ngày gần nhất
├── learn-20260617-0307.sql.gz
├── ...
└── learn-20260612-0307.sql.gz
```

### Restore từ backup

```bash
# Từ file .sql.gz
gunzip -c /var/backups/learn/learn-20260618-0307.sql.gz | mysql -u learn_user -p learn_cfarm
```

**Lưu ý restore:**
- File dump dùng `--databases` nên có CREATE DATABASE + USE — restore vào MySQL trống OK
- Nếu DB hiện tại có data, restore sẽ GHI ĐÈ (không merge) — cẩn thận!
- Trước khi restore production, nên backup bản hiện tại trước:
  ```bash
  mysqldump -u learn_user -p'...' learn_cfarm | gzip > /tmp/pre-restore-backup.sql.gz
  ```
- Nếu app đang chạy → `pm2 stop learn` trước khi restore để tránh data inconsistency

---

## Checklist sau khi deploy

- [ ] Health check trả về `{"status":"ok"}`
- [ ] Mở browser vào `http://103.166.183.215:3000` thấy app
- [ ] Login bằng `admin / admin123` OK
- [ ] **ĐỔI MẬT KHẨU ADMIN** ngay (nếu chưa đổi)
- [ ] PM2 auto-restart đã save (`pm2 save`)
- [ ] `mysqldump` + `gzip` có trên PATH (cho auto-backup Step 10a)
- [ ] `BACKUP_DIR` (vd `/var/backups/learn`) tồn tại + app user có quyền ghi
- [ ] Đợi qua 03:00 sáng hôm sau, check `/var/backups/learn/` có file `learn-YYYYMMDD-HHMM.sql.gz`
- [ ] Test API `/api/auth/login` với user `nguyen / nguyen123` (sau khi seed)
- [ ] Verify data trong phpMyAdmin (bảng `users` có 5+ rows)
