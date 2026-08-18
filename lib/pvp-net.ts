/* 对战 WebSocket 客户端:原生 API,零依赖。
 * 地址策略(优先级从高到低):
 *   1. ?pvp= 查询参数(开发调试/临时指定);
 *   2. NEXT_PUBLIC_PVP_SERVER 构建环境变量(自建中继的站点用它覆盖);
 *   3. 同域推导 wss/ws + 路径 /ws(仅限自带中继的域名,如 valkyrie.lwair.cn / localhost);
 *   4. 方案A 默认对战服务器(朋友托管的中继,Cloudflare 静态站点等无自带 /ws 时走它)。
 * 服务器为纯中继:join 为控制消息,配对后其余消息原样转发给同房另一端。 */

import type { PvpAct, PvpSide, PvpState } from "./pvp";

export type PvpPeerInfo = { name: string; valkId: number; deck: string[] };

export type PvpDeckMode = "fair" | "own";

export type PvpNetEvt =
  | { t: "joined"; side: PvpSide; room: string }
  | { t: "peer"; peer: PvpPeerInfo }
  | { t: "act"; act: PvpAct }
  | { t: "state"; snap: PvpState }
  | { t: "pick"; picks: number[] }
  | { t: "ready"; on: boolean; picks: number[]; deck?: string[] }
  | { t: "teamSize"; n: number }
  | { t: "again" }
  | { t: "quit" }
  | { t: "mode"; deckMode: PvpDeckMode }
  | { t: "promoted" }
  | { t: "left"; reason: string }
  | { t: "err"; msg: string };

/** 自带对战中继的域名(同域 /ws 可用);列表外站点默认走方案A中继 */
const SELF_RELAY_HOSTS = new Set(["valkyrie.lwair.cn", "localhost", "127.0.0.1"]);
/** 方案A 默认对战服务器(朋友托管的中继,已验证放行各站点 Origin) */
const DEFAULT_PVP_SERVER = "wss://valkyrie.lwair.cn/ws";

/** 对战服务器地址(点"对战"即生效,无需手动加参数) */
export function pvpServerUrl(): string {
  if (typeof window === "undefined") return "";
  // 1. ?pvp= 查询参数(最高优先级)
  const q = new URLSearchParams(window.location.search).get("pvp");
  if (q) return q;
  // 2. 构建环境变量覆盖(自建中继时在构建平台设 NEXT_PUBLIC_PVP_SERVER)
  const env = process.env.NEXT_PUBLIC_PVP_SERVER;
  if (env) return env;
  // 3. 自带中继的域名 → 同域推导
  const host = window.location.host;
  if (SELF_RELAY_HOSTS.has(host)) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${host}/ws`;
  }
  // 4. 方案A:默认走朋友托管的中继
  return DEFAULT_PVP_SERVER;
}

export class PvpNet {
  private ws: WebSocket | null = null;
  private closed = false;

  constructor(private onEvt: (evt: PvpNetEvt) => void) {}

  /** 创建房间(房码由服务端生成,本端为宿主) */
  create(name: string, cfg: PvpPeerInfo): void {
    this.connectAndSend({ v: 1, t: "create", name, cfg });
  }

  /** 加入房间(房间须已存在) */
  join(room: string, name: string, cfg: PvpPeerInfo): void {
    this.connectAndSend({ v: 1, t: "join", room, name, cfg });
  }

  private connectAndSend(first: Record<string, unknown>): void {
    this.closed = false;
    const url = pvpServerUrl();
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.onEvt({ t: "err", msg: "无法连接对战服务器" });
      return;
    }
    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify(first));
    };
    this.ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(String(ev.data));
        if (d && typeof d === "object" && typeof d.t === "string") {
          this.onEvt(d as PvpNetEvt);
        }
      } catch {
        /* 非JSON忽略 */
      }
    };
    this.ws.onclose = () => {
      if (!this.closed) this.onEvt({ t: "left", reason: "连接已断开" });
    };
    this.ws.onerror = () => {
      /* onclose 会跟一次,交给它处理 */
    };
  }

  /** 发送动作(客机 → 宿主) */
  sendAct(act: PvpAct): void {
    this.send({ v: 1, t: "act", act });
  }

  /** 推送快照(宿主 → 客机) */
  sendState(snap: PvpState): void {
    this.send({ v: 1, t: "state", snap });
  }

  /** 房间信令(选人/准备/再来/认输/模式等,经服务器原样转发给对方) */
  sendMsg(m: Record<string, unknown>): void {
    this.send({ v: 1, ...m });
  }

  private send(m: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(m));
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
