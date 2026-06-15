/**
 * server/questionBank.ts — Kho câu hỏi (Template + Content Engine)
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
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { getDb } from "../db/client";
import { requireUser, requireRole } from "./auth";

export const questionBankRouter = Router();

/**
 * GET /api/question-bank?type=reading&topic=Travel
 * Teacher: thấy câu riêng + câu shared
 * Admin: thấy tất cả
 */
questionBankRouter.get("/", (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const db = getDb();
  const { type, topic, shared } = req.query;

  let sql = `SELECT * FROM question_bank WHERE 1=1`;
  const params: any[] = [];

  if (user.role === "teacher") {
    // GV thấy câu của mình + câu shared (kho chung)
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

  const rows = db.prepare(sql).all(...params) as any[];

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
questionBankRouter.post("/", (req: Request, res: Response) => {
  const user = requireRole(req, res, ["teacher", "admin"]);
  if (!user) return;

  const { template_type, topic, level, content } = req.body || {};
  if (!template_type || !content) {
    return res.status(400).json({ error: "Thiếu template_type hoặc content." });
  }

  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO question_bank (id, owner_id, template_type, topic, level, content_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, user.id, template_type, topic || null, level || null, JSON.stringify(content));

  res.json({ ok: true, id });
});

/**
 * GET /api/question-bank/:id
 */
questionBankRouter.get("/:id", (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const row = getDb()
    .prepare("SELECT * FROM question_bank WHERE id = ?")
    .get(req.params.id) as any;

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
questionBankRouter.post("/:id/share", (req: Request, res: Response) => {
  const user = requireRole(req, res, ["teacher", "admin"]);
  if (!user) return;

  const row = getDb()
    .prepare("SELECT owner_id, is_shared FROM question_bank WHERE id = ?")
    .get(req.params.id) as any;

  if (!row) return res.status(404).json({ error: "Câu hỏi không tồn tại." });
  if (row.owner_id !== user.id && user.role !== "admin") {
    return res.status(403).json({ error: "Bạn không sở hữu câu này." });
  }

  getDb()
    .prepare("UPDATE question_bank SET is_shared = 1, updated_at = datetime('now') WHERE id = ?")
    .run(req.params.id);

  res.json({ ok: true });
});

/**
 * POST /api/question-bank/:id/use
 * Track 1 lượt sử dụng (gọi khi HS làm bài)
 */
questionBankRouter.post("/:id/use", (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  getDb()
    .prepare("UPDATE question_bank SET usage_count = usage_count + 1 WHERE id = ?")
    .run(req.params.id);

  res.json({ ok: true });
});
