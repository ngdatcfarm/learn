/**
 * db/migrate.ts — Apply schema + track version (MySQL)
 *
 * Idempotent: chạy nhiều lần an toàn.
 * - Tạo bảng schema_migrations nếu chưa có
 * - Split SQL file thành từng statement (theo `;`, respect strings/comments)
 * - Execute từng statement trong 1 transaction
 * - Insert version row nếu chưa có
 *
 * Migration sources:
 *   - v1 (initial): db/schema.sql (canonical full schema)
 *   - v2+:         db/migrations/NNN_*.sql (auto-discovered, sorted by NNN)
 *
 * Thêm migration mới: chỉ cần tạo file db/migrations/NNN_xxx.sql (zero-padded 3 digits).
 * KHÔNG cần sửa code này — file tự được load lần migrate kế tiếp.
 *
 * Cách dùng:
 *   npm run db:migrate
 *   (hoặc tự động qua `npm run setup`)
 */

import fs from "node:fs";
import path from "node:path";
import { getPool, closePool, RowDataPacket, withTransaction } from "./client";

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

/**
 * Apply 1 SQL file trong 1 transaction (atomic — all-or-nothing).
 * Dùng chung cho v1 (schema.sql) và v2+ (db/migrations/*.sql).
 */
async function applySqlFile(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, "utf-8");
  const statements = splitSqlStatements(sql);
  await withTransaction(async (conn) => {
    for (const stmt of statements) {
      await conn.query(stmt);
    }
  });
}

/**
 * Auto-discover migrations từ db/migrations/*.sql.
 * Filename phải match pattern: NNN_name.sql (3-digit zero-padded).
 * Sort lexicographic = sort by NNN (do zero-pad đều 3 chữ số).
 *
 * Returned migrations đã sorted theo version ASC.
 * Nếu folder không tồn tại hoặc rỗng → chỉ trả về v1.
 */
function loadMigrations(): Migration[] {
  const migrations: Migration[] = [
    {
      version: 1,
      name: "initial",
      apply: () => applySqlFile(SCHEMA_FILE),
    },
  ];

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return migrations;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const match = file.match(/^(\d{3})_(.+)\.sql$/);
    if (!match) continue; // regex bắt rồi nhưng TS cần
    const version = parseInt(match[1], 10);
    const name = match[2];
    const fullPath = path.join(MIGRATIONS_DIR, file);
    migrations.push({
      version,
      name,
      apply: () => applySqlFile(fullPath),
    });
  }

  return migrations;
}

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
  const migrations = loadMigrations();
  const justApplied: string[] = [];
  const skipped: string[] = [];

  for (const m of migrations) {
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
