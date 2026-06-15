/**
 * db/migrate.ts — Apply schema + track version
 *
 * Idempotent: chạy nhiều lần an toàn.
 * - Tạo bảng schema_migrations nếu chưa có
 * - Apply db/schema.sql (CREATE TABLE IF NOT EXISTS → không phá data)
 * - Insert version=1 với name="initial" nếu chưa có
 *
 * Cách dùng:
 *   npm run db:migrate
 *
 * Sau này thêm migration mới:
 *   1. Tạo file db/migrations/002_add_xxx.sql
 *   2. Tăng CURRENT_VERSION trong code dưới đây
 *   3. Thêm vào mảng MIGRATIONS
 */

import fs from "node:fs";
import path from "node:path";
import { getDb } from "./client";

const SCHEMA_DIR = path.join(process.cwd(), "db");
const SCHEMA_FILE = path.join(SCHEMA_DIR, "schema.sql");

interface Migration {
  version: number;
  name: string;
  apply: () => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial",
    apply: () => {
      const db = getDb();
      const sql = fs.readFileSync(SCHEMA_FILE, "utf-8");
      db.exec(sql);
    },
  },
];

function ensureMigrationsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getAppliedVersions(): Set<number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as { version: number }[];
  return new Set(rows.map((r) => r.version));
}

function applyMigration(m: Migration): void {
  const db = getDb();
  const txn = db.transaction(() => {
    m.apply();
    db.prepare(
      "INSERT INTO schema_migrations (version, name) VALUES (?, ?)"
    ).run(m.version, m.name);
  });
  txn();
}

export function migrate(): { applied: string[]; skipped: string[] } {
  ensureMigrationsTable();
  const applied = getAppliedVersions();
  const justApplied: string[] = [];
  const skipped: string[] = [];

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) {
      skipped.push(`v${m.version} (${m.name})`);
    } else {
      applyMigration(m);
      justApplied.push(`v${m.version} (${m.name})`);
    }
  }

  return { applied: justApplied, skipped };
}

// Nếu chạy trực tiếp file này → apply và in kết quả
const isDirectRun =
  import.meta.url === `file:///${process.argv[1]}` ||
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js");

if (isDirectRun) {
  console.log("🔧 Running migrations...\n");
  const result = migrate();
  if (result.applied.length > 0) {
    console.log("✅ Applied:");
    result.applied.forEach((m) => console.log(`   - ${m}`));
  } else {
    console.log("✓ No new migrations to apply.");
  }
  if (result.skipped.length > 0) {
    console.log("\n⏭️  Already applied (skipped):");
    result.skipped.forEach((m) => console.log(`   - ${m}`));
  }
  console.log("\n✨ Database ready at: data/learn.db");
}
