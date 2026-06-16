/**
 * server/cron.ts — In-process cron registry
 *
 * Design: registry pattern + setInterval + cron_job_runs tracking.
 * Step 6 chấp nhận single-instance (xem docs/04-deploy-cfarm.md).
 * Step 7+ sẽ thêm MySQL `GET_LOCK()` advisory lock cho multi-instance PM2.
 *
 * Usage:
 *   import { registerJob, startCronJobs } from "./cron";
 *   registerJob("cleanup_expired_audio", 60 * 60 * 1000, runAudioCleanup);
 *   startCronJobs();
 */

import { query, ResultSetHeader } from "../db/client";

interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<{ rowsAffected?: number } | void>;
}

const jobs: Job[] = [];

export function registerJob(
  name: string,
  intervalMs: number,
  run: Job["run"]
): void {
  jobs.push({ name, intervalMs, run });
}

async function startRun(jobName: string): Promise<number> {
  // Tạo row với status='running', lấy id để update sau
  const res = (await query<ResultSetHeader>(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES (?, NOW(), 'running')`,
    [jobName]
  )) as unknown as ResultSetHeader;
  return res.insertId;
}

async function finishRun(
  runId: number,
  status: "success" | "error",
  rowsAffected: number | null,
  errorMessage: string | null
): Promise<void> {
  await query<ResultSetHeader>(
    `UPDATE cron_job_runs
     SET finished_at = NOW(), status = ?, rows_affected = ?, error_message = ?
     WHERE id = ?`,
    [status, rowsAffected, errorMessage, runId]
  );
}

export function startCronJobs(): void {
  for (const job of jobs) {
    const tick = async () => {
      const runId = await startRun(job.name);
      try {
        const result = await job.run();
        const rowsAffected =
          result && typeof result === "object" && "rowsAffected" in result
            ? result.rowsAffected ?? null
            : null;
        await finishRun(runId, "success", rowsAffected, null);
        if (rowsAffected != null) {
          console.log(`[cron] ${job.name} OK (rows=${rowsAffected})`);
        } else {
          console.log(`[cron] ${job.name} OK`);
        }
      } catch (err: any) {
        console.error(`[cron] ${job.name} FAILED:`, err?.message || err);
        await finishRun(runId, "error", null, String(err?.message || err));
      }
    };
    // Lặp theo interval (không chạy eager tại boot — interval đầu tiên = job.intervalMs)
    setInterval(tick, job.intervalMs);
  }
  console.log(
    `[cron] ${jobs.length} job(s) registered: ${jobs.map((j) => j.name).join(", ")}`
  );
}

// (getLatestRun removed — unused; admin UI uses adminListCronRuns + filter client-side)
