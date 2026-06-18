/**
 * server/jobs/dbBackup.ts — Daily MySQL backup via mysqldump + gzip
 *
 * Cron hourly tick (giống parentReports). Mỗi tick:
 *   1. Check NOW() có trong cửa sổ ±15 phút của BACKUP_HOUR (mặc định 03:00) hay không
 *   2. Nếu file backup cho hôm nay đã tồn tại → bail (idempotent — tránh ghi đè)
 *   3. Tạo filename: <BACKUP_DIR>/learn-YYYYMMDD-HHMM.sql.gz
 *   4. Spawn `mysqldump --databases <db>` → pipe stdout → `gzip` → file
 *   5. Rotate: chỉ giữ lại 7 file gần nhất (xoá file cũ hơn)
 *
 * Password đọc từ env chung qua `loadMysqlEnvConfig()` (Step 10a) — truyền cho
 * mysqldump qua env var `MYSQL_PWD` (không CLI arg, tránh lộ qua `ps`).
 *
 * Edge cases:
 *   - mysqldump không có trên PATH → fail, log error, cron_job_runs status='error'
 *   - BACKUP_DIR không tồn tại → mkdirSync({recursive:true})
 *   - Permission denied → fail, log error
 *   - Disk full → mysqldump exit ≠ 0, fail, log error
 *   - 2 cron tick overlap (slow DB, app restart) → module-level `running` guard
 *     tránh 2 mysqldump processes cùng ghi vào 1 file (corruption)
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadMysqlEnvConfig } from "../../db/client";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const BACKUP_HOUR = parseInt(process.env.BACKUP_HOUR || "3", 10);
const KEEP_LAST_N = 7;
const WINDOW_MIN = 15;
const MIN_VALID_BYTES = 100; // empty/garbage dump sanity check

// In-flight guard — tránh 2 mysqldump processes cùng ghi vào 1 file
let running = false;

function isInBackupWindow(now: Date, hour: number): boolean {
  const target = hour * 60;
  const current = now.getHours() * 60 + now.getMinutes();
  const diff = Math.abs(current - target);
  // Wrap-around midnight (vd hour=23, current=00:05 → diff=1435, wrapped=5)
  const wrapped = Math.min(diff, 24 * 60 - diff);
  return wrapped <= WINDOW_MIN;
}

function todayStamp(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function fileTimeStamp(now: Date): string {
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}${m}`;
}

function listBackups(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^learn-\d{8}-\d{4}\.sql\.gz$/.test(f))
      .sort(); // ISO date prefix → lexicographic = chronological
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Xoá các file cũ, chỉ giữ lại N file mới nhất.
 * Gọi SAU khi ghi file mới thành công. ENOENT được swallow (file có thể đã bị
 * xoá thủ công); các lỗi khác chỉ warn, KHÔNG throw — nếu rotate fail,
 * backup vẫn được track là success, file cũ sẽ accumulate chậm.
 */
function rotate(dir: string, keep: number): number {
  let files: string[];
  try {
    files = listBackups(dir);
  } catch (err: any) {
    console.warn(`[dbBackup] rotate: listBackups failed:`, err.message);
    return 0;
  }
  if (files.length <= keep) return 0;
  const toDelete = files.slice(0, files.length - keep);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.warn(`[dbBackup] rotate: cannot delete ${f}:`, err.message);
      }
    }
  }
  return toDelete.length;
}

export async function runDbBackup(): Promise<{ rowsAffected: number }> {
  // 0. In-flight guard — chặn concurrent dumps (slow DB hoặc tick overlap)
  if (running) {
    console.warn("[dbBackup] skip — previous run still in progress");
    return { rowsAffected: 0 };
  }
  running = true;
  try {
    return await runDbBackupImpl();
  } finally {
    running = false;
  }
}

async function runDbBackupImpl(): Promise<{ rowsAffected: number }> {
  const now = new Date();

  // 1. Time window check
  if (!isInBackupWindow(now, BACKUP_HOUR)) {
    return { rowsAffected: 0 };
  }

  // 2. Read MySQL config từ env chung (cùng nguồn với db/client.ts)
  let cfg;
  try {
    cfg = loadMysqlEnvConfig();
  } catch (err: any) {
    throw new Error(`Cannot load MySQL config: ${err.message}`);
  }

  // 3. Idempotency: nếu file cho hôm nay đã tồn tại → skip (không overwrite)
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = todayStamp(now);
  const existing = listBackups(BACKUP_DIR).filter((f) => f.includes(stamp));
  if (existing.length > 0) {
    console.log(`[dbBackup] skip — ${existing[0]} already exists`);
    return { rowsAffected: 0 };
  }

  const filename = `learn-${stamp}-${fileTimeStamp(now)}.sql.gz`;
  const outPath = path.join(BACKUP_DIR, filename);

  // 4. Spawn mysqldump → pipe qua gzip → ghi file
  //    --databases: có CREATE DATABASE + USE trong dump (an toàn cho restore)
  //    --single-transaction: InnoDB consistent snapshot, không lock
  //    --routines + --events: backup stored procs + event scheduler
  const dumpArgs = [
    `--host=${cfg.host}`,
    `--port=${cfg.port}`,
    `--user=${cfg.user}`,
    "--databases",
    cfg.database,
    "--single-transaction",
    "--routines",
    "--events",
    "--triggers",
  ];
  const dump = spawn("mysqldump", dumpArgs, {
    env: { ...process.env, MYSQL_PWD: cfg.password },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const gzip = spawn("gzip", ["-c"], { stdio: ["pipe", "pipe", "pipe"] });

  let dumpStderr = "";
  let gzipStderr = "";
  dump.stderr.on("data", (c: Buffer) => (dumpStderr += c.toString()));
  gzip.stderr.on("data", (c: Buffer) => (gzipStderr += c.toString()));

  // Pipe: dump.stdout → gzip.stdin → gzip.stdout → file
  // Track exit codes explicitly — nếu gzip exit ≠ 0 SAU KHI out.finish đã fire,
  // vẫn phải reject (không được coi là success).
  let dumpExit: number | null = null;
  let gzipExit: number | null = null;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(outPath);
    let settled = false;
    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    const checkFinish = () => {
      // Chỉ success khi CẢ dump VÀ gzip đều exit 0
      if (dumpExit !== null && gzipExit !== null) {
        if (dumpExit === 0 && gzipExit === 0) settle();
        else {
          const msg =
            dumpExit !== 0
              ? `mysqldump exit ${dumpExit}: ${dumpStderr.trim()}`
              : `gzip exit ${gzipExit}: ${gzipStderr.trim()}`;
          settle(new Error(msg));
        }
      }
    };
    out.on("error", (err) => settle(err));
    dump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(out);
    dump.on("error", (err) => settle(err));
    dump.on("close", (code) => {
      dumpExit = code;
      checkFinish();
    });
    gzip.on("error", (err) => settle(err));
    gzip.on("close", (code) => {
      gzipExit = code;
      checkFinish();
    });
  });

  // 5. Sanity check file size
  const stat = fs.statSync(outPath);
  if (stat.size < MIN_VALID_BYTES) {
    fs.unlinkSync(outPath);
    throw new Error(`Backup file suspiciously small (${stat.size}B) — deleted`);
  }

  // 6. Rotate — keep last N (best-effort, lỗi chỉ warn)
  const deleted = rotate(BACKUP_DIR, KEEP_LAST_N);

  console.log(
    `[dbBackup] ✓ ${filename} (${(stat.size / 1024).toFixed(1)}KB), rotated ${deleted}`
  );
  return { rowsAffected: 1 };
}
