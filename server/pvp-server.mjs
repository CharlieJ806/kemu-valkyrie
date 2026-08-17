/**
 * 对战中继服务(纯转发,不理解游戏语义)。
 * 运行: node pvp-server.mjs   (默认端口 8787,可用 PORT 环境变量覆盖)
 * 房间: 4 位去易混字符房码;首个加入者为宿主,第二位为客机;任一方断开即拆房。
 * 安全: 消息上限 8KB;每连接 10 条/秒;每 IP 加入/建房 10 次/分钟;
 *       PVP_ALLOWED_ORIGINS 环境变量(逗号分隔)设置后启用 Origin 校验。
 */
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const ROOM_TTL_MS = 10 * 60 * 1000; // 空房回收
const PING_MS = 30 * 1000;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ALLOWED_ORIGINS = (process.env.PVP_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** @type {Map<string, {host: import("ws").WebSocket|null, guest: import("ws").WebSocket|null, hostInfo: any, guestInfo: any, lastActive: number}>} */
const rooms = new Map();

/* ---- 每 IP 加入限速(滑动 1 分钟窗口) ---- */
const ipJoin = new Map(); // ip → {count, windowStart}
function ipAllowed(ip) {
  const now = Date.now();
  const e = ipJoin.get(ip);
  if (!e || now - e.windowStart > 60_000) {
    ipJoin.set(ip, { count: 1, windowStart: now });
    return true;
  }
  e.count += 1;
  return e.count <= 10;
}

/* ---- 每连接消息限速(每秒 10 条) ---- */
const msgRate = new WeakMap(); // ws → {count, windowStart}
function msgAllowed(ws) {
  const now = Date.now();
  const e = msgRate.get(ws);
  if (!e || now - e.windowStart > 1000) {
    msgRate.set(ws, { count: 1, windowStart: now });
    return true;
  }
  e.count += 1;
  return e.count <= 10;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function peerOf(room, ws) {
  if (room.host === ws) return room.guest;
  if (room.guest === ws) return room.host;
  return null;
}

function teardownRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  rooms.delete(code);
  for (const m of [room.host, room.guest]) {
    if (m && m.readyState === m.OPEN) {
      send(m, { v: 1, t: "left", reason });
      m.close();
    }
  }
  console.log(`[pvp] 房间 ${code} 关闭(${reason}) 当前房间数 ${rooms.size}`);
}

const wss = new WebSocketServer({ port: PORT, maxPayload: 8 * 1024 }, () => {
  console.log(`[pvp] 对战中继已启动 端口 ${PORT} (Origin 校验:${ALLOWED_ORIGINS.length ? "开" : "关"})`);
});

wss.on("connection", (ws, req) => {
  // Origin 校验(可选)
  if (ALLOWED_ORIGINS.length) {
    const origin = req.headers.origin || "";
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      ws.close(4003, "origin not allowed");
      return;
    }
  }
  const ip = req.socket.remoteAddress || "?";
  /** @type {string|null} */
  let joinedCode = null;

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    if (!msgAllowed(ws)) {
      ws.close(4008, "rate limit");
      return;
    }
    let m;
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!m || typeof m !== "object" || typeof m.t !== "string") return;

    // ---- 控制消息:创建房间(房码由服务端生成,保证不冲突) ----
    if (m.t === "create") {
      if (!ipAllowed(ip)) {
        send(ws, { v: 1, t: "err", msg: "操作太频繁,请稍后再试" });
        return;
      }
      let code = "";
      do {
        code = Array.from(
          { length: 4 },
          () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
        ).join("");
      } while (rooms.has(code));
      rooms.set(code, {
        host: ws,
        guest: null,
        hostInfo: m.cfg || null,
        guestInfo: null,
        lastActive: Date.now(),
      });
      joinedCode = code;
      send(ws, { v: 1, t: "joined", side: "host", room: code });
      console.log(`[pvp] ${ip} 创建房间 ${code} 当前房间数 ${rooms.size}`);
      return;
    }

    // ---- 控制消息:加入房间(房间必须已存在) ----
    if (m.t === "join") {
      const code = String(m.room || "").toUpperCase();
      if (!new RegExp(`^[${CODE_CHARS}]{4}$`).test(code)) {
        send(ws, { v: 1, t: "err", msg: "房码格式错误" });
        return;
      }
      if (!ipAllowed(ip)) {
        send(ws, { v: 1, t: "err", msg: "操作太频繁,请稍后再试" });
        return;
      }
      const room = rooms.get(code);
      if (!room) {
        send(ws, { v: 1, t: "err", msg: "房间不存在或已关闭" });
        return;
      }
      if (room.host === ws || room.guest === ws) return; // 重复加入忽略
      if (!room.host || room.host.readyState !== room.host.OPEN) {
        teardownRoom(code, "宿主失联");
        send(ws, { v: 1, t: "err", msg: "房间已失效,请重试" });
        return;
      }
      if (room.guest) {
        send(ws, { v: 1, t: "err", msg: "房间已满" });
        return;
      }
      room.guest = ws;
      room.guestInfo = m.cfg || null;
      room.lastActive = Date.now();
      joinedCode = code;
      send(ws, { v: 1, t: "joined", side: "guest", room: code });
      // 互发对手信息
      send(room.host, { v: 1, t: "peer", peer: room.guestInfo });
      send(room.guest, { v: 1, t: "peer", peer: room.hostInfo });
      console.log(`[pvp] ${ip} 加入房间 ${code}`);
      return;
    }

    // ---- 其余消息:配对后原样转发给同房另一端 ----
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    room.lastActive = Date.now();
    const peer = peerOf(room, ws);
    if (peer && peer.readyState === peer.OPEN) peer.send(String(data));
  });

  ws.on("close", () => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    const peer = peerOf(room, ws);
    // 房间移交给留下的人(断线即散局:对局判对方胜,由客户端呈现)
    if (peer && peer.readyState === peer.OPEN) {
      if (room.host === ws) {
        // 宿主离开:客机升任房主,房码不变可继续等新对手
        room.host = peer;
        room.guest = null;
        room.hostInfo = room.guestInfo;
        room.guestInfo = null;
        send(peer, { v: 1, t: "promoted" });
        console.log(`[pvp] 房间 ${joinedCode} 宿主离开,客机升任房主`);
      } else {
        room.guest = null;
        room.guestInfo = null;
        send(peer, { v: 1, t: "left", reason: "对方已离开" });
        console.log(`[pvp] 房间 ${joinedCode} 客机离开`);
      }
      joinedCode = null;
      return;
    }
    teardownRoom(joinedCode, "一方断开");
  });
  ws.on("error", () => {
    /* close 会跟随触发,统一在 close 处理 */
  });
});

/* ---- 心跳 + 空房回收 ---- */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    const alive =
      (room.host && room.host.readyState === room.host.OPEN) ||
      (room.guest && room.guest.readyState === room.guest.OPEN);
    if (!alive || now - room.lastActive > ROOM_TTL_MS) {
      teardownRoom(code, alive ? "空转超时" : "无存活连接");
    } else {
      room.lastActive = now; // 有连接在即视为活跃
    }
  }
}, PING_MS);
