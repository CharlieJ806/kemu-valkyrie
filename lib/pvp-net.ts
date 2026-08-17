/* 对战 WebSocket 客户端:原生 API,零依赖。
 * 地址策略:默认同域推导 wss/ws + 路径 /ws;?pvp= 查询参数覆盖(开发调试用)。
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
  | { t: "ready"; on: boolean; picks: number[] }
  | { t: "teamSize"; n: number }
  | { t: "again" }
  | { t: "quit" }
  | { t: "mode"; deckMode: PvpDeckMode }
  | { t: "promoted" }
  | { t: "left"; reason: string }
  | { t: "err"; msg: string };

/** 对战服务器地址:同域推导,?pvp= 覆盖 */
export function pvpServerUrl(): string {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search).get("pvp");
  if (q) return q;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
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
