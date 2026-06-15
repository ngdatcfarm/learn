/**
 * db/client.ts — Singleton connection cho SQLite
 *
 * Quy tắc:
 * - Một process chỉ mở 1 connection
 * - WAL mode cho phép concurrent read + write
 * - Foreign keys BẬT (PRAGMA foreign_keys = ON)
 * - Tất cả queries dùng prepared statements (? placeholders, không string concat)
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "learn.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  // Pragmas — áp dụng MỖI LẦN mở connection
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("synchronous = NORMAL"); // trade-off: nhanh hơn FULL, vẫn an toàn với WAL

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
