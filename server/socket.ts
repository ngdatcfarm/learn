/**
 * server/socket.ts — Socket.IO singleton + emit helpers
 *
 * Quản lý 1 instance IO duy nhất cho toàn app. Attach vào HTTP server
 * trong server.ts sau khi `http.createServer(app)`.
 *
 * Namespace pattern: mỗi feature có 1 namespace riêng (vd: /live-help).
 * Tránh 1 namespace chung → giảm coupling, dễ phân quyền theo namespace.
 *
 * Emit helpers (emitToNamespace / emitToRoom) cho phép REST handlers
 * broadcast socket events mà không cần import trực tiếp io instance.
 *
 * Slice B (Step 12b): live-help namespace + auth handshake + room mgmt
 * Slice C (Step 12c): simple-peer signaling trong cùng namespace
 */

import { Server as IOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";

let _io: IOServer | null = null;

/**
 * Init Socket.IO với HTTP server. Idempotent — gọi nhiều lần chỉ trả về
 * instance đầu tiên.
 */
export function initSocketIO(httpServer: HttpServer): IOServer {
  if (_io) return _io;
  _io = new IOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" }, // dev only — prod nên restrict
    pingTimeout: 30_000,
    pingInterval: 25_000,
  });
  console.log("✓ Socket.IO initialized");
  return _io;
}

/**
 * Lấy instance IO hiện tại. Throw nếu chưa init.
 */
export function getIO(): IOServer {
  if (!_io) {
    throw new Error("Socket.IO chưa được init. Gọi initSocketIO() trong server.ts.");
  }
  return _io;
}

/**
 * Emit 1 event tới tất cả clients trong 1 namespace + room.
 * Convenience cho REST handlers muốn broadcast.
 */
export function emitToRoom(
  namespace: string,
  room: string,
  event: string,
  data: unknown
): void {
  if (!_io) return; // silent no-op khi socket chưa init
  _io.of(namespace).to(room).emit(event, data);
}

/**
 * Emit 1 event tới cả namespace (VD: broadcast announcement).
 */
export function emitToNamespace(
  namespace: string,
  event: string,
  data: unknown
): void {
  if (!_io) return;
  _io.of(namespace).emit(event, data);
}