/**
 * db/migrate.ts — Apply schema + track version (MySQL)
 *
 * Idempotent: chạy nhiều lần an toàn.
 * - Tạo bảng schema_migrations nếu chưa có
 * - Split db/schema.sql thành từng statement (theo `;`)
 * - Execute từng statement qua connection pool
 * - Insert version=1 với name="initial" nếu chưa có
 *
 * Khác biệt với SQLite:
 * - MySQL không có `db.exec()` cho multi-statement
 * - Mỗi statement phải chạy riêng qua pool.execute()
 * - Cần split SQL cẩn thận (handle strings, comments)
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
import { getPool, closePool, RowDataPacket } from "./client";

const SCHEMA_DIR = path.join(process.cwd(), "db");
const SCHEMA_FILE = path.join(SCHEMA_DIR, "schema.sql");
const MIGRATIONS_DIR = path.join(SCHEMA_DIR, "migrations");

interface Migration {
  version: number;
  name: string;
  apply: () => Promise<void>;
}

/**
 * Split SQL file thành mảng statement. Tôn trọng:
 * - String literals: '...' và "..." và `...`
 * - Line comment: -- ...
 * - Block comment: /* ... *\/
 * - Escape character: \\' bên trong string
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    // Trong line comment
    if (inLineComment) {
      current += c;
      if (c === "\n") inLineComment = false;
      continue;
    }

    // Trong block comment
    if (inBlockComment) {
      current += c;
      if (c === "*" && next === "/") {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    // Trong string literal
    if (inString) {
      current += c;
      if (c === "\\" && (next === "'" || next === '"' || next === "`")) {
        current += next;
        i++;
        continue;
      }
      if (c === stringChar) {
        inString = false;
      }
      continue;
    }

    // Bắt đầu line comment
    if (c === "-" && next === "-") {
      inLineComment = true;
      current += c;
      continue;
    }

    // Bắt đầu block comment
    if (c === "/" && next === "*") {
      inBlockComment = true;
      current += c;
      continue;
    }

    // Bắt đầu string
    if (c === "'" || c === '"' || c === "`") {
      inString = true;
      stringChar = c;
      current += c;
      continue;
    }

    // Kết thúc statement
    if (c === ";") {
      current += c;
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") statements.push(trimmed);
      current = "";
      continue;
    }

    current += c;
  }

  const last = current.trim();
  if (last) statements.push(last);

  return statements;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial",
    apply: async () => {
      const sql = fs.readFileSync(SCHEMA_FILE, "utf-8");
      const statements = splitSqlStatements(sql);
      const pool = getPool();
      // Dùng connection riêng để áp dụng toàn bộ statements
      // Nếu 1 cái fail → rollback, không apply nửa vời
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const stmt of statements) {
          await conn.query(stmt);
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
  },
  {
    version: 2,
    name: "admin_and_audio",
    apply: async () => {
      // Step 6: thêm 4 bảng + soft-delete column.
      // Refactor sang directory-loader ở Step 7+ khi có ≥2 non-initial migrations.
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, "002_admin_and_audio.sql"),
        "utf-8"
      );
      const statements = splitSqlStatements(sql);
      const conn = await getPool().getConnection();
      try {
        await conn.beginTransaction();
        for (const stmt of statements) {
          await conn.query(stmt);
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
  },
  {
    version: 3,
    name: "parent_phone",
    apply: async () => {
      // Step 4: thêm users.phone để PH tự nhập SĐT nhận Zalo report.
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, "003_parent_phone.sql"),
        "utf-8"
      );
      const statements = splitSqlStatements(sql);
      const conn = await getPool().getConnection();
      try {
        await conn.beginTransaction();
        for (const stmt of statements) {
          await conn.query(stmt);
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
  },
  {
    version: 4,
    name: "messaging",
    apply: async () => {
      // Step 7: inbox nội bộ (PH ↔ GV/Admin + broadcast).
      // 4 bảng: message_threads + thread_participants + thread_reads + messages.
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, "004_messaging.sql"),
        "utf-8"
      );
      const statements = splitSqlStatements(sql);
      const conn = await getPool().getConnection();
      try {
        await conn.beginTransaction();
        for (const stmt of statements) {
          await conn.query(stmt);
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
  },
];

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INT          NOT NULL,
      name        VARCHAR(64)  NOT NULL,
      applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getAppliedVersions(): Promise<Set<number>> {
  const [rows] = (await getPool().query(
    "SELECT version FROM schema_migrations ORDER BY version"
  )) as [RowDataPacket[], any];
  return new Set(rows.map((r) => r.version as number));
}

async function applyMigration(m: Migration): Promise<void> {
  const pool = getPool();
  await m.apply();
  await pool.query(
    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
    [m.version, m.name]
  );
}

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  await ensureMigrationsTable();
  const applied = await getAppliedVersions();
  const justApplied: string[] = [];
  const skipped: string[] = [];

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) {
      skipped.push(`v${m.version} (${m.name})`);
    } else {
      await applyMigration(m);
      justApplied.push(`v${m.version} (${m.name})`);
    }
  }

  return { applied: justApplied, skipped };
}

// ============================================================
// Nếu chạy trực tiếp file này → apply và in kết quả
// ============================================================
const isDirectRun =
  import.meta.url === `file:///${process.argv[1]}` ||
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js");

if (isDirectRun) {
  (async () => {
    try {
      console.log("🔧 Running migrations...\n");
      const result = await migrate();
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
      console.log("\n✨ Database ready.");
    } catch (err: any) {
      console.error("\n❌ Migration failed:", err.message);
      process.exit(1);
    } finally {
      await closePool();
    }
  })();
}
