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

interface AccessCheck {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Verify user (student/teacher) có phải member của session không. */
async function verifySessionAccess(
  sessionId: string,
  user: SocketUser
): Promise<AccessCheck> {
  const session = await queryOne<SessionRow>(
    `SELECT id, student_id, teacher_id, status FROM live_help_sessions WHERE id = ?`,
    [sessionId]
  );
  if (!session) return { ok: false, status: 404, error: "Session not found" };
  if (user.role === "student" && session.student_id !== user.id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (user.role === "teacher" && session.teacher_id !== user.id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (user.role !== "student" && user.role !== "teacher") {
    return { ok: false, status: 403, error: "Role not allowed" };
  }
  return { ok: true };
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

    // Join user-room (mỗi user có 1 room riêng `user:${userId}`).
    // Dùng để server gửi observe:incoming + screen:request-capture tới 1 user
    // cụ thể mà không cần biết socket id (vd: HS có nhiều tab).
    socket.join(`user:${user.id}`);

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
      // Thông báo peer còn lại (nếu đang trong call) — giúp đối phương hangup sớm
      // không phải đợi ICE timeout
      for (const room of socket.rooms) {
        if (room.startsWith("session:")) {
          socket.to(room).emit("call:peer-left", {
            sessionId: room.slice("session:".length),
            user_id: user.id,
            role: user.role,
          });
        }
      }
    });

    // ============================================================
    // WebRTC signaling — Voice + Screen share
    // Pattern chung: verify access → forward tới peer kia trong room
    // ============================================================

    /** Helper: verify session access + forward payload tới peer kia trong room. */
    async function forwardSignal(
      eventName: string,
      payload: { sessionId?: string; [k: string]: unknown }
    ): Promise<void> {
      const sessionId = payload?.sessionId;
      if (!sessionId) {
        socket.emit("error", { message: "Missing sessionId" });
        return;
      }
      const access = await verifySessionAccess(sessionId, user);
      if (access.ok === false) {
        socket.emit("error", { message: access.error });
        return;
      }
      // Forward tới peer kia (không gửi lại cho self)
      socket.to(`session:${sessionId}`).emit(eventName, {
        ...payload,
        from: user.id,
        from_role: user.role,
      });
    }

    // ---- Voice signaling ----
    socket.on("call:offer", (p) => forwardSignal("call:offer", p));
    socket.on("call:answer", (p) => forwardSignal("call:answer", p));
    socket.on("call:ice", (p) => forwardSignal("call:ice", p));
    socket.on("call:hangup", (p) => forwardSignal("call:hangup", p));

    // ---- Screen share signaling ----
    // Chỉ HS mới được share (teacher chỉ nhận)
    socket.on("call:screen-offer", async (p) => {
      if (user.role !== "student") {
        return socket.emit("error", { message: "Only student can share screen" });
      }
      await forwardSignal("call:screen-offer", p);
    });
    socket.on("call:screen-answer", (p) => { forwardSignal("call:screen-answer", p); });
    socket.on("call:screen-ice", (p) => { forwardSignal("call:screen-ice", p); });
    socket.on("call:screen-stop", async (p) => {
      // Chỉ HS mới stop (cũng chỉ HS share)
      if (user.role !== "student") {
        return socket.emit("error", { message: "Only student can stop screen share" });
      }
      await forwardSignal("call:screen-stop", p);
    });

    // ============================================================
    // Step 12d — Teacher Observation Mode (GV-driven)
    //   - observe:start / observe:accept / observe:reject / observe:end
    //   - screen:state (HS → GV), screen:request-capture (GV → HS)
    //   - whiteboard:open / :stroke / :clear / :close
    //
    // Lock semantics: 1 HS / 1 observe tại 1 thời điểm (check active session).
    // observe session dùng trigger='teacher_observe' trong live_help_sessions.
    // Strokes persist qua REST PUT /api/live/help/whiteboard/:sessionId/:questionId.
    // ============================================================

    // ---- observe:start (teacher) ----
    socket.on("observe:start", async (payload: { studentId?: string; assignmentId?: string }) => {
      try {
        if (user.role !== "teacher") {
          return socket.emit("error", { message: "Only teacher can observe" });
        }
        const studentId = payload?.studentId;
        if (!studentId) {
          return socket.emit("error", { message: "Missing studentId" });
        }

        // Verify HS in teacher's class
        const inClass = await queryOne<RowDataPacket>(
          `SELECT 1 FROM class_members cm
           JOIN classes c ON c.id = cm.class_id
           WHERE cm.student_id = ? AND c.teacher_id = ? LIMIT 1`,
          [studentId, user.id]
        );
        if (!inClass) {
          return socket.emit("observe:error", {
            message: "HS không ở lớp bạn dạy.",
          });
        }

        // Lock check: HS đã có active observe session chưa?
        const existing = await queryOne<
          RowDataPacket & { id: string; teacher_id: string }
        >(
          `SELECT id, teacher_id FROM live_help_sessions
           WHERE student_id = ? AND \`trigger\`='teacher_observe' AND status='active'
           LIMIT 1`,
          [studentId]
        );
        if (existing) {
          if (existing.teacher_id === user.id) {
            return socket.emit("observe:error", {
              message: "Bạn đang observe HS này rồi.",
              session_id: existing.id,
            });
          }
          return socket.emit("observe:error", {
            message: "HS đang được GV khác observe. Vui lòng đợi hoặc chọn HS khác.",
          });
        }

        // Lấy class_id (lớp GV dạy HS này)
        const classRow = await queryOne<
          RowDataPacket & { class_id: string; teacher_name: string }
        >(
          `SELECT cm.class_id, u.name AS teacher_name
           FROM class_members cm
           JOIN classes c ON c.id = cm.class_id
           JOIN users u ON u.id = ?
           WHERE cm.student_id = ? AND c.teacher_id = ?
           ORDER BY cm.joined_at ASC LIMIT 1`,
          [user.id, studentId, user.id]
        );

        const sessionId = crypto.randomUUID();
        const now = new Date().toISOString().slice(0, 19).replace("T", " ");
        await query(
          `INSERT INTO live_help_sessions
             (id, class_id, student_id, teacher_id, assignment_id, \`trigger\`, \`level\`, status, started_at, created_at)
           VALUES (?, ?, ?, ?, ?, 'teacher_observe', 'mixed', 'active', ?, ?)`,
          [
            sessionId,
            classRow?.class_id ?? null,
            studentId,
            user.id,
            payload.assignmentId ?? null,
            now,
            now,
          ]
        );

        // Get HS info
        const student = await queryOne<
          RowDataPacket & { name: string; username: string }
        >(
          `SELECT name, username FROM users WHERE id = ? AND deleted_at IS NULL`,
          [studentId]
        );

        // GV join session room trước
        await socket.join(`session:${sessionId}`);
        socket.emit("observe:started", {
          session_id: sessionId,
          student_id: studentId,
          student_name: student?.name ?? "",
          started_at: now,
        });

        // Push observe:incoming tới HS user-room (HS auto-accepts sau)
        liveHelpNs.to(`user:${studentId}`).emit("observe:incoming", {
          session_id: sessionId,
          teacher_id: user.id,
          teacher_name: classRow?.teacher_name ?? "GV",
          student_id: studentId,
          student_name: student?.name ?? "",
          assignment_id: payload.assignmentId ?? null,
          started_at: now,
        });

        await logAudit({
          actorId: user.id,
          action: "teach.observe.start",
          targetType: "live_help_session",
          targetId: sessionId,
          details: {
            student_id: studentId,
            assignment_id: payload.assignmentId ?? null,
          },
        });
      } catch (err: any) {
        console.error("[live-help socket] observe:start failed:", err);
        socket.emit("observe:error", { message: err.message });
      }
    });

    // ---- observe:accept (student) ----
    socket.on("observe:accept", async (payload: { sessionId?: string }) => {
      try {
        if (user.role !== "student") {
          return socket.emit("error", { message: "Only student can accept" });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }

        const session = await queryOne<
          RowDataPacket & {
            student_id: string;
            teacher_id: string;
            status: string;
          }
        >(
          `SELECT student_id, teacher_id, status FROM live_help_sessions WHERE id = ?`,
          [sessionId]
        );
        if (!session || session.student_id !== user.id) {
          return socket.emit("observe:error", {
            message: "Session không tồn tại / không phải của bạn.",
          });
        }
        if (session.status !== "active") {
          return socket.emit("observe:error", {
            message: "Session không active.",
          });
        }

        // HS join session room
        await socket.join(`session:${sessionId}`);

        // Broadcast observe:ready tới cả room (GV + HS)
        liveHelpNs.to(`session:${sessionId}`).emit("observe:ready", {
          session_id: sessionId,
          student_id: user.id,
        });
      } catch (err: any) {
        console.error("[live-help socket] observe:accept failed:", err);
        socket.emit("observe:error", { message: err.message });
      }
    });

    // ---- observe:reject (student) ----
    socket.on("observe:reject", async (payload: { sessionId?: string; reason?: string }) => {
      try {
        if (user.role !== "student") {
          return socket.emit("error", { message: "Only student can reject" });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }

        const session = await queryOne<
          RowDataPacket & {
            student_id: string;
            teacher_id: string;
            status: string;
          }
        >(
          `SELECT student_id, teacher_id, status FROM live_help_sessions WHERE id = ?`,
          [sessionId]
        );
        if (!session || session.student_id !== user.id) {
          return socket.emit("observe:error", {
            message: "Session không tồn tại.",
          });
        }
        if (session.status !== "active") return;

        const now = new Date().toISOString().slice(0, 19).replace("T", " ");
        await query(
          `UPDATE live_help_sessions
           SET status='ended', ended_at=?, outcome='gave_up'
           WHERE id = ?`,
          [now, sessionId]
        );

        // Notify GV (HS may not be in session room yet, use user-room backup)
        liveHelpNs.to(`session:${sessionId}`).emit("observe:rejected", {
          session_id: sessionId,
          student_id: user.id,
          reason: payload.reason ?? null,
        });

        await logAudit({
          actorId: user.id,
          action: "teach.observe.reject",
          targetType: "live_help_session",
          targetId: sessionId,
          details: { reason: payload.reason ?? null },
        });
      } catch (err: any) {
        console.error("[live-help socket] observe:reject failed:", err);
        socket.emit("observe:error", { message: err.message });
      }
    });

    // ---- observe:end (either) ----
    socket.on("observe:end", async (payload: { sessionId?: string; outcome?: string }) => {
      try {
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const session = await queryOne<
          RowDataPacket & {
            student_id: string;
            teacher_id: string;
            status: string;
            started_at: string | null;
          }
        >(
          `SELECT student_id, teacher_id, status, started_at FROM live_help_sessions WHERE id = ?`,
          [sessionId]
        );
        if (!session) {
          return socket.emit("observe:error", {
            message: "Session không tồn tại.",
          });
        }
        if (session.status === "ended") return;

        // Verify caller is teacher or student of session
        if (user.id !== session.teacher_id && user.id !== session.student_id) {
          return socket.emit("observe:error", { message: "Forbidden" });
        }

        // Default outcome
        let outcome = payload.outcome;
        if (!outcome) {
          outcome = user.id === session.teacher_id ? "teacher_left" : "understood";
        }
        const allowed = ["understood", "gave_up", "timeout", "teacher_left"];
        if (!allowed.includes(outcome)) outcome = "teacher_left";

        const now = new Date().toISOString().slice(0, 19).replace("T", " ");
        await query(
          `UPDATE live_help_sessions
           SET status='ended', ended_at=?, outcome=?
           WHERE id = ?`,
          [now, outcome, sessionId]
        );

        // Duration for audit
        const durationSec = session.started_at
          ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
          : null;

        // Broadcast ended event
        liveHelpNs.to(`session:${sessionId}`).emit("observe:ended", {
          session_id: sessionId,
          outcome,
          ended_by_role: user.role,
          duration_sec: durationSec,
        });

        await logAudit({
          actorId: user.id,
          action: "teach.observe.end",
          targetType: "live_help_session",
          targetId: sessionId,
          details: {
            outcome,
            ended_by_role: user.role,
            duration_sec: durationSec,
          },
        });
      } catch (err: any) {
        console.error("[live-help socket] observe:end failed:", err);
        socket.emit("observe:error", { message: err.message });
      }
    });

    // ---- screen:state (HS → GV) — periodic JSON snapshot ----
    // HS gửi state mỗi ~1.5s. Server forward tới GV trong room (không persist).
    socket.on("screen:state", async (payload: { sessionId?: string; state?: unknown }) => {
      try {
        if (user.role !== "student") {
          return socket.emit("error", { message: "Only student emits screen:state" });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const access = await verifySessionAccess(sessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        // Forward to GV in session room (exclude self)
        socket.to(`session:${sessionId}`).emit("screen:state", {
          session_id: sessionId,
          from: user.id,
          state: payload.state,
          received_at: new Date().toISOString(),
        });
      } catch (err: any) {
        // Không spam log — chỉ warn
        console.warn("[live-help socket] screen:state failed:", err.message);
      }
    });

    // ---- screen:request-capture (GV → HS) — GV yêu cầu HS share màn hình thật ----
    socket.on("screen:request-capture", async (payload: { sessionId?: string }) => {
      try {
        if (user.role !== "teacher") {
          return socket.emit("error", {
            message: "Only teacher requests capture",
          });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const access = await verifySessionAccess(sessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        socket.to(`session:${sessionId}`).emit("screen:request-capture", {
          session_id: sessionId,
          from: user.id,
        });
      } catch (err: any) {
        console.error("[live-help socket] screen:request-capture failed:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // ---- whiteboard:open (GV → HS) ----
    socket.on("whiteboard:open", async (payload: { sessionId?: string; questionId?: string; questionIdx?: number }) => {
      try {
        if (user.role !== "teacher") {
          return socket.emit("error", { message: "Only teacher opens whiteboard" });
        }
        const sessionId = payload?.sessionId;
        const questionId = payload?.questionId;
        if (!sessionId || !questionId) {
          return socket.emit("error", {
            message: "Missing sessionId/questionId",
          });
        }
        const access = await verifySessionAccess(sessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        liveHelpNs.to(`session:${sessionId}`).emit("whiteboard:open", {
          session_id: sessionId,
          question_id: questionId,
          question_idx: payload.questionIdx ?? null,
          from: user.id,
          opened_at: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error("[live-help socket] whiteboard:open failed:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // ---- whiteboard:stroke (GV → HS) — client-side throttle ~50ms ----
    socket.on("whiteboard:stroke", async (payload: { sessionId?: string; stroke?: unknown }) => {
      try {
        if (user.role !== "teacher") {
          return socket.emit("error", { message: "Only teacher draws" });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const access = await verifySessionAccess(sessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        socket.to(`session:${sessionId}`).emit("whiteboard:stroke", {
          session_id: sessionId,
          stroke: payload.stroke,
          from: user.id,
        });
      } catch (err: any) {
        // Không spam — strokes rất thường xuyên
        // console.warn("[live-help socket] whiteboard:stroke failed:", err.message);
      }
    });

    // ---- whiteboard:clear (GV) ----
    socket.on("whiteboard:clear", async (payload: { sessionId?: string }) => {
      try {
        if (user.role !== "teacher") {
          return socket.emit("error", { message: "Only teacher clears" });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const access = await verifySessionAccess(sessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        liveHelpNs.to(`session:${sessionId}`).emit("whiteboard:clear", {
          session_id: sessionId,
          from: user.id,
        });
      } catch (err: any) {
        console.error("[live-help socket] whiteboard:clear failed:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // ---- whiteboard:close (GV) — broadcast close event ----
    // Persist strokes qua REST PUT /api/live/help/whiteboard/... (client trigger).
    socket.on("whiteboard:close", async (payload: { sessionId?: string }) => {
      try {
        if (user.role !== "teacher") {
          return socket.emit("error", { message: "Only teacher closes" });
        }
        const sessionId = payload?.sessionId;
        if (!sessionId) {
          return socket.emit("error", { message: "Missing sessionId" });
        }
        const access = await verifySessionAccess(sessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        liveHelpNs.to(`session:${sessionId}`).emit("whiteboard:close", {
          session_id: sessionId,
          from: user.id,
          closed_at: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error("[live-help socket] whiteboard:close failed:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // ============================================================
    // Step 13b — Class Session ("Lớp hôm nay") realtime events
    //
    // Room: `class:<session_id>` (cả GV + HS join khi class_sessions.status='active')
    //
    // Client → server:
    //   - class:join / class:leave           (subscribe tới class room)
    //   - class:state-req                    (xin state hiện tại)
    //   - class:tab-visibility               (HS gửi visibility → broadcast + log)
    //
    // Server → client:
    //   - class:state                        (current session state)
    //   - class:tab-state-changed            (GV nhận tab visibility event)
    // ============================================================

    interface ClassSessionSocketRow extends RowDataPacket {
      id: string;
      class_id: string;
      teacher_id: string;
      status: "planned" | "active" | "ended" | "cancelled";
    }

    /** Verify user thuộc class_sessions (teacher phụ trách OR student member). */
    async function verifyClassSessionAccess(
      classSessionId: string,
      u: SocketUser
    ): Promise<
      | { ok: true; session: ClassSessionSocketRow }
      | { ok: false; error: string }
    > {
      const session = await queryOne<ClassSessionSocketRow>(
        `SELECT id, class_id, teacher_id, status FROM class_sessions WHERE id = ?`,
        [classSessionId]
      );
      if (!session) return { ok: false, error: "Class session not found" };
      if (u.role === "teacher" && session.teacher_id !== u.id) {
        return { ok: false, error: "Not your class session" };
      }
      if (u.role === "student") {
        const inClass = await queryOne<RowDataPacket>(
          `SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ? LIMIT 1`,
          [session.class_id, u.id]
        );
        if (!inClass) return { ok: false, error: "Not in this class" };
      }
      if (u.role !== "student" && u.role !== "teacher") {
        return { ok: false, error: "Role not allowed" };
      }
      return { ok: true, session };
    }

    // ---- class:join (subscribe tới class:<sessionId> room) ----
    socket.on("class:join", async (payload: { classSessionId?: string }) => {
      try {
        const classSessionId = payload?.classSessionId;
        if (!classSessionId) {
          return socket.emit("error", { message: "Missing classSessionId" });
        }
        const access = await verifyClassSessionAccess(classSessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        await socket.join(`class:${classSessionId}`);
        // Trả state hiện tại cho client
        socket.emit("class:state", {
          class_session_id: classSessionId,
          status: access.session.status,
          class_id: access.session.class_id,
          teacher_id: access.session.teacher_id,
        });
      } catch (err: any) {
        console.error("[live-help socket] class:join failed:", err);
        socket.emit("error", { message: err.message });
      }
    });

    // ---- class:leave ----
    socket.on("class:leave", async (payload: { classSessionId?: string }) => {
      const classSessionId = payload?.classSessionId;
      if (!classSessionId) return;
      await socket.leave(`class:${classSessionId}`);
    });

    // ---- class:state-req (HS reconnect → xin state) ----
    socket.on("class:state-req", async (payload: { classSessionId?: string }) => {
      try {
        const classSessionId = payload?.classSessionId;
        if (!classSessionId) return;
        const access = await verifyClassSessionAccess(classSessionId, user);
        if (access.ok === false) {
          return socket.emit("error", { message: access.error });
        }
        socket.emit("class:state", {
          class_session_id: classSessionId,
          status: access.session.status,
          class_id: access.session.class_id,
          teacher_id: access.session.teacher_id,
        });
      } catch (err: any) {
        socket.emit("error", { message: err.message });
      }
    });

    // ---- class:tab-visibility (student → broadcast to GV + log) ----
    socket.on(
      "class:tab-visibility",
      async (payload: {
        classSessionId?: string;
        event?: "visible" | "hidden";
        visible_ms?: number;
      }) => {
        try {
          if (user.role !== "student") {
            return socket.emit("error", { message: "Only student reports visibility" });
          }
          const classSessionId = payload?.classSessionId;
          const event = payload?.event;
          if (!classSessionId || (event !== "visible" && event !== "hidden")) {
            return socket.emit("error", { message: "Missing classSessionId or event" });
          }
          const access = await verifyClassSessionAccess(classSessionId, user);
          if (access.ok === false) {
            return socket.emit("error", { message: access.error });
          }

          const now = new Date().toISOString().slice(0, 19).replace("T", " ");
          const visibleMs =
            typeof payload.visible_ms === "number"
              ? Math.max(0, Math.floor(payload.visible_ms))
              : 0;

          // Append-only log
          await query(
            `INSERT INTO class_session_tab_events
               (id, class_session_id, student_id, event, session_visible_ms, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              classSessionId,
              user.id,
              event,
              visibleMs,
              now,
            ]
          );

          // Engagement event
          await query(
            `INSERT INTO engagement_events (id, user_id, event, value, context_json, occurred_at)
             VALUES (?, ?, ?, NULL, ?, ?)`,
            [
              crypto.randomUUID(),
              user.id,
              event === "visible" ? "class_tab_visible" : "class_tab_hidden",
              JSON.stringify({ class_session_id: classSessionId }),
              now,
            ]
          );

          // Broadcast to GV (room `class:<id>`)
          liveHelpNs.to(`class:${classSessionId}`).emit("class:tab-state-changed", {
            student_id: user.id,
            event,
            occurred_at: now,
            visible_ms: visibleMs,
          });
        } catch (err: any) {
          console.error("[live-help socket] class:tab-visibility failed:", err);
          socket.emit("error", { message: err.message });
        }
      }
    );
  });

  console.log("✓ /live-help namespace initialized");
  return liveHelpNs;
}