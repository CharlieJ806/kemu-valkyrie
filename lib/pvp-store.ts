"use client";

/* 对战会话 store(纯内存,不持久化):网络事件/引擎结算/音效等副作用全部收在
 * 模块作用域,PvpScreen 只做渲染与点击分发 — 与 store.ts 的房屋风格一致。
 * 房间信令(队伍互见/双方准备/赛制/再来一局/认输/牌组模式)经服务器纯转发。 */

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
import {
  PvpNet,
  type PvpDeckMode,
  type PvpNetEvt,
  type PvpPeerInfo,
} from "./pvp-net";

type Mode = "idle" | "room" | "battle";

type PvpStore = {
  mode: Mode;
  side: PvpSide;
  room: string;
  peer: PvpPeerInfo | null;
  st: PvpState | null;
  info: string;
  /** 当前阶段剩余毫秒(答题或出牌,取决于 phase) */
  remainMs: number;
  /** 房间信令态 */
  myReady: boolean;
  peerReady: boolean;
  /** 对方出场队伍(有序) */
  peerPicks: number[];
  /** 对方出战牌组(随 ready 信令同步;公平模式下不使用) */
  peerDeck: string[];
  /** 赛制队伍人数(1/3/5) */
  teamSize: number;
  deckMode: PvpDeckMode;
  againMe: boolean;
  againPeer: boolean;
  requestJoin: (room: string | null, name: string, cfg: PvpPeerInfo) => void;
  sendPick: (picks: number[]) => void;
  setTeamSize: (n: number) => void;
  setReady: (on: boolean, myCfg: PvpCfg) => void;
  setDeckMode: (mode: PvpDeckMode) => void;
  act: (a: PvpAct) => void;
  requestAgain: () => void;
  surrender: () => void;
  leave: (msg: string) => void;
};

let net: PvpNet | null = null;
/** 宿主引擎态(仅 side=host 时存在) */
let engine: PvpState | null = null;
/** 宿主自己的 cfg(setReady 时保存,双方就绪自动开局用) */
let myCfgSaved: PvpCfg | null = null;
/** 上局双方 cfg(再来一局用) */
let lastCfgs: { host: PvpCfg; guest: PvpCfg } | null = null;
/** 首局先手(再战轮换基准) */
let firstFirst: PvpSide = "host";
let gameCount = 0;

const INITIAL_ROOM = {
  myReady: false,
  peerReady: false,
  peerPicks: [] as number[],
  peerDeck: [] as string[],
  againMe: false,
  againPeer: false,
};

export const usePvpStore = create<PvpStore>((set, get) => ({
  mode: "idle",
  side: "host",
  room: "",
  peer: null,
  st: null,
  info: "",
  remainMs: 15000,
  ...INITIAL_ROOM,
  teamSize: 3,
  deckMode: "fair",

  requestJoin: (room, name, cfg) => {
    net?.close();
    engine = null;
    myCfgSaved = null;
    lastCfgs = null;
    gameCount = 0;
    set({ mode: "idle", peer: null, st: null, info: "连接对战服务器…", ...INITIAL_ROOM });
    net = new PvpNet(handleEvt);
    if (room) net.join(room, name, cfg);
    else net.create(name, cfg);
  },

  /** 房间内改选队伍(出场顺序;改选即取消双方准备) */
  sendPick: (picks) => {
    set({ myReady: false });
    net?.sendMsg({ t: "pick", picks });
  },

  /** 赛制队伍人数(仅宿主,改动取消双方准备) */
  setTeamSize: (n) => {
    if (get().side !== "host") return;
    set({ teamSize: n, myReady: false, peerReady: false });
    net?.sendMsg({ t: "teamSize", n });
  },

  /** 准备(携带自己的 cfg;双方都准备 → 仅宿主自动开局,引擎权威唯一) */
  setReady: (on, myCfg) => {
    myCfgSaved = myCfg;
    set({ myReady: on });
    net?.sendMsg({ t: "ready", on, picks: myCfg.valkIds, deck: myCfg.deck });
    const st0 = get();
    if (on && st0.side === "host" && st0.peerReady) startMatch(set);
  },

  /** 牌组模式(仅宿主,改动取消双方准备) */
  setDeckMode: (mode) => {
    if (get().side !== "host") return;
    set({ deckMode: mode, myReady: false, peerReady: false });
    net?.sendMsg({ t: "mode", deckMode: mode });
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

  /** 再来一局(双方都点 → 宿主重开,先手轮换) */
  requestAgain: () => {
    set({ againMe: true });
    net?.sendMsg({ t: "again" });
    if (get().againPeer) restart(set);
  },

  /** 认输(判负本场,双方留在房间可再战) */
  surrender: () => {
    net?.sendMsg({ t: "quit" });
    finishByQuit(set, false);
  },

  leave: (msg) => {
    net?.close();
    net = null;
    engine = null;
    myCfgSaved = null;
    lastCfgs = null;
    set({
      mode: "idle",
      peer: null,
      st: null,
      info: msg,
      remainMs: 15000,
      ...INITIAL_ROOM,
    });
  },
}));

type SetFn = (partial: Partial<PvpStore>) => void;

function other(side: PvpSide): PvpSide {
  return side === "host" ? "guest" : "host";
}

/** 宿主:开局(先手轮换)/再战 */
function startMatch(set: SetFn, rematch = false): void {
  const st0 = usePvpStore.getState();
  if (!st0.peer || !myCfgSaved) return;
  const fair = st0.deckMode === "fair";
  const size = st0.teamSize;
  const hostIds = myCfgSaved.valkIds.slice(0, size);
  const peerIds = st0.peerPicks.length > 0 ? st0.peerPicks : [st0.peer.valkId];
  const hostCfg: PvpCfg = {
    name: myCfgSaved.name,
    valkIds: hostIds.length > 0 ? hostIds : [1],
    deck: fair ? [] : myCfgSaved.deck,
  };
  const peerDeck = st0.peerDeck.length > 0 ? st0.peerDeck : st0.peer.deck;
  const guestCfg: PvpCfg = {
    name: st0.peer.name,
    valkIds: peerIds.slice(0, size),
    deck: fair ? [] : peerDeck,
  };
  AudioEngine.sfx("boss");
  engine = createPvpState(
    hostCfg,
    guestCfg,
    rematch && gameCount > 0 ? { firstTurn: other(firstFirst) } : undefined,
  );
  firstFirst = engine.firstTurn;
  gameCount += 1;
  lastCfgs = { host: hostCfg, guest: guestCfg };
  set({ mode: "battle", info: "", ...INITIAL_ROOM });
  pushEngine(set);
}

function restart(set: SetFn): void {
  const cfgs = lastCfgs;
  const my = myCfgSaved;
  if (!cfgs || !my) return;
  myCfgSaved = { ...my, deck: cfgs.host.deck, valkIds: cfgs.host.valkIds };
  startMatch(set, true);
}

/** 宿主:引擎快照 → 本地渲染 + 推送客机(客机视角脱敏) */
function pushEngine(set: SetFn): void {
  if (!engine) return;
  const local = pvpSnapshot(engine);
  net?.sendState(pvpSnapshot(engine, "guest"));
  set({
    st: local,
    remainMs: engine.phase === "card" ? local.cardRemainMs : local.qRemainMs,
  });
  if (local.over) {
    AudioEngine.sfx(local.winner === "host" ? "fanfare" : "defeat");
  }
}

/** 认输结算:sendWin=false 为认输方(对方由 quit 消息走 sendWin=true) */
function finishByQuit(set: SetFn, sendWin: boolean): void {
  const st0 = usePvpStore.getState();
  if (st0.mode !== "battle") return;
  if (engine && st0.side === "host") {
    engine.over = true;
    engine.winner = sendWin ? "host" : "guest";
    pushEngine(set);
  } else {
    // 客机侧(或宿主认输的本地视图):直接改本地快照
    const snap = st0.st;
    if (snap) {
      snap.over = true;
      snap.winner = sendWin ? st0.side : other(st0.side);
      set({ st: { ...snap } });
    }
    AudioEngine.sfx(sendWin ? "fanfare" : "defeat");
  }
}

/** 一方离开:战斗作废判对方胜,房间保留给留下的人 */
function peerLeft(set: SetFn, promoted: boolean): void {
  const st0 = usePvpStore.getState();
  const inBattle = st0.mode === "battle";
  set({
    mode: "room",
    peer: null,
    side: promoted ? "host" : st0.side,
    st: null,
    info: inBattle ? "对方已离开,本场判你获胜" : "对方已离开房间",
    ...INITIAL_ROOM,
  });
  if (inBattle) AudioEngine.sfx("fanfare");
}

/** 网络事件分发(WS 回调,模块作用域) */
function handleEvt(evt: PvpNetEvt): void {
  const set = usePvpStore.setState;
  if (evt.t === "joined") {
    set({
      side: evt.side,
      room: evt.room,
      mode: "room",
      peer: null,
      info: evt.side === "host" ? "房间已创建,等待对手…" : "已加入房间",
      ...INITIAL_ROOM,
    });
  } else if (evt.t === "peer") {
    set({ peer: evt.peer, info: "对手已就位,编排队伍并准备" });
    AudioEngine.sfx("levelup");
  } else if (evt.t === "state") {
    // 客机:宿主快照(首帧快照即进入对战,权威引擎只在宿主)
    set({
      mode: "battle",
      st: evt.snap,
      remainMs:
        evt.snap.phase === "card" ? evt.snap.cardRemainMs : evt.snap.qRemainMs,
    });
    if (evt.snap.over) {
      AudioEngine.sfx(evt.snap.winner === "guest" ? "fanfare" : "defeat");
    }
  } else if (evt.t === "act") {
    if (engine && pvpApply(engine, "guest", evt.act)) pushEngine(set);
  } else if (evt.t === "pick") {
    set({ peerPicks: evt.picks, peerReady: false });
  } else if (evt.t === "ready") {
    set({ peerReady: evt.on, peerPicks: evt.picks, peerDeck: evt.deck ?? [] });
    const st0 = usePvpStore.getState();
    if (evt.on && st0.side === "host" && st0.myReady) startMatch(set);
  } else if (evt.t === "teamSize") {
    set({ teamSize: evt.n, myReady: false, peerReady: false });
  } else if (evt.t === "mode") {
    set({ deckMode: evt.deckMode, myReady: false, peerReady: false });
  } else if (evt.t === "again") {
    set({ againPeer: true });
    const st0 = usePvpStore.getState();
    if (st0.againMe && st0.side === "host") restart(set);
  } else if (evt.t === "quit") {
    finishByQuit(set, true);
  } else if (evt.t === "promoted") {
    peerLeft(set, true);
  } else if (evt.t === "left") {
    peerLeft(set, false);
  } else if (evt.t === "err") {
    net?.close();
    net = null;
    set({ info: `⚠️ ${evt.msg}` });
  }
}

/** 宿主 250ms tick:答题/出牌超时判定(由 PvpScreen 的定时器调用) */
export function pvpHostTick(): void {
  const st = usePvpStore.getState();
  if (st.mode !== "battle" || st.side !== "host" || !engine) return;
  if (pvpTick(engine)) {
    pushEngine(usePvpStore.setState);
  } else {
    const remain =
      engine.phase === "card"
        ? Math.max(0, engine.cardEndsAt - Date.now())
        : engine.qLocked
          ? 0
          : Math.max(0, engine.qEndsAt - Date.now());
    usePvpStore.setState({ remainMs: remain });
  }
}

/** 客机 250ms tick:本地倒计时递减(结算权威在宿主) */
export function pvpGuestTick(): void {
  const st = usePvpStore.getState();
  if (st.mode !== "battle") return;
  usePvpStore.setState({ remainMs: Math.max(0, st.remainMs - 250) });
}
