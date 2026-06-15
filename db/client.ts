/**
 * db/client.ts — Singleton MySQL connection pool
 *
 * Quy tắc:
 * - Một process dùng 1 connection pool (không tạo nhiều)
 * - Config từ env vars: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 * - Mọi query dùng `?` placeholders (mysql2 chống SQL injection)
 * - Mọi query là async/await (MySQL khác SQLite: bất đồng bộ)
 *
 * Cách dùng:
 *   import { getPool, query, execute } from "./db/client";
 *   const [rows] = await query<MyType>("SELECT * FROM users WHERE id = ?", [id]);
 *
 * Helper `query()` dùng cho mọi câu (SELECT/INSERT/UPDATE/DELETE).
 * - Trả về [rows, fields] như mysql2 gốc
 * - Với SELECT: rows là mảng object
 * - Với INSERT/UPDATE/DELETE: rows là ResultSetHeader (có affectedRows, insertId)
 */

import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import "dotenv/config";

// ============================================================
// Config
// ============================================================

function loadConfig(): PoolOptions {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;

  if (!host) throw new Error("MYSQL_HOST chưa được cấu hình trong .env");
  if (!user) throw new Error("MYSQL_USER chưa được cấu hình trong .env");
  if (password === undefined) throw new Error("MYSQL_PASSWORD chưa được cấu hình trong .env");
  if (!database) throw new Error("MYSQL_DATABASE chưa được cấu hình trong .env");

  return {
    host,
    port: parseInt(process.env.MYSQL_PORT || "3306", 10),
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.MYSQL_POOL_SIZE || "10", 10),
    queueLimit: 0,
    charset: "utf8mb4",
    dateStrings: true, // giữ DATETIME dạng string (không auto-convert sang Date)
    multipleStatements: false, // an toàn — chỉ chạy 1 statement mỗi query
  };
}

// ============================================================
// Singleton pool
// ============================================================

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  _pool = mysql.createPool(loadConfig());
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

// ============================================================
// Helper: ping DB để check connection
// ============================================================

export async function pingDb(): Promise<boolean> {
  try {
    const conn = await getPool().getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch (err) {
    return false;
  }
}

// ============================================================
// Helper: query wrapper — trả về rows (không kèm fields)
// ============================================================

/**
 * Chạy 1 query với ? placeholders.
 * @returns mảng rows (SELECT) hoặc ResultSetHeader (INSERT/UPDATE/DELETE)
 *
 * Ví dụ SELECT:
 *   const rows = await query<{ id: string }[]>("SELECT id FROM users WHERE role = ?", ["admin"]);
 *   // rows = [{id: "..."}, ...]
 *
 * Ví dụ INSERT:
 *   const result = await query<ResultSetHeader>("INSERT INTO users ... VALUES (?)", [val]);
 *   // result.insertId (tuy nhiên app này dùng UUID tự sinh, không cần insertId)
 */
export async function query<T = unknown>(
  sql: string,
  params?: any[]
): Promise<T> {
  const [rows] = await getPool().execute(sql, params || []);
  return rows as T;
}

/**
 * Lấy 1 row duy nhất. Trả về undefined nếu không tìm thấy.
 * Throw nếu có > 1 row (bảo vệ khỏi query sai).
 */
export async function queryOne<T = unknown>(
  sql: string,
  params?: any[]
): Promise<T | undefined> {
  const rows = (await query<RowDataPacket[]>(sql, params)) as RowDataPacket[];
  if (rows.length === 0) return undefined;
  if (rows.length > 1) {
    throw new Error(`queryOne trả về ${rows.length} rows (expected 1). SQL: ${sql}`);
  }
  return rows[0] as T;
}

// ============================================================
// Re-export types tiện dụng
// ============================================================

export type { Pool, RowDataPacket, ResultSetHeader };
