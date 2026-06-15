/**
 * server/questionBank.ts — Kho câu hỏi (Template + Content Engine) — MySQL
 *
 * Quyết định đã chốt:
 *   - B: Auto-archive + tag chất lượng (quality_score auto-computed)
 *   - C: Kho riêng GV (mặc định) + nút share (is_shared=1)
 *
 * Endpoints:
 *   - GET  /api/question-bank           — List câu hỏi (riêng + chung nếu is_shared)
 *   - POST /api/question-bank           — Tạo mới
 *   - GET  /api/question-bank/:id       — Chi tiết
 *   - POST /api/question-bank/:id/share — Publish lên kho chung
 *   - POST /api/question-bank/:id/use   — Track lượt dùng (cập nhật usage_count)
 *
 * Khác biệt với SQLite:
 *   - Async/await
 *   - Dynamic SQL giữ nguyên pattern (build sql + params, dùng `?` placeholder)
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { query, queryOne, RowDataPacket, ResultSetHeader } from "../db/client";
import { requireUser, requireRole } from "./auth";

export const questionBankRouter = Router();

interface QuestionRow extends RowDataPacket {
  id: string;
  owner_id: string;
  is_shared: number;
  template_type: string;
  topic: string | null;
  level: string | null;
  content_json: string;
  quality_score: number;
  usage_count: number;
  success_rate: number | null;
  avg_duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/question-bank?type=reading&topic=Travel
 * Teacher: thấy câu riêng + câu shared
 * Admin: thấy tất cả
 * HS/PH: chỉ xem câu shared
 */
questionBankRouter.get("/", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { type, topic, shared } = req.query;

  let sql = `SELECT * FROM question_bank WHERE 1=1`;
  const params: any[] = [];

  if (user.role === "teacher") {
    sql += ` AND (owner_id = ? OR is_shared = 1)`;
    params.push(user.id);
  } else if (user.role === "admin") {
    // Admin thấy hết
  } else {
    // HS/PH: chỉ xem câu shared
    sql += ` AND is_shared = 1`;
  }

  if (type) {
    sql += ` AND template_type = ?`;
    params.push(type);
  }
  if (topic) {
    sql += ` AND topic LIKE ?`;
    params.push(`%${topic}%`);
  }
  if (shared === "1") {
    sql += ` AND is_shared = 1`;
  }

  sql += ` ORDER BY quality_score DESC, created_at DESC LIMIT 200`;

  const rows = (await query<QuestionRow[]>(sql, params)) as QuestionRow[];

  res.json({
    items: rows.map((r) => ({
      ...r,
      content: r.content_json ? JSON.parse(r.content_json) : null,
    })),
    count: rows.length,
  });
});

/**
 * POST /api/question-bank
 * Body: { template_type, topic, level, content }
 * Teacher tạo câu hỏi mới
 */
questionBankRouter.post("/", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["teacher", "admin"]);
  if (!user) return;

  const { template_type, topic, level, content } = req.body || {};
  if (!template_type || !content) {
    return res.status(400).json({ error: "Thiếu template_type hoặc content." });
  }

  const id = crypto.randomUUID();
  await query<ResultSetHeader>(
    `INSERT INTO question_bank (id, owner_id, template_type, topic, level, content_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, user.id, template_type, topic || null, level || null, JSON.stringify(content)]
  );

  res.json({ ok: true, id });
});

/**
 * GET /api/question-bank/:id
 */
questionBankRouter.get("/:id", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const row = await queryOne<QuestionRow>(
    "SELECT * FROM question_bank WHERE id = ?",
    [req.params.id]
  );

  if (!row) return res.status(404).json({ error: "Câu hỏi không tồn tại." });

  // GV chỉ xem câu của mình (trừ shared), HS chỉ xem shared
  if (user.role === "teacher" && row.owner_id !== user.id && !row.is_shared) {
    return res.status(403).json({ error: "Câu này thuộc về GV khác." });
  }

  res.json({
    ...row,
    content: row.content_json ? JSON.parse(row.content_json) : null,
  });
});

/**
 * POST /api/question-bank/:id/share
 * Publish lên kho chung
 */
questionBankRouter.post("/:id/share", async (req: Request, res: Response) => {
  const user = await requireRole(req, res, ["teacher", "admin"]);
  if (!user) return;

  const row = await queryOne<QuestionRow>(
    "SELECT owner_id, is_shared FROM question_bank WHERE id = ?",
    [req.params.id]
  );

  if (!row) return res.status(404).json({ error: "Câu hỏi không tồn tại." });
  if (row.owner_id !== user.id && user.role !== "admin") {
    return res.status(403).json({ error: "Bạn không sở hữu câu này." });
  }

  await query<ResultSetHeader>(
    "UPDATE question_bank SET is_shared = 1, updated_at = NOW() WHERE id = ?",
    [req.params.id]
  );

  res.json({ ok: true });
});

/**
 * POST /api/question-bank/:id/use
 * Track 1 lượt sử dụng (gọi khi HS làm bài)
 */
questionBankRouter.post("/:id/use", async (req: Request, res: Response) => {
  const user = await requireUser(req, res);
  if (!user) return;

  await query<ResultSetHeader>(
    "UPDATE question_bank SET usage_count = usage_count + 1 WHERE id = ?",
    [req.params.id]
  );

  res.json({ ok: true });
});
