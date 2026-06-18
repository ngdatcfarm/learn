/**
 * server.ts — Express entry point (MySQL)
 *
 * Khởi động:
 *   1. Verify DB đã sẵn sàng (ping MySQL — nếu fail → gợi ý chạy `npm run setup`)
 *   2. Mount Vite dev middleware (dev) hoặc serve static (prod)
 *   3. Mount API routes (auth, skills, engagement, dashboard, questionBank, ai)
 *   4. Start listening
 *
 * Sau khi pull code mới lên server:
 *   npm install              (nếu package.json đổi)
 *   npm run setup            (idempotent, an toàn)
 *   pm2 restart learn
 */

import express, { Request, Response, NextFunction } from "express";
import "express-async-errors"; // MUST be imported AFTER express, BEFORE any routers — patches Express 4 to catch async errors
import path from "node:path";
import fs from "node:fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { getPool, pingDb } from "./db/client";
import { migrate } from "./db/migrate";
import { authRouter } from "./server/auth";
import { skillsRouter } from "./server/skills";
import { engagementRouter } from "./server/engagement";
import { dashboardRouter } from "./server/dashboard";
import { questionBankRouter } from "./server/questionBank";
import { aiRouter } from "./server/ai";
import { adminRouter } from "./server/admin";
import { profileRouter } from "./server/profile";
import { messagingRouter } from "./server/messaging";
import { audioRouter, UPLOAD_DIR } from "./server/audio";
import { practiceRouter } from "./server/practice";
import { flashcardsRouter } from "./server/flashcards";
import { registerJob, startCronJobs } from "./server/cron";
import { runAudioCleanup } from "./server/jobs/audioCleanup";
import { runParentReports } from "./server/jobs/parentReports";
import { runDbBackup } from "./server/jobs/dbBackup";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Ensure upload dir exists at boot (idempotent)
try {
  fs.mkdirSync(path.join(UPLOAD_DIR, "audio"), { recursive: true });
} catch (err) {
  console.warn("⚠  Could not create UPLOAD_DIR/audio:", err);
}

// ============================================================
// DB initialization (test connection + chạy migrations nếu chưa)
// ============================================================
async function initDb(): Promise<void> {
  const ok = await pingDb();
  if (!ok) {
    console.error(
      "✗ Không kết nối được MySQL. Kiểm tra .env hoặc chạy `npm run setup`."
    );
    process.exit(1);
  }
  await migrate();
  // Touch pool để log "ready"
  await getPool().query("SELECT 1");
  console.log("✓ MySQL connected");
}

// ============================================================
// Middleware
// ============================================================
app.use(express.json({ limit: "1mb" }));

// Request logging (dev only)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/")) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });
}

// ============================================================
// Gemini AI (cho /api/tutor/* endpoints)
// ============================================================
let ai: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log("✓ Gemini API initialized");
  } else {
    console.warn("⚠  GEMINI_API_KEY not set — AI endpoints chạy chế độ offline fallback");
  }
} catch (err) {
  console.error("Failed to init Gemini:", err);
}

// ============================================================
// API Routes
// ============================================================
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/engagement", engagementRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/question-bank", questionBankRouter);
app.use("/api/tutor", aiRouter(ai));
app.use("/api/admin", adminRouter);
app.use("/api/me", profileRouter);
app.use("/api/messages", messagingRouter);
app.use("/api/practice/audio", audioRouter);
app.use("/api/practice", practiceRouter(ai));
app.use("/api/flashcards", flashcardsRouter());

// Static serve for uploaded audio files (Step 9a). Mount BEFORE Vite so dev also works.
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, { maxAge: "7d", fallthrough: true })
);

// ============================================================
// Cron jobs (Step 6+) — hourly tick
// Step 7+ sẽ thêm MySQL GET_LOCK() cho multi-instance PM2.
// ============================================================
registerJob("cleanup_expired_audio", 60 * 60 * 1000, runAudioCleanup);
registerJob("send_parent_reports", 60 * 60 * 1000, runParentReports);
registerJob("db_backup", 60 * 60 * 1000, runDbBackup); // Step 10a — daily at BACKUP_HOUR
startCronJobs();

// 404 cho API
app.use("/api/*", (_req, res) => {
  res.status(404).json({ error: "API endpoint không tồn tại." });
});

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error",
  });
});

// ============================================================
// Vite (dev) hoặc static (prod)
// ============================================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("✓ Vite dev middleware mounted");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (!fs.existsSync(distPath)) {
      console.error("✗ dist/ chưa có. Chạy `npm run build` trước.");
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("✓ Serving static dist/");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
}

// ============================================================
// Bootstrap
// ============================================================
(async () => {
  try {
    await initDb();
    await startServer();
  } catch (err: any) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
})();
