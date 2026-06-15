#!/usr/bin/env tsx
/**
 * scripts/setup.ts — File thực thi DUY NHẤT để chuẩn bị môi trường.
 *
 * Chạy được trên:
 *   - Windows (local dev):    npm run setup
 *   - Linux (cloud server):   npm run setup   (sau khi git pull)
 *
 * Chức năng (idempotent — chạy nhiều lần an toàn):
 *   1. Kiểm tra Node.js version (>= 20)
 *   2. Cài npm dependencies (nếu node_modules chưa có / lỗi)
 *   3. Tạo thư mục data/ (chứa SQLite file)
 *   4. Apply database migrations
 *   5. Seed admin account mặc định (nếu chưa có)
 *   6. Verify schema còn nguyên vẹn
 *   7. In hướng dẫn tiếp theo
 *
 * Tại sao là 1 file?
 *   - Reproducible 100% — môi trường local và cloud luôn khớp
 *   - Dev mới vào team chỉ cần `git clone && npm run setup` là chạy được
 *   - Server deploy: git pull && npm run setup && pm2 restart
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

// ============================================================
// CONFIG
// ============================================================

const REQUIRED_NODE_MAJOR = 20;
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "learn.db");

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
  console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║${c.reset}  ${c.bold}${text}${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}\n`);
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
        `Cài lại từ: https://nodejs.org/  (LTS version)`
    );
  }
  ok(`Node.js ${full}`);
}

// ============================================================
// STEP 2: npm install
// ============================================================

function ensureDependencies(): void {
  step(2, "Kiểm tra npm dependencies");

  const nodeModules = path.join(process.cwd(), "node_modules");
  const hasBetterSqlite = fs.existsSync(
    path.join(nodeModules, "better-sqlite3")
  );
  const hasExpress = fs.existsSync(path.join(nodeModules, "express"));

  if (hasBetterSqlite && hasExpress && fs.existsSync(nodeModules)) {
    ok(`node_modules đã có sẵn (better-sqlite3 + express OK)`);
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
// STEP 3: Tạo data/ directory
// ============================================================

function ensureDataDir(): void {
  step(3, "Tạo thư mục data/");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    ok(`Tạo mới: ${DATA_DIR}`);
  } else {
    ok(`Đã tồn tại: ${DATA_DIR}`);
  }
  if (!fs.existsSync(path.join(DATA_DIR, ".gitkeep"))) {
    fs.writeFileSync(
      path.join(DATA_DIR, ".gitkeep"),
      "# Thư mục này chứa SQLite file (learn.db). KHÔNG commit learn.db vào git.\n"
    );
  }
}

// ============================================================
// STEP 4: Apply migrations
// ============================================================

async function applyMigrations(): Promise<void> {
  step(4, "Apply database migrations");
  // Import dynamically để tránh load native module nếu fail
  const migrateModule = await import("../db/migrate.js");
  const result = migrateModule.migrate();
  if (result.applied.length > 0) {
    result.applied.forEach((m: string) => ok(`Applied: ${m}`));
  } else {
    ok("Schema đã đúng version — không cần apply gì thêm");
  }
}

// ============================================================
// STEP 5: Seed admin (nếu chưa có)
// ============================================================

function hashPassword(
  password: string,
  saltHex?: string
): { hash: string; salt: string } {
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function seedAdminIfNeeded(): void {
  step(5, "Kiểm tra admin account");
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const existing = db
    .prepare("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { id: string; username: string } | undefined;

  if (existing) {
    ok(`Admin đã tồn tại: ${c.bold}${existing.username}${c.reset}`);
    db.close();
    return;
  }

  const id = crypto.randomUUID();
  const { hash, salt } = hashPassword(DEFAULT_ADMIN.password);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, password_salt, role, name)
     VALUES (?, ?, ?, ?, 'admin', ?)`
  ).run(id, DEFAULT_ADMIN.username, hash, salt, DEFAULT_ADMIN.name);

  ok(`Tạo admin mặc định:`);
  info(`Username: ${c.bold}${DEFAULT_ADMIN.username}${c.reset}`);
  info(`Password: ${c.bold}${DEFAULT_ADMIN.password}${c.reset}`);
  warn("ĐỔI MẬT KHẨU NGAY sau khi deploy lên server thật!");
  db.close();
}

// ============================================================
// STEP 6: Verify schema
// ============================================================

function verifySchema(): void {
  step(6, "Verify schema còn nguyên vẹn");
  const db = new Database(DB_PATH, { readonly: true });

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
  ];

  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    .all() as { name: string }[];
  const existing = new Set(rows.map((r) => r.name));
  const missing = expectedTables.filter((t) => !existing.has(t));

  if (missing.length > 0) {
    db.close();
    die(`Thiếu tables: ${missing.join(", ")}. Chạy lại setup hoặc kiểm tra schema.sql`);
  }
  ok(`Đủ ${expectedTables.length} tables`);

  // Sanity check: admin có trong DB chưa
  const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get() as { c: number }).c;
  if (adminCount === 0) {
    db.close();
    die("Không tìm thấy admin account. Có thể seed bị lỗi.");
  }
  ok(`Admin count: ${adminCount}`);
  db.close();
}

// ============================================================
// STEP 7: Print next steps
// ============================================================

function printNextSteps(): void {
  header("Setup hoàn tất! Bước tiếp theo:");

  console.log(`${c.bold}Local development:${c.reset}`);
  console.log(`  ${c.cyan}npm run dev${c.reset}         — Start dev server (http://localhost:3000)\n`);

  console.log(`${c.bold}Production (cloud server):${c.reset}`);
  console.log(`  ${c.cyan}npm run build${c.reset}      — Build React + bundle server`);
  console.log(`  ${c.cyan}npm start${c.reset}          — Run production server`);
  console.log(`  ${c.dim}(Hoặc dùng PM2: pm2 start npm --name learn -- start)${c.reset}\n`);

  console.log(`${c.bold}Database:${c.reset}`);
  console.log(`  File:  ${c.dim}${DB_PATH}${c.reset}`);
  console.log(`  Backup đơn giản: ${c.cyan}cp data/learn.db data/learn.db.backup${c.reset}\n`);

  console.log(`${c.bold}Admin login:${c.reset}`);
  console.log(`  Username: ${c.bold}${DEFAULT_ADMIN.username}${c.reset}`);
  console.log(`  Password: ${c.bold}${DEFAULT_ADMIN.password}${c.reset}  ${c.yellow}(đổi sau khi deploy!)${c.reset}\n`);

  console.log(`${c.dim}Để xem các câu lệnh hữu ích: cat package.json | grep -A10 scripts${c.reset}\n`);
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  header("Tiếng Anh của mình — Setup");
  info(`Working dir: ${process.cwd()}`);
  info(`Platform:    ${process.platform} (${process.arch})`);
  info(`Node:        ${process.versions.node}\n`);

  checkNodeVersion();
  ensureDependencies();
  ensureDataDir();
  await applyMigrations();
  seedAdminIfNeeded();
  verifySchema();
  printNextSteps();
}

try {
  main();
} catch (err: any) {
  die(err?.message || String(err));
}
