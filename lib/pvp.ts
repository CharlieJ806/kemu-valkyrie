/* 对战(PvP)引擎:宿主权威 — 由建房玩家的浏览器执行全部结算,另一方为瘦客户端。
 * 复用 cards.ts 的 applyCardFx(双端中立的 BattleCtx 结算)与 PvE 答题伤害公式,
 * 回合编排镜像单人循环:答题(15s,可连答) → 出牌 → 结束回合(泄能) → 换对方。
 * 本引擎只操作内存态 PvpState,不接触 RunState 与 localStorage。 */

import { QUESTIONS, getValkById, isValkyrie } from "@/data";
import { BATTLE_Q_TIME_MS } from "@/data/constants";
import {
  applyCardFx,
  findCard,
  STARTER_CARD_IDS,
  STATUS_NAMES,
  ULT_PREFIX,
  type BattleCtx,
  type CardFxEvent,
} from "./cards";
import { shuffle } from "./formulas";
import type { EnemyStatus, Question } from "./types";

export type PvpSide = "host" | "guest";

/** 对战方(镜像 PvE 玩家侧字段;deck/hand 等均为卡 id) */
export type PvpFighter = {
  name: string;
  valkId: number;
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  /** 出伤倍率(本回合卡牌 mult 累积,自己回合开始重置 1) */
  dmgMult: number;
  /** 受伤倍率(防御卡降低,自己回合开始重置 1) */
  defMult: number;
  /** 被敌方减伤卡削弱的出伤倍率(默认 1,下限 0.4,weakTurns 回合后恢复) */
  weakMult: number;
  weakTurns: number;
  status: EnemyStatus | null;
  deck: string[];
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  combo: number;
  maxCombo: number;
};

export type PvpFx = { side: PvpSide; text: string; color: string };

export type PvpState = {
  v: 1;
  round: number;
  host: PvpFighter;
  guest: PvpFighter;
  /** 当前行动方 */
  turn: PvpSide;
  phase: "question" | "card";
  currentQ: Question | null;
  /** 答题截止(宿主时钟毫秒;快照时换算 qRemainMs) */
  qEndsAt: number;
  /** 快照携带的剩余毫秒(guest 渲染倒计时用) */
  qRemainMs: number;
  /** 本回合答对数 → 出牌能量 */
  turnCorrect: number;
  /** 答错/超时后锁定答题,等待进入出牌阶段 */
  qLocked: boolean;
  /** 本题作答反馈(展示正确/错误用;进下一题时清空) */
  answered: { pick: number; correct: boolean } | null;
  /** 共享抽题历史(避免近期重复,上限 40) */
  qHistory: string[];
  winner: PvpSide | null;
  /** 冻结/禁行导致的跳过提示(本回合) */
  skipNote: string | null;
  /** 最近动作飘字(双方按 side 渲染) */
  lastFx: PvpFx[];
};

export type PvpCfg = { name: string; valkId: number; deck: string[] };

export type PvpAct =
  | { act: "answer"; pick: number }
  | { act: "enterCard" }
  | { act: "play"; handIdx: number }
  | { act: "endTurn" };

/* ============ 工具 ============ */

function fighterOf(st: PvpState, side: PvpSide): PvpFighter {
  return side === "host" ? st.host : st.guest;
}

function other(side: PvpSide): PvpSide {
  return side === "host" ? "guest" : "host";
}

function pushFx(st: PvpState, side: PvpSide, text: string, color: string): void {
  st.lastFx.push({ side, text, color });
  if (st.lastFx.length > 6) st.lastFx.splice(0, st.lastFx.length - 6);
}

/** 净化牌组:过滤非法/必杀 id,不足 5 张补初始卡,上限 12 张 */
export function sanitizePvpDeck(deck: string[]): string[] {
  let ids = deck.filter((id) => !id.startsWith(ULT_PREFIX) && !!findCard(id));
  if (ids.length === 0) ids = [...STARTER_CARD_IDS];
  for (const sid of STARTER_CARD_IDS) {
    if (ids.length >= 5) break;
    ids.push(sid);
  }
  return ids.slice(0, 12);
}

/* ============ 建局 ============ */

export function createPvpState(hostCfg: PvpCfg, guestCfg: PvpCfg): PvpState {
  const mk = (cfg: PvpCfg): PvpFighter => {
    const valk = getValkById(cfg.valkId);
    const deck = sanitizePvpDeck(cfg.deck);
    return {
      name: cfg.name.slice(0, 8) || "学员",
      valkId: isValkyrie(cfg.valkId) ? cfg.valkId : 1,
      hp: (valk?.hp ?? 60) + 20,
      maxHp: (valk?.hp ?? 60) + 20,
      block: 0,
      energy: 0,
      dmgMult: 1,
      defMult: 1,
      weakMult: 1,
      weakTurns: 0,
      status: null,
      deck,
      hand: [],
      drawPile: shuffle(deck),
      discardPile: [],
      combo: 0,
      maxCombo: 0,
    };
  };
  const st: PvpState = {
    v: 1,
    round: 1,
    host: mk(hostCfg),
    guest: mk(guestCfg),
    turn: "host",
    phase: "question",
    currentQ: null,
    qEndsAt: 0,
    qRemainMs: 0,
    turnCorrect: 0,
    qLocked: false,
    answered: null,
    qHistory: [],
    winner: null,
    skipNote: null,
    lastFx: [],
  };
  beginTurn(st, "host");
  return st;
}

/* ============ 抽牌 ============ */

function drawInto(f: PvpFighter, n: number): void {
  for (let i = 0; i < n; i++) {
    if (f.drawPile.length === 0) {
      if (f.discardPile.length === 0) break;
      f.drawPile = shuffle(f.discardPile);
      f.discardPile = [];
    }
    const id = f.drawPile.pop();
    if (id) f.hand.push(id);
  }
}

function pickQuestion(st: PvpState): void {
  const recent = st.qHistory.slice(-10);
  let pool = QUESTIONS.filter((q) => !recent.includes(q.id));
  if (pool.length === 0) pool = QUESTIONS;
  const q = pool[Math.floor(Math.random() * pool.length)]!;
  st.currentQ = q;
  st.qHistory.push(q.id);
  if (st.qHistory.length > 40) st.qHistory.splice(0, 20);
  st.qLocked = false;
  st.answered = null;
  st.qEndsAt = Date.now() + BATTLE_Q_TIME_MS;
}

/* ============ 伤害(镜像 PvE:攻击倍率×受伤倍率 → 格挡吸收) ============ */

function hit(
  st: PvpState,
  attSide: PvpSide,
  raw: number,
  ignoreBlock = false,
): number {
  const att = fighterOf(st, attSide);
  const def = fighterOf(st, other(attSide));
  let amt = Math.floor(raw * att.dmgMult * att.weakMult * def.defMult);
  let blocked = 0;
  if (!ignoreBlock && def.block > 0) {
    blocked = Math.min(def.block, amt);
    def.block -= blocked;
    amt -= blocked;
  }
  def.hp = Math.max(0, def.hp - amt);
  if (def.hp <= 0 && !st.winner) st.winner = attSide;
  if (amt > 0) pushFx(st, other(attSide), `-${amt}`, "#ff6688");
  return amt;
}

/* ============ 回合流转 ============ */

/** side 回合开始:重置倍率/格挡,结算冻结/禁行跳过,抽题计时 */
function beginTurn(st: PvpState, side: PvpSide): void {
  const f = fighterOf(st, side);
  st.turn = side;
  st.phase = "question";
  st.turnCorrect = 0;
  st.skipNote = null;
  st.lastFx = [];
  f.dmgMult = 1;
  f.defMult = 1;
  f.block = 0;
  f.energy = 0;
  // 手牌清入弃牌堆
  f.discardPile = [...f.discardPile, ...f.hand];
  f.hand = [];

  // 冻结/禁行:跳过整回合(状态消耗 1 层)
  const stt = f.status;
  if (stt && (stt.type === "freeze" || stt.type === "sleep")) {
    stt.turns -= 1;
    if (stt.turns <= 0) f.status = null;
    st.skipNote = `${STATUS_NAMES[stt.type]},跳过本回合`;
    pushFx(st, side, st.skipNote, "#8fb7ff");
    endTurn(st, side, true);
    return;
  }
  pickQuestion(st);
}

/** 结束回合:泄能 → 自身 DoT → 状态/减益递减 → 换对方。
 * silent=true 由 beginTurn 跳过路径调用(不再重复泄能)。 */
function endTurn(st: PvpState, side: PvpSide, silent = false): void {
  if (st.winner) return;
  const f = fighterOf(st, side);

  if (!silent) {
    // 泄能:剩余能量 × (2+攻击) 直接打击对方
    if (f.energy > 0) {
      const dump = f.energy * (2 + (getValkById(f.valkId)?.atk ?? 2));
      const dealt = hit(st, side, dump);
      pushFx(st, side, `泄能 -${dealt}`, "#ffd700");
      f.energy = 0;
    }
  }

  // DoT:burn 4 / poison 6 打在自己身上(无视格挡)
  if (f.status && !st.winner) {
    const s = f.status;
    const dot = s.type === "burn" ? 4 : s.type === "poison" ? 6 : 0;
    if (dot > 0) {
      f.hp = Math.max(0, f.hp - dot);
      pushFx(st, side, `${STATUS_NAMES[s.type]} -${dot}`, "#c76fd8");
      if (f.hp <= 0 && !st.winner) st.winner = other(side);
    }
    s.turns -= 1;
    if (s.turns <= 0) f.status = null;
  }

  // 敌方减伤卡(weakMult)按自己回合数递减
  if (f.weakTurns > 0) {
    f.weakTurns -= 1;
    if (f.weakTurns <= 0) {
      f.weakMult = 1;
      f.weakTurns = 0;
    }
  }

  if (st.winner) return;
  st.round += 1;
  beginTurn(st, other(side));
}

/* ============ 动作入口(宿主执行;返回是否生效) ============ */

/** 答题:答对 → 伤害+连击+下一题;答错/超时 → 锁题待进入出牌阶段 */
export function pvpAnswer(st: PvpState, side: PvpSide, pick: number): boolean {
  if (st.winner || st.turn !== side || st.phase !== "question" || st.qLocked) return false;
  const q = st.currentQ;
  if (!q) return false;
  const f = fighterOf(st, side);
  const correct = pick === q.ans;
  if (correct) {
    f.combo++;
    st.turnCorrect++;
    if (f.combo > f.maxCombo) f.maxCombo = f.combo;
    // 伤害公式与 PvE answerBattle 一致(攻击取学员基础攻击)
    const atk = getValkById(f.valkId)?.atk ?? 2;
    const baseDmg = 3 + Math.floor(f.combo / 3) * 2 + atk;
    const comboMult = 1 + (f.combo - 1) * 0.15;
    const crit = f.combo > 0 && f.combo % 5 === 0;
    const dealt = hit(st, side, Math.floor(baseDmg * comboMult * (crit ? 1.5 : 1)));
    pushFx(st, side, crit ? `暴击! -${dealt}` : `连击${f.combo} -${dealt}`, "#ffd700");
    if (!st.winner) pickQuestion(st);
  } else {
    f.combo = 0;
    st.qLocked = true;
    st.answered = { pick, correct: false };
  }
  return true;
}

/** 答题超时(宿主计时器调用):按答错处理(pick=-1 不高亮任何选项) */
export function pvpTimeout(st: PvpState): boolean {
  if (st.winner || st.phase !== "question" || st.qLocked) return false;
  const f = fighterOf(st, st.turn);
  f.combo = 0;
  st.qLocked = true;
  st.answered = { pick: -1, correct: false };
  pushFx(st, st.turn, "⏰ 超时!", "#ff8800");
  return true;
}

/** 进入出牌阶段:答错锁定后必进;答对攒了能量也可主动停止答题 */
export function pvpEnterCard(st: PvpState, side: PvpSide): boolean {
  if (
    st.winner ||
    st.turn !== side ||
    st.phase !== "question" ||
    (!st.qLocked && st.turnCorrect === 0)
  ) {
    return false;
  }
  const f = fighterOf(st, side);
  st.phase = "card";
  const base = st.turnCorrect;
  f.energy = f.status?.type === "para" ? Math.floor(base / 2) : base;
  if (f.status?.type === "para" && base > 0) {
    pushFx(st, side, "限速减速:能量减半", "#8fb7ff");
  }
  if (f.drawPile.length === 0) f.drawPile = shuffle(f.deck);
  drawInto(f, 5);
  return true;
}

/** 出牌:费用校验 → 远光眩目 30% 打空 → applyCardFx 结算 */
export function pvpPlayCard(st: PvpState, side: PvpSide, handIdx: number): boolean {
  if (st.winner || st.turn !== side || st.phase !== "card") return false;
  const f = fighterOf(st, side);
  const foe = fighterOf(st, other(side));
  const id = f.hand[handIdx];
  const card = id ? findCard(id) : undefined;
  if (!card) return false;
  if (f.energy < card.cost) return false;

  f.hand.splice(handIdx, 1);
  f.discardPile.push(id!);
  f.energy -= card.cost;

  // 远光眩目:30% 概率打空(牌已消耗)
  if (f.status?.type === "confuse" && Math.random() < 0.3) {
    pushFx(st, side, "远光眩目,打空了…", "#8fb7ff");
    return true;
  }

  // ctx 映射:行动方=player 字段,对方=enemy 字段;
  // ctx.dmgMult 承载对方 weakMult(出伤削弱)×defMult(受伤减免)
  const ctx: BattleCtx = {
    enemyHp: foe.hp,
    enemyMaxHp: foe.maxHp,
    enemyBlock: foe.block,
    block: f.block,
    hp: f.hp,
    maxHp: f.maxHp,
    energy: f.energy,
    playerDmgMult: f.dmgMult,
    playerDefMult: f.defMult,
    enemyAtkMult: foe.weakMult,
    enemyWeakTurns: foe.weakTurns,
    enemyStatus: foe.status,
    atk: getValkById(f.valkId)?.atk ?? 2,
    dmgMult: foe.weakMult * foe.defMult,
    draw: (n) => drawInto(f, n),
  };
  const events: CardFxEvent[] = applyCardFx(card, ctx);

  // 结算回写
  f.block = ctx.block;
  f.hp = ctx.hp;
  f.energy = ctx.energy;
  f.dmgMult = ctx.playerDmgMult;
  f.defMult = ctx.playerDefMult;
  foe.hp = ctx.enemyHp;
  foe.block = ctx.enemyBlock;
  foe.weakMult = ctx.enemyAtkMult;
  foe.weakTurns = ctx.enemyWeakTurns;
  foe.status = ctx.enemyStatus;
  if (foe.hp <= 0 && !st.winner) st.winner = side;
  if (f.hp <= 0 && !st.winner) st.winner = other(side);

  // 飘字:伤害/回复/格挡摘要
  for (const e of events) {
    if (e.type === "dmg") pushFx(st, side, `${card.name} -${e.amount}`, "#ff6688");
    else if (e.type === "heal") pushFx(st, side, `${card.name} +${e.amount}`, "#4ec98c");
    else if (e.type === "status") pushFx(st, side, `${card.name} ${STATUS_NAMES[e.status]}`, "#c76fd8");
  }
  return true;
}

/** 结束回合(出牌阶段) */
export function pvpEndTurn(st: PvpState, side: PvpSide): boolean {
  if (st.winner || st.turn !== side || st.phase !== "card") return false;
  endTurn(st, side);
  return true;
}

/** 宿主动作分发(answer/enterCard/play/endTurn 统一入口) */
export function pvpApply(st: PvpState, side: PvpSide, act: PvpAct): boolean {
  switch (act.act) {
    case "answer":
      return pvpAnswer(st, side, act.pick);
    case "enterCard":
      return pvpEnterCard(st, side);
    case "play":
      return pvpPlayCard(st, side, act.handIdx);
    case "endTurn":
      return pvpEndTurn(st, side);
  }
}

/** 快照:补算剩余答题毫秒后整体可 JSON 序列化 */
export function pvpSnapshot(st: PvpState): PvpState {
  return {
    ...st,
    qRemainMs: st.qLocked ? 0 : Math.max(0, st.qEndsAt - Date.now()),
  };
}

/** 宿主定时推进:答题超时判定(返回 true 表示状态有变,需推送) */
export function pvpTick(st: PvpState): boolean {
  if (st.winner || st.phase !== "question" || st.qLocked) return false;
  if (Date.now() < st.qEndsAt) return false;
  return pvpTimeout(st);
}
