"use client";

/* 对战会话 store(纯内存,不持久化):网络事件/引擎结算/音效等副作用全部收在
 * 模块作用域,PvpScreen 只做渲染与点击分发 — 与 store.ts 的房屋风格一致。
 * 宿主引擎态(engine)与 WebSocket 连接(net)为模块级单例。 */

import { create } from "zustand";
import { AudioEngine } from "./audio";
import {
  createPvpState,
  pvpApply,
  pvpSnapshot,
  pvpTick,
  type PvpAct,
  type PvpCfg,
  type PvpSide,
  type PvpState,
} from "./pvp";
import { PvpNet, type PvpNetEvt, type PvpPeerInfo } from "./pvp-net";

type Mode = "idle" | "room" | "battle";

type PvpStore = {
  mode: Mode;
  side: PvpSide;
  room: string;
  peer: PvpPeerInfo | null;
  st: PvpState | null;
  info: string;
  /** 剩余答题毫秒(host 由引擎时钟换算,guest 由快照携带+本地递减) */
  remainMs: number;
  /** 创建房间(room 传 null)或加入既有房间;房码统一由服务端回包 */
  requestJoin: (room: string | null, name: string, cfg: PvpPeerInfo) => void;
  hostStart: (cfg: PvpCfg, peerCfg: PvpCfg) => void;
  act: (a: PvpAct) => void;
  leave: (msg: string) => void;
};

let net: PvpNet | null = null;
/** 宿主引擎态(仅 side=host 时存在) */
let engine: PvpState | null = null;

export const usePvpStore = create<PvpStore>((set, get) => ({
  mode: "idle",
  side: "host",
  room: "",
  peer: null,
  st: null,
  info: "",
  remainMs: 15000,

  requestJoin: (room, name, cfg) => {
    net?.close();
    engine = null;
    set({ mode: "idle", peer: null, st: null, info: "连接对战服务器…" });
    net = new PvpNet(handleEvt);
    if (room) net.join(room, name, cfg);
    else net.create(name, cfg);
  },

  hostStart: (cfg, peerCfg) => {
    AudioEngine.sfx("boss");
    engine = createPvpState(cfg, peerCfg);
    const snap = pvpSnapshot(engine);
    set({
      mode: "battle",
      st: snap,
      remainMs: snap.qRemainMs,
    });
    net?.sendState(snap);
  },

  act: (a) => {
    const { side, mode } = get();
    if (mode !== "battle") return;
    if (side === "host") {
      if (engine && pvpApply(engine, "host", a)) pushEngine(set);
    } else {
      net?.sendAct(a);
    }
  },

  leave: (msg) => {
    net?.close();
    net = null;
    engine = null;
    set({
      mode: "idle",
      peer: null,
      st: null,
      info: msg,
      remainMs: 15000,
    });
  },
}));

type SetFn = (partial: Partial<PvpStore>) => void;

/** 宿主:引擎快照 → 本地渲染 + 推送客机 */
function pushEngine(set: SetFn): void {
  if (!engine) return;
  const snap = pvpSnapshot(engine);
  set({ st: snap, remainMs: snap.qRemainMs });
  net?.sendState(snap);
  if (snap.winner) {
    AudioEngine.sfx(snap.winner === "host" ? "fanfare" : "defeat");
  }
}

/** 网络事件分发(WS 回调,模块作用域) */
function handleEvt(evt: PvpNetEvt): void {
  const { set } = { set: usePvpStore.setState };
  if (evt.t === "joined") {
    set({
      side: evt.side,
      room: evt.room,
      mode: "room",
      peer: null,
      info: evt.side === "host" ? "房间已创建,等待对手…" : "已加入房间",
    });
  } else if (evt.t === "peer") {
    set({ peer: evt.peer as PvpPeerInfo, info: "对手已就位" });
    AudioEngine.sfx("levelup");
  } else if (evt.t === "state") {
    // 客机:宿主快照(首次快照即进入对战)
    set({ mode: "battle", st: evt.snap, remainMs: evt.snap.qRemainMs });
    if (evt.snap.winner) {
      AudioEngine.sfx(evt.snap.winner === "guest" ? "fanfare" : "defeat");
    }
  } else if (evt.t === "act") {
    // 宿主:执行客机指令
    if (engine && pvpApply(engine, "guest", evt.act)) pushEngine(set);
  } else if (evt.t === "left") {
    usePvpStore.getState().leave(`⚠️ ${evt.reason},对战结束`);
  } else if (evt.t === "err") {
    net?.close();
    net = null;
    set({ info: `⚠️ ${evt.msg}` });
  }
}

/** 宿主 250ms tick:超时判定(由 PvpScreen 的定时器调用) */
export function pvpHostTick(): void {
  const st = usePvpStore.getState();
  if (st.mode !== "battle" || st.side !== "host" || !engine) return;
  if (pvpTick(engine)) {
    pushEngine(usePvpStore.setState);
  } else {
    usePvpStore.setState({
      remainMs: engine.qLocked
        ? 0
        : Math.max(0, engine.qEndsAt - Date.now()),
    });
  }
}

/** 客机 250ms tick:本地倒计时递减(结算权威在宿主) */
export function pvpGuestTick(): void {
  const st = usePvpStore.getState();
  if (st.mode !== "battle") return;
  usePvpStore.setState({ remainMs: Math.max(0, st.remainMs - 250) });
}
