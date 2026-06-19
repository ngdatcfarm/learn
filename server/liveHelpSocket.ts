/**
 * server/liveHelpSocket.ts — Socket.IO namespace `/live-help`
 *
 * Step 12b (Slice B): realtime highlight + (sau này) voice signaling.
 *
 * Auth:
 *   Client gửi `socket.handshake.auth.token` (apex_auth_token) → verify
 *   qua auth_sessions table → set `socket.data.user = { id, role }`.
 *   Reject nếu invalid / expired.
 *
 * Rooms:
 *   `session:${sessionId}` — GV + HS join khi active session.
 *   Broadcast events tới room thay vì individual sockets.
 *
 * Events (server → client):
 *   - session:joined          — xác nhận join thành công
 *   - session:ended           — session ended (broadcast từ REST /end)
 *   - hint:new                — hint mới (broadcast từ REST /hint)
 *   - highlight:show          — GV broadcast highlight → HS overlay
 *   - highlight:clear         — GV clear → HS overlay gone
 *
 * Events (client → server):
 *   - session:join            — { sessionId } → join room
 *   - session:leave           — { sessionId }
 *   - highlight:show          — { sessionId, text, color? } (teacher only)
 *   - highlight:clear         — { sessionId } (teacher only)
 *
 * Slice C sẽ thêm voice signaling events vào cùng namespace:
 *   - call:offer / call:answer / call:ice-candidate / call:hangup
 */

import { Namespace } from "socket.io";
import crypto from "node:crypto";
import { getIO } from "./socket";
import { query, queryOne, RowDataPacket } from "../db/client";
import { logAudit } from "./audit";

interface SocketUser {
  id: string;
  role: "student" | "parent" | "teacher" | "admin";
}

interface SessionRow extends RowDataPacket {
  id: string;
  student_id: string;
  teacher_id: string;
  status: "pending" | "active" | "ended";
}

interface HighlightRow extends RowDataPacket {
  id: string;
  session_id: string;
  teacher_id: string;
  selector: string;
  color: string;
  note: string | null;
  created_at: string;
}

/**
 * Init `/live-help` namespace — gọi 1 lần khi server boot.
 * Attach auth middleware + event handlers.
 */
export function initLiveHelpSocket(): Namespace {
  const io = getIO();
  const liveHelpNs = io.of("/live-help");

  // ============================================================
  // Auth middleware — verify apex_auth_token từ handshake
  // Gộp user info + expiry trong 1 query.
  // ============================================================
  liveHelpNs.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error("Missing auth token"));
      }
      const session = await queryOne<RowDataPacket & SocketUser & { expires_at: string }>(
        `SELECT u.id, u.role, s.expires_at
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND u.deleted_at IS NULL`,
        [token]
      );
      if (!session) {
        return next(new Error("Invalid auth token"));
      }
      if (new Date(session.expires_at).getTime() < Date.now()) {
        return next(new Error("Session expired"));
      }
      socket.data.user = { id: session.id, role: session.role };
      next();
    } catch (err: any) {
      next(new Error("Auth check failed: " + err.message));
    }
  });

  // ============================================================
  // Connection handler
  // ============================================================
  liveHelpNs.on("connection", (socket) => {
    const user = socket.data.user as SocketUser;
    console.log(`[live-help socket] ${user.role}/${user.id} connected (${socket.id})`);

    // ---- session:join ----
    socket.on("session:join", async (payload: { sessionId?: string }) => {
      try {
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const session = await queryOne<SessionRow>(
          `SELECT id, student_id, teacher_id, status FROM live_help_sessions WHERE id = ?`,
          [sessionId]
        );
        if (!session) {
          return socket.emit("error", { message: "Session not found" });
        }
        // Verify access
        if (user.role === "student" && session.student_id !== user.id) {
          return socket.emit("error", { message: "Forbidden" });
        }
        if (user.role === "teacher" && session.teacher_id !== user.id) {
          return socket.emit("error", { message: "Forbidden" });
        }
        if (user.role !== "student" && user.role !== "teacher") {
          return socket.emit("error", { message: "Role not allowed" });
        }
        await socket.join(`session:${sessionId}`);
        socket.emit("session:joined", { sessionId });

        // Replay existing highlights cho client vừa join (vd: HS refresh trang)
        if (session.status === "active") {
          const highlights = await query<HighlightRow[]>(
            `SELECT id, session_id, teacher_id, selector, color, note, created_at
             FROM live_help_highlights
             WHERE session_id = ?
             ORDER BY created_at DESC LIMIT 1`,
            [sessionId]
          );
          if (highlights.length > 0) {
            socket.emit("highlight:show", highlights[0]); // chỉ hiển thị 1 cái mới nhất
          }
        }
      } catch (err: any) {
        console.error("[live-help socket] session:join failed:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // ---- session:leave ----
    socket.on("session:leave", async (payload: { sessionId?: string }) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) return;
      await socket.leave(`session:${sessionId}`);
    });

    // ---- highlight:show (teacher only) ----
    socket.on(
      "highlight:show",
      async (payload: {
        sessionId?: string;
        selector?: string;
        color?: string;
        note?: string;
      }) => {
        try {
          if (user.role !== "teacher") {
            return socket.emit("error", { message: "Only teacher can highlight" });
          }
          const { sessionId, selector, color, note } = payload || {};
          if (!sessionId) {
            return socket.emit("error", { message: "Missing sessionId" });
          }
          if (!selector || typeof selector !== "string" || selector.length > 255) {
            return socket.emit("error", { message: "Missing or invalid selector" });
          }

          // Verify session
          const session = await queryOne<SessionRow>(
            `SELECT id, student_id, teacher_id, status FROM live_help_sessions WHERE id = ?`,
            [sessionId]
          );
          if (!session || session.teacher_id !== user.id) {
            return socket.emit("error", { message: "Session not found / not yours" });
          }
          if (session.status === "ended") {
            return socket.emit("error", { message: "Session ended" });
          }

          // Persist
          const id = crypto.randomUUID();
          const now = new Date().toISOString().slice(0, 19).replace("T", " ");
          const finalColor = color && typeof color === "string" && color.length <= 16 ? color : "yellow";

          await query(
            `INSERT INTO live_help_highlights
              (id, session_id, teacher_id, selector, color, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, sessionId, user.id, selector, finalColor, note ?? null, now]
          );

          // Broadcast to room (HS nhận + GV xác nhận)
          liveHelpNs.to(`session:${sessionId}`).emit("highlight:show", {
            id,
            session_id: sessionId,
            teacher_id: user.id,
            selector,
            color: finalColor,
            note: note ?? null,
            created_at: now,
          });

          await logAudit({
            actorId: user.id,
            action: "live_help.highlight",
            targetType: "live_help_session",
            targetId: sessionId,
            details: { highlight_id: id, color: finalColor, has_note: !!note },
          });
        } catch (err: any) {
          console.error("[live-help socket] highlight:show failed:", err);
          socket.emit("error", { message: err.message });
        }
      }
    );

    // ---- highlight:clear (teacher only) ----
    socket.on("highlight:clear", async (payload: { sessionId?: string }) => {
      try {
        if (user.role !== "teacher") {
          return socket.emit("error", { message: "Only teacher can clear" });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const session = await queryOne<SessionRow>(
          `SELECT id, teacher_id FROM live_help_sessions WHERE id = ?`,
          [sessionId]
        );
        if (!session || session.teacher_id !== user.id) {
          return socket.emit("error", { message: "Forbidden" });
        }
        // Broadcast clear — không xóa DB (giữ audit trail)
        liveHelpNs.to(`session:${sessionId}`).emit("highlight:clear", { sessionId });
      } catch (err: any) {
        socket.emit("error", { message: err.message });
      }
    });

    // ---- disconnect ----
    socket.on("disconnect", (reason) => {
      console.log(`[live-help socket] ${user.role}/${user.id} disconnected: ${reason}`);
    });
  });

  console.log("✓ /live-help namespace initialized");
  return liveHelpNs;
}