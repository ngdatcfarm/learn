#!/usr/bin/env tsx
/**
 * scripts/setup.ts — File thực thi DUY NHẤT để chuẩn bị môi trường (MySQL).
 *
 * Chạy được trên:
 *   - Windows (local dev):    npm run setup
 *   - Linux (cloud server):   npm run setup   (sau khi git pull)
 *
 * Yêu cầu: file .env ở root project chứa:
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *   GEMINI_API_KEY (optional, cho AI features)
 *
 * Chức năng (idempotent — chạy nhiều lần an toàn):
 *   1. Kiểm tra Node.js version (>= 20)
 *   2. Kiểm tra file .env có đủ thông tin MySQL
 *   3. Cài npm dependencies (nếu node_modules chưa có / thiếu)
 *   4. Test kết nối MySQL (ping)
 *   5. Apply database migrations
 *   6. Seed admin account mặc định (nếu chưa có)
 *   7. Verify schema (đủ 12 tables)
 *   8. In hướng dẫn tiếp theo
 *
 * Tại sao là 1 file?
 *   - Reproducible 100% — local và cloud luôn khớp
 *   - Dev mới vào team chỉ cần `git clone && npm install && npm run setup`
 *   - Server deploy: git pull && npm install && npm run setup && pm2 restart
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import "dotenv/config";
import { getPool, queryOne, closePool, RowDataPacket } from "../db/client";
import { migrate } from "../db/migrate";
import { hashPassword } from "../server/passwords";
import { UPLOAD_DIR } from "../server/audio";

// ============================================================
// CONFIG
// ============================================================

const REQUIRED_NODE_MAJOR = 20;

// Default admin (chỉ dùng khi DB trống, bắt buộc đổi sau khi deploy)
const DEFAULT_ADMIN = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "admin123",
  name: "Administrator",
};

// ============================================================
// HELPERS
// ============================================================

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
};

function header(text: string): void {
  console.log(
    `\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`
  );
  console.log(`${c.bold}${c.cyan}║${c.reset}  ${c.bold}${text}${c.reset}`);
  console.log(
    `${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}\n`
  );
}

function step(num: number, text: string): void {
  console.log(`${c.bold}${c.blue}[${num}]${c.reset} ${c.bold}${text}${c.reset}`);
}

function ok(text: string): void {
  console.log(`    ${c.green}✓${c.reset} ${text}`);
}

function warn(text: string): void {
  console.log(`    ${c.yellow}⚠${c.reset} ${text}`);
}

function fail(text: string): void {
  console.log(`    ${c.red}✗${c.reset} ${text}`);
}

function info(text: string): void {
  console.log(`    ${c.dim}${text}${c.reset}`);
}

function die(msg: string): never {
  console.error(`\n${c.red}${c.bold}FATAL:${c.reset} ${msg}\n`);
  process.exit(1);
}

// ============================================================
// STEP 1: Node version check
// ============================================================

function checkNodeVersion(): void {
  step(1, "Kiểm tra Node.js version");
  const major = parseInt(process.versions.node.split(".")[0], 10);
  const full = process.versions.node;
  if (major < REQUIRED_NODE_MAJOR) {
    die(
      `Cần Node.js >= ${REQUIRED_NODE_MAJOR}. Bạn đang dùng ${full}.\n` +
        `    Cài lại từ: https://nodejs.org/  (LTS version)`
    );
  }
  ok(`Node.js ${full}`);
}

// ============================================================
// STEP 2: Kiểm tra .env
// ============================================================

function checkEnv(): void {
  step(2, "Kiểm tra file .env");

  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    die(
      `Không thấy file .env ở ${envPath}.\n` +
        `    Tạo file .env với nội dung:\n` +
        `      MYSQL_HOST=...\n` +
        `      MYSQL_PORT=3306\n` +
        `      MYSQL_USER=...\n` +
        `      MYSQL_PASSWORD=...\n` +
        `      MYSQL_DATABASE=learn_cfarm\n` +
        `    (Xem .env.example để biết đầy đủ)`
    );
  }
  ok(`.env tồn tại`);

  const required = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    die(`Thiếu biến trong .env: ${missing.join(", ")}\n    Xem .env.example`);
  }
  ok(`Đủ 4 biến MySQL bắt buộc (HOST/USER/PASSWORD/DATABASE)`);
  info(`Host:     ${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT || 3306}`);
  info(`Database: ${process.env.MYSQL_DATABASE}`);
}

// ============================================================
// STEP 3: npm install
// ============================================================

function ensureDependencies(): void {
  step(3, "Kiểm tra npm dependencies");

  const nodeModules = path.join(process.cwd(), "node_modules");
  const hasMysql2 = fs.existsSync(path.join(nodeModules, "mysql2"));
  const hasExpress = fs.existsSync(path.join(nodeModules, "express"));

  if (hasMysql2 && hasExpress && fs.existsSync(nodeModules)) {
    ok(`node_modules đã có sẵn (mysql2 + express OK)`);
    return;
  }

  warn("node_modules thiếu hoặc chưa cài — đang chạy npm install...");
  try {
    execSync("npm install", { stdio: "inherit", cwd: process.cwd() });
    ok("npm install xong");
  } catch (err) {
    die("npm install thất bại. Kiểm tra mạng hoặc chạy thủ công: npm install");
  }
}

// ============================================================
// STEP 4: Test MySQL connection
// ============================================================

async function testConnection(): Promise<void> {
  step(4, "Test kết nối MySQL");
  try {
    const conn = await getPool().getConnection();
    await conn.ping();
    const [rows] = await conn.query("SELECT VERSION() AS version, NOW() AS now");
    conn.release();
    const r = rows as RowDataPacket[];
    ok(`Kết nối OK — MySQL ${r[0].version}`);
    info(`Server time: ${r[0].now}`);
  } catch (err: any) {
    die(
      `Không kết nối được MySQL.\n` +
        `    Lỗi: ${err.message}\n` +
        `    → Kiểm tra .env (host, user, password, database)\n` +
        `    → Kiểm tra MySQL server có chạy không\n` +
        `    → Kiểm tra database "${process.env.MYSQL_DATABASE}" đã tạo chưa (qua phpMyAdmin)`
    );
  }
}

// ============================================================
// STEP 5: Apply migrations
// ============================================================

async function applyMigrations(): Promise<void> {
  step(5, "Apply database migrations");
  const result = await migrate();
  if (result.applied.length > 0) {
    result.applied.forEach((m) => ok(`Applied: ${m}`));
  } else {
    ok("Schema đã đúng version — không cần apply gì thêm");
  }
  if (result.skipped.length > 0) {
    info(`Skipped: ${result.skipped.join(", ")}`);
  }
}

// ============================================================
// STEP 6: Seed admin (nếu chưa có)
// ============================================================

async function seedAdminIfNeeded(): Promise<void> {
  step(6, "Kiểm tra admin account");

  const existing = await queryOne<RowDataPacket & { id: string; username: string }>(
    "SELECT id, username FROM users WHERE role = 'admin' LIMIT 1"
  );

  if (existing) {
    ok(`Admin đã tồn tại: ${c.bold}${existing.username}${c.reset}`);
    return;
  }

  const id = crypto.randomUUID();
  const { hash, salt } = hashPassword(DEFAULT_ADMIN.password);
  await getPool().query(
    `INSERT INTO users (id, username, password_hash, password_salt, must_change_password, role, name)
     VALUES (?, ?, ?, ?, 1, 'admin', ?)`,
    [id, DEFAULT_ADMIN.username, hash, salt, DEFAULT_ADMIN.name]
  );

  ok(`Tạo admin mặc định:`);
  info(`Username: ${c.bold}${DEFAULT_ADMIN.username}${c.reset}`);
  info(`Password: ${c.bold}${DEFAULT_ADMIN.password}${c.reset}`);
  warn("Sẽ bị BẮT BUỘC đổi mật khẩu ở lần đăng nhập đầu tiên (v6).");
}

// ============================================================
// STEP 6.5: Create upload dirs (Step 9a — audio practice)
// ============================================================

function ensureUploadDirs(): void {
  step(6.5, "Tạo upload directories (audio practice)");
  try {
    fs.mkdirSync(path.join(UPLOAD_DIR, "audio"), { recursive: true });
    ok(`UPLOAD_DIR: ${UPLOAD_DIR}/audio`);
  } catch (err: any) {
    warn(`Không tạo được UPLOAD_DIR: ${err.message}`);
  }
}

// ============================================================
// STEP 7: Verify schema
// ============================================================

async function verifySchema(): Promise<void> {
  step(7, "Verify schema còn nguyên vẹn");

  const expectedTables = [
    "users",
    "classes",
    "class_members",
    "parent_links",
    "skill_measurements",
    "engagement_events",
    "auth_sessions",
    "question_bank",
    "submissions",
    "previews",
    "assignments",
    "schema_migrations",
    // Step 6 (v2)
    "speak_recordings",
    "parent_report_settings",
    "audit_log",
    "cron_job_runs",
  ];

  const [rows] = (await getPool().query(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY TABLE_NAME",
    [process.env.MYSQL_DATABASE]
  )) as [RowDataPacket[], any];

  const existing = new Set(rows.map((r) => r.name as string));
  const missing = expectedTables.filter((t) => !existing.has(t));

  if (missing.length > 0) {
    die(
      `Thiếu tables: ${missing.join(", ")}.\n` +
        `    Chạy lại setup hoặc kiểm tra db/schema.sql`
    );
  }
  ok(`Đủ ${expectedTables.length} tables`);

  // Sanity check: admin có trong DB chưa
  const adminCount = (await queryOne<RowDataPacket & { c: number }>(
    "SELECT COUNT(*) AS c FROM users WHERE role='admin'"
  )) as { c: number } | undefined;
  if (!adminCount || adminCount.c === 0) {
    die("Không tìm thấy admin account. Có thể seed bị lỗi.");
  }
  ok(`Admin count: ${adminCount.c}`);
}

// ============================================================
// STEP 8: Print next steps
// ============================================================

function printNextSteps(): void {
  header("Setup hoàn tất! Bước tiếp theo:");

  console.log(`${c.bold}Local development:${c.reset}`);
  console.log(`  ${c.cyan}npm run dev${c.reset}         — Start dev server (http://localhost:3000)\n`);

  console.log(`${c.bold}Production (cloud server):${c.reset}`);
  console.log(`  ${c.cyan}npm run build${c.reset}      — Build React + bundle server`);
  console.log(`  ${c.cyan}npm start${c.reset}          — Run production server`);
  console.log(`  ${c.dim}(Hoặc dùng PM2: pm2 start npm --name learn -- start)${c.reset}\n`);

  console.log(`${c.bold}Database (MySQL):${c.reset}`);
  console.log(`  Host:     ${c.dim}${process.env.MYSQL_HOST}${c.reset}`);
  console.log(`  Database: ${c.dim}${process.env.MYSQL_DATABASE}${c.reset}`);
  console.log(`  Backup:   dùng phpMyAdmin → Export → SQL\n`);

  console.log(`${c.bold}Admin login:${c.reset}`);
  console.log(`  Username: ${c.bold}${DEFAULT_ADMIN.username}${c.reset}`);
  console.log(
    `  Password: ${c.bold}${DEFAULT_ADMIN.password}${c.reset}  ${c.yellow}(đổi sau khi deploy!)${c.reset}\n`
  );

  console.log(
    `${c.dim}Để xem các câu lệnh hữu ích: cat package.json | grep -A10 scripts${c.reset}\n`
  );
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  header("Tiếng Anh của mình — Setup (MySQL)");
  info(`Working dir: ${process.cwd()}`);
  info(`Platform:    ${process.platform} (${process.arch})`);
  info(`Node:        ${process.versions.node}\n`);

  checkNodeVersion();
  checkEnv();
  ensureDependencies();
  await testConnection();
  await applyMigrations();
  await seedAdminIfNeeded();
  ensureUploadDirs();
  await verifySchema();
  printNextSteps();
}

(async () => {
  try {
    await main();
  } catch (err: any) {
    die(err?.message || String(err));
  } finally {
    await closePool();
  }
})();
