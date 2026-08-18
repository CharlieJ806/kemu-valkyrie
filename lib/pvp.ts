/* 对战(PvP)引擎:宿主权威 — 由建房玩家的浏览器执行全部结算,另一方为瘦客户端。
 * 复用 cards.ts 的 applyCardFx(双端中立的 BattleCtx 结算)与 PvE 答题伤害公式,
 * 回合编排镜像单人循环:答题(15s,每回合至多 5 题) → 出牌 → 结束回合(泄能) → 换对方。
 * 公平性:数值走 PvP 平衡表(独立于 PvE 强度曲线)/先手随机/同一回合双方共用 5 题/
 * 回合上限 30(按剩余 HP 比例判定)。本引擎只操作内存态,不接触 RunState 与 localStorage。 */

import { QUESTIONS, getValkById, isValkyrie } from "@/data";
import { BATTLE_Q_TIME_MS } from "@/data/constants";
import {
  applyCardFx,
  buildUltCard,
  findCard,
  STARTER_CARD_IDS,
  STATUS_NAMES,
  ULT_GAUGE_MAX,
  ULT_PREFIX,
  type BattleCtx,
} from "./cards";
import { shuffle } from "./formulas";
import {
  skillAnswerHeal,
  skillAnswerStatusChance,
  skillCardAtkBonus,
  skillCardPhaseBonus,
  skillComboBonus,
  skillFirstTurnMult,
  skillHurtReduce,
} from "./valkskills";
import type { EnemyStatus, Question } from "./types";

export type PvpSide = "host" | "guest";

/** 每回合答题上限(答满自动进入出牌阶段) */
export const PVP_MAX_Q = 5;
/** 回合上限(一回合=双方各行动一次;超出按剩余 HP 比例判定) */
export const PVP_MAX_ROUNDS = 30;
/** 出牌阶段总时限(超时自动结束回合,防挂机拖延) */
export const PVP_CARD_TIME_MS = 60_000;
/** 冻结/禁行被跳过后,接下来 N 个自己回合免疫同类控制 */
export const PVP_CTRL_IMMUNE_TURNS = 2;
/** 必杀直接伤害在 PvP 中的缩放比例(平衡表 HP 远低于 PvE,避免一击秒杀) */
export const ULT_PVP_DMG_SCALE = 0.6;

/** PvP 平衡表(按学员定位差异化,策划分配):
 * 速攻(赤红/刹/深夜)= 76 HP / 3 攻 · 均衡(蔚蓝/晴岚/藏青)= 80 HP / 2 攻 ·
 * 坦克(白银/格瑞)= 88 HP / 1 攻(配防御向被动与必杀补足)。
 * 与养成完全解耦:本模块(及其调用的 pvp-net/pvp-store)不读取 metaHpLv/metaAtkLv
 * 等任何养成/图鉴字段,对战中只有定位差异,不受玩家进度影响。 */
export const PVP_BALANCE: Record<number, { hp: number; atk: number }> = {
  1: { hp: 76, atk: 3 }, // 赤红 · 速攻
  2: { hp: 80, atk: 2 }, // 蔚蓝 · 均衡
  3: { hp: 88, atk: 1 }, // 白银 · 坦克
  4: { hp: 76, atk: 3 }, // 深夜 · 速攻
  5: { hp: 80, atk: 2 }, // 藏青 · 均衡
  6: { hp: 88, atk: 1 }, // 格瑞 · 坦克
  7: { hp: 80, atk: 2 }, // 晴岚 · 均衡
  8: { hp: 76, atk: 3 }, // 刹 · 速攻
};

/** 对战方(镜像 PvE 玩家侧字段;deck/hand 等均为卡 id) */
export type PvpFighter = {
  name: string;
  valkId: number;
  hp: number;
  maxHp: number;
  /** 平衡表攻击(答题/泄能/卡牌加成共用) */
  atk: number;
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
  /** 冻结/禁行免疫剩余回合数(被跳过后获得) */
  ctrlImmuneTurns: number;
  /** 本回合已联动过的板块(每回合每板块限 1 次) */
  linkUsed: string[];
  deck: string[];
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  combo: number;
  maxCombo: number;
  /** 必杀槽(每出一张牌 +1,满槽后本场对决可释放一次必杀) */
  ultGauge: number;
  ultMax: number;
  ultUsed: boolean;
};

/** 飘字事件(seq 单调递增,屏幕按 seq 播放新增条目) */
export type PvpFx = {
  side: PvpSide;
  text: string;
  color: string;
  seq: number;
  kind: "answer" | "card" | "dump" | "heal" | "status" | "timeout" | "info";
  dmg?: number;
  crit?: boolean;
};

export type PvpState = {
  v: 1;
  /** 总行动序号(每次行动+1;一回合=双方各一次) */
  turnNo: number;
  /** 回合序号 = ceil(turnNo/2) */
  round: number;
  host: PvpFighter;
  guest: PvpFighter;
  /** 先手方(随机) */
  firstTurn: PvpSide;
  /** 队伍(出场顺序,拳皇车轮制;ids 为学员 id 有序数组) */
  teams: { host: number[]; guest: number[]; hostIdx: number; guestIdx: number };
  /** 当前对决首个回合的 turnNo(用于后手能量补偿判定) */
  duelStartTurnNo: number;
  /** 当前行动方 */
  turn: PvpSide;
  phase: "question" | "card";
  /** 本回合 5 题(同一回合双方共用,保证难度对称) */
  roundQs: Question[];
  /** 本回合已答到第几题(0-4) */
  turnQIdx: number;
  currentQ: Question | null;
  /** 答题截止(宿主时钟毫秒;快照时换算 qRemainMs) */
  qEndsAt: number;
  /** 快照携带的剩余毫秒(guest 渲染倒计时用) */
  qRemainMs: number;
  /** 出牌阶段截止(宿主时钟;超时自动结束回合) */
  cardEndsAt: number;
  /** 快照携带的出牌剩余毫秒 */
  cardRemainMs: number;
  /** 本回合答对数 → 出牌能量 */
  turnCorrect: number;
  /** 答错/超时/答满后锁定答题,等待进入出牌阶段 */
  qLocked: boolean;
  /** 本题作答反馈(展示正确/错误用;进下一题时清空) */
  answered: { pick: number; correct: boolean } | null;
  /** 抽题去重历史(上限 40) */
  qHistory: string[];
  winner: PvpSide | null;
  /** 对局结束(winner=null 且 over=true 为平局) */
  over: boolean;
  /** 冻结/禁行导致的跳过提示(本回合) */
  skipNote: string | null;
  /** 最近动作飘字(双方按 side/seq 渲染) */
  lastFx: PvpFx[];
  /** 飘字批次序号(每次引擎动作 +1) */
  fxSeq: number;
};

export type PvpCfg = { name: string; valkIds: number[]; deck: string[] };

export type PvpAct =
  | { act: "answer"; pick: number }
  | { act: "enterCard" }
  | { act: "play"; handIdx: number }
  | { act: "ult" }
  | { act: "endTurn" };

/* ============ 工具 ============ */

function fighterOf(st: PvpState, side: PvpSide): PvpFighter {
  return side === "host" ? st.host : st.guest;
}

function other(side: PvpSide): PvpSide {
  return side === "host" ? "guest" : "host";
}

function pushFx(
  st: PvpState,
  side: PvpSide,
  text: string,
  color: string,
  kind: PvpFx["kind"] = "info",
  dmg?: number,
  crit?: boolean,
): void {
  st.lastFx.push({ side, text, color, seq: st.fxSeq, kind, dmg, crit });
  if (st.lastFx.length > 8) st.lastFx.splice(0, st.lastFx.length - 8);
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

/** 按平衡表构建一名出战学员(牌组归玩家,角色倒下换人时重洗) */
function buildFighter(name: string, valkId: number, deck: string[]): PvpFighter {
  const bal = PVP_BALANCE[valkId] ?? { hp: 80, atk: 2 };
  const d = sanitizePvpDeck(deck);
  return {
    name: name.slice(0, 8) || "学员",
    valkId: isValkyrie(valkId) ? valkId : 1,
    hp: bal.hp,
    maxHp: bal.hp,
    atk: bal.atk,
    block: 0,
    energy: 0,
    dmgMult: 1,
    defMult: 1,
    weakMult: 1,
    weakTurns: 0,
    status: null,
    ctrlImmuneTurns: 0,
    linkUsed: [],
    deck: d,
    hand: [],
    drawPile: shuffle(d),
    discardPile: [],
    combo: 0,
    maxCombo: 0,
    ultGauge: 0,
    ultMax: ULT_GAUGE_MAX,
    ultUsed: false,
  };
}

export function createPvpState(
  hostCfg: PvpCfg,
  guestCfg: PvpCfg,
  opts?: { firstTurn?: PvpSide },
): PvpState {
  const cleanIds = (ids: number[]) => {
    const v = ids.filter(isValkyrie);
    return v.length > 0 ? v : [1];
  };
  const hostIds = cleanIds(hostCfg.valkIds);
  const guestIds = cleanIds(guestCfg.valkIds);
  // 先手:外部指定(轮换/守擂),缺省随机
  const first: PvpSide = opts?.firstTurn ?? (Math.random() < 0.5 ? "host" : "guest");
  const st: PvpState = {
    v: 1,
    turnNo: 0,
    round: 0,
    host: buildFighter(hostCfg.name, hostIds[0]!, hostCfg.deck),
    guest: buildFighter(guestCfg.name, guestIds[0]!, guestCfg.deck),
    teams: { host: hostIds, guest: guestIds, hostIdx: 0, guestIdx: 0 },
    duelStartTurnNo: 1,
    firstTurn: first,
    turn: first,
    phase: "question",
    roundQs: [],
    turnQIdx: 0,
    currentQ: null,
    qEndsAt: 0,
    qRemainMs: 0,
    cardEndsAt: 0,
    cardRemainMs: 0,
    turnCorrect: 0,
    qLocked: false,
    answered: null,
    qHistory: [],
    winner: null,
    over: false,
    skipNote: null,
    lastFx: [],
    fxSeq: 0,
  };
  st.fxSeq += 1;
  pushFx(st, first, `${fighterOf(st, first).name} 先攻!`, "#ffd700");
  beginTurn(st, first);
  return st;
}

/* ============ 抽题 ============ */

/** 新回合开始:抽 5 题(避开近期历史;同一回合双方共用同一组题,保证难度对称) */
function refreshRoundQs(st: PvpState): void {
  const recent = st.qHistory.slice(-40);
  let pool = QUESTIONS.filter((q) => !recent.includes(q.id));
  if (pool.length < 5) pool = QUESTIONS;
  const picked = shuffle(pool).slice(0, PVP_MAX_Q);
  for (const q of picked) st.qHistory.push(q.id);
  if (st.qHistory.length > 40) st.qHistory.splice(0, st.qHistory.length - 40);
  st.roundQs = picked;
}

/** 展示本回合第 idx 题(索引越界视为锁定) */
function showQuestion(st: PvpState): void {
  const q = st.roundQs[st.turnQIdx] ?? null;
  st.currentQ = q;
  st.qLocked = q == null;
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
  // 被动·安全壁垒:受击固定减免(至少造成 1 点)
  const reduce = skillHurtReduce(getValkById(def.valkId));
  if (amt > 0) amt = Math.max(1, amt - reduce);
  def.hp = Math.max(0, def.hp - amt);
  return amt;
}

/** 角色倒下处理(KOF 车轮):有替补 → 换人开新对决(守擂方先手,新 5 题);
 * 无替补 → 判胜负。返回 true 表示已接管回合流转,调用方应立即返回。 */
function checkKO(st: PvpState, deadSide: PvpSide): boolean {
  const dead = fighterOf(st, deadSide);
  if (dead.hp > 0) return false;
  const isHost = deadSide === "host";
  const ids = isHost ? st.teams.host : st.teams.guest;
  const idx = (isHost ? st.teams.hostIdx : st.teams.guestIdx) + 1;
  if (idx >= ids.length) {
    st.over = true;
    st.winner = other(deadSide);
    pushFx(st, deadSide, `${dead.name} 队伍全灭`, "#ff6b81");
    return true;
  }
  if (isHost) st.teams.hostIdx = idx;
  else st.teams.guestIdx = idx;
  const nextId = ids[idx]!;
  const nextName = getValkById(nextId)?.c ?? "学员";
  const next = buildFighter(dead.name, nextId, dead.deck);
  if (isHost) st.host = next;
  else st.guest = next;
  pushFx(st, deadSide, `${nextName} 登场!`, "#ffd700");
  st.duelStartTurnNo = st.turnNo + 1;
  refreshRoundQs(st);
  beginTurn(st, other(deadSide)); // 守擂方先手:挑战者拿血量优势,守擂拿节奏
  return true;
}

/* ============ 回合流转 ============ */

/** side 回合开始:连击清零/倍率格挡重置,控制免疫递减,冻结/禁行跳过,展示第 1 题 */
function beginTurn(st: PvpState, side: PvpSide): void {
  const f = fighterOf(st, side);
  st.turnNo += 1;
  st.round = Math.ceil(st.turnNo / 2);
  st.turn = side;
  st.phase = "question";
  st.turnCorrect = 0;
  st.turnQIdx = 0;
  st.skipNote = null;
  f.combo = 0; // L1:连击是回合内爆发手段,跨回合清零
  f.dmgMult = 1;
  // 被动·绝对制动:本对决首个自己回合伤害倍率(KOF 换人后的新对决同样生效)
  if (st.turnNo === st.duelStartTurnNo) {
    const m = skillFirstTurnMult(getValkById(f.valkId));
    if (m != null) f.dmgMult = m;
  }
  f.defMult = 1;
  f.block = 0;
  f.energy = 0;
  f.linkUsed = [];
  if (f.ctrlImmuneTurns > 0) f.ctrlImmuneTurns -= 1;
  // 手牌清入弃牌堆
  f.discardPile = [...f.discardPile, ...f.hand];
  f.hand = [];

  // 新回合(奇数次行动)抽 5 题:双方共用
  if (st.turnNo % 2 === 1) refreshRoundQs(st);

  // 冻结/禁行:跳过整回合(状态消耗 1 层),并获得控制免疫期
  const stt = f.status;
  if (stt && (stt.type === "freeze" || stt.type === "sleep")) {
    stt.turns -= 1;
    if (stt.turns <= 0) f.status = null;
    f.ctrlImmuneTurns = PVP_CTRL_IMMUNE_TURNS;
    st.skipNote = `${STATUS_NAMES[stt.type]},跳过本回合`;
    pushFx(st, side, st.skipNote, "#8fb7ff");
    endTurn(st, side, true);
    return;
  }
  showQuestion(st);
}

/** 结束回合:泄能 → 自身 DoT → 状态/减益递减 → 回合上限判定 → 换对方。
 * silent=true 由 beginTurn 跳过路径调用(不再重复泄能)。 */
function endTurn(st: PvpState, side: PvpSide, silent = false): void {
  if (st.over) return;
  const f = fighterOf(st, side);

  if (!silent) {
    // 泄能:剩余能量 × (2+攻击) 直接打击对方
    if (f.energy > 0) {
      const dump = f.energy * (2 + f.atk);
      const dealt = hit(st, side, dump);
      pushFx(st, side, `泄能 -${dealt}`, "#ffd700", "dump", dealt);
      f.energy = 0;
      if (checkKO(st, other(side))) return;
    }
  }

  // DoT:burn 4 / poison 6 打在自己身上(无视格挡)
  if (f.status && !st.over) {
    const s = f.status;
    const dot = s.type === "burn" ? 4 : s.type === "poison" ? 6 : 0;
    if (dot > 0) {
      f.hp = Math.max(0, f.hp - dot);
      pushFx(st, side, `${STATUS_NAMES[s.type]} -${dot}`, "#c76fd8", "status", dot);
      if (f.hp <= 0) {
        checkKO(st, side);
        return;
      }
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

  if (st.over) return;

  // 回合上限:按剩余 HP 比例判定(完全相等为平局)
  const nextRound = Math.ceil((st.turnNo + 1) / 2);
  if (nextRound > PVP_MAX_ROUNDS) {
    const hostPct = st.host.hp / st.host.maxHp;
    const guestPct = st.guest.hp / st.guest.maxHp;
    st.over = true;
    st.winner = hostPct > guestPct ? "host" : hostPct < guestPct ? "guest" : null;
    pushFx(st, st.turn, "回合上限,按剩余体力判定", "#ffd700");
    return;
  }
  beginTurn(st, other(side));
}

/* ============ 动作入口(宿主执行;返回是否生效) ============ */

/** 出牌阶段公共逻辑 */
function enterCardPhase(st: PvpState, side: PvpSide): void {
  const f = fighterOf(st, side);
  st.phase = "card";
  const base = st.turnCorrect;
  f.energy = f.status?.type === "para" ? Math.floor(base / 2) : base;
  // L4:本对决后手的首个回合补偿 1 能量(挑战者节奏补偿)
  if (st.turnNo - st.duelStartTurnNo === 1) f.energy += 1;
  // 被动:出牌阶段额外指令/抽牌(绿波调度 / 全域绿波)
  const bonus = skillCardPhaseBonus(getValkById(f.valkId));
  f.energy += bonus.energy;
  if (f.status?.type === "para" && base > 0) {
    pushFx(st, side, "限速减速:能量减半", "#8fb7ff");
  }
  if (f.drawPile.length === 0) f.drawPile = shuffle(f.deck);
  drawInto(f, 5 + bonus.draw);
  // L5:出牌阶段总时限
  st.cardEndsAt = Date.now() + PVP_CARD_TIME_MS;
}

/** 答题:答对 → 伤害+连击+下一题(答满 5 题自动进出牌);答错/超时 → 锁题待进入出牌阶段 */
export function pvpAnswer(st: PvpState, side: PvpSide, pick: number): boolean {
  if (st.over || st.turn !== side || st.phase !== "question" || st.qLocked) return false;
  const q = st.currentQ;
  if (!q) return false;
  st.fxSeq += 1;
  const f = fighterOf(st, side);
  const correct = pick === q.ans;
  if (correct) {
    f.combo++;
    st.turnCorrect++;
    if (f.combo > f.maxCombo) f.maxCombo = f.combo;
    // 伤害公式与 PvE answerBattle 一致(攻击取平衡表数值;被动·执法先锋提升连击倍率)
    const baseDmg = 3 + Math.floor(f.combo / 3) * 2 + f.atk;
    const comboMult = 1 + (f.combo - 1) * (0.15 + skillComboBonus(getValkById(f.valkId)));
    const crit = f.combo > 0 && f.combo % 5 === 0;
    const dealt = hit(st, side, Math.floor(baseDmg * comboMult * (crit ? 1.5 : 1)));
    pushFx(st, side, crit ? "暴击!" : `连击${f.combo}`, crit ? "#ffd700" : "#ff6688", "answer", dealt, crit);

    // 被动·晴空暖意:答对回血
    const heal = skillAnswerHeal(getValkById(f.valkId));
    if (heal > 0) {
      f.hp = Math.min(f.maxHp, f.hp + heal);
      pushFx(st, side, `晴空暖意 +${heal}`, "#4ec98c", "heal");
    }
    // 被动·夜路心灯:答对概率眩目对方 1 回合(对方存活且无异常时)
    const foe0 = fighterOf(st, other(side));
    if (!foe0.status && foe0.hp > 0) {
      const sc = skillAnswerStatusChance(getValkById(f.valkId));
      if (sc.confuse > 0 && Math.random() < sc.confuse) {
        foe0.status = { type: "confuse", turns: 1 };
        pushFx(st, side, "夜路心灯:远光眩目!", "#c76fd8", "status");
      }
    }

    if (checkKO(st, other(side))) return true; // 击倒对方 → 换人/终局接管流转
    st.turnQIdx += 1;
    if (st.turnQIdx >= PVP_MAX_Q) {
      pushFx(st, side, "答题上限,进入出牌", "#ffd700");
      enterCardPhase(st, side);
    } else {
      showQuestion(st);
    }
  } else {
    f.combo = 0;
    st.qLocked = true;
    st.answered = { pick, correct: false };
  }
  return true;
}

/** 答题超时(宿主计时器调用):按答错处理(pick=-1 不高亮任何选项) */
export function pvpTimeout(st: PvpState): boolean {
  if (st.over || st.phase !== "question" || st.qLocked) return false;
  st.fxSeq += 1;
  const f = fighterOf(st, st.turn);
  f.combo = 0;
  st.qLocked = true;
  st.answered = { pick: -1, correct: false };
  pushFx(st, st.turn, "⏰ 超时!", "#ff8800", "timeout");
  return true;
}

/** 进入出牌阶段:答错锁定后必进;答对攒了能量也可主动停止答题 */
export function pvpEnterCard(st: PvpState, side: PvpSide): boolean {
  if (
    st.over ||
    st.turn !== side ||
    st.phase !== "question" ||
    (!st.qLocked && st.turnCorrect === 0)
  ) {
    return false;
  }
  st.fxSeq += 1;
  enterCardPhase(st, side);
  return true;
}

/** 构建 applyCardFx 所需的双端上下文(出牌/必杀共用) */
function buildCtx(st: PvpState, side: PvpSide): {
  f: PvpFighter;
  foe: PvpFighter;
  ctx: BattleCtx;
} {
  const f = fighterOf(st, side);
  const foe = fighterOf(st, other(side));
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
    atk: f.atk,
    dmgMult: foe.weakMult * foe.defMult,
    draw: (n) => drawInto(f, n),
  };
  return { f, foe, ctx };
}

/** 出牌:费用校验 → 远光眩目 30% 打空 → applyCardFx 结算 */
export function pvpPlayCard(st: PvpState, side: PvpSide, handIdx: number): boolean {
  if (st.over || st.turn !== side || st.phase !== "card") return false;
  const { f, foe, ctx } = buildCtx(st, side);
  const id = f.hand[handIdx];
  const card = id ? findCard(id) : undefined;
  if (!card) return false;
  if (f.energy < card.cost) return false;
  st.fxSeq += 1;

  f.hand.splice(handIdx, 1);
  f.discardPile.push(id!);
  f.energy -= card.cost;

  // 远光眩目:30% 概率打空(牌已消耗)
  if (f.status?.type === "confuse" && Math.random() < 0.3) {
    pushFx(st, side, "远光眩目,打空了…", "#8fb7ff");
    return true;
  }

  // 被动·事故重演:攻击牌伤害加成(计入 ctx.atk)
  ctx.atk += skillCardAtkBonus(getValkById(f.valkId), card);

  const prevFoeStatus = foe.status;
  const events = applyCardFx(card, ctx);

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
  // L3:控制免疫期内,冻结/禁行无法施加(保留其原有状态)
  let ctrlBlocked = false;
  if (
    foe.ctrlImmuneTurns > 0 &&
    foe.status &&
    (foe.status.type === "freeze" || foe.status.type === "sleep")
  ) {
    foe.status = prevFoeStatus;
    ctrlBlocked = true;
  }
  if (foe.hp <= 0 && checkKO(st, other(side))) return true; // 击倒对方 → 换人/终局
  if (f.hp <= 0 && checkKO(st, side)) return true; // 自伤致倒 → 我方换人

  // 必杀槽:每出一张牌 +1(满槽解锁必杀,释放后清零)
  if (!f.ultUsed) {
    f.ultGauge = Math.min(f.ultMax, f.ultGauge + 1);
  }

  // 飘字:伤害/回复/状态摘要
  for (const e of events) {
    if (e.type === "dmg") pushFx(st, side, `${card.name}`, "#ff6688", "card", e.amount);
    else if (e.type === "heal") pushFx(st, side, `${card.name} +${e.amount}`, "#4ec98c", "heal");
    else if (e.type === "status" && !ctrlBlocked)
      pushFx(st, side, `${card.name} ${STATUS_NAMES[e.status]}`, "#c76fd8", "status");
  }
  if (ctrlBlocked) pushFx(st, side, "对方免疫控制", "#8fb7ff");

  // 板块联动:与当前出战学员主板块相同的牌 → 联动出击(每回合每板块限 1 次)
  applyLink(st, side, card);
  return true;
}

/** 必杀(主动技):必杀槽满后本对决可释放一次 — 复用 applyCardFx 结算,PvP 数值按比例缩放 */
export function pvpUlt(st: PvpState, side: PvpSide): boolean {
  if (st.over || st.turn !== side || st.phase !== "card") return false;
  const { f, foe, ctx } = buildCtx(st, side);
  if (f.ultUsed || f.ultGauge < f.ultMax) return false;
  const valk = getValkById(f.valkId);
  if (!valk || !valk.ult?.name) return false;
  st.fxSeq += 1;

  const ult = buildUltCard(valk);
  // PvP 平衡:必杀直接伤害按比例缩放(通用数值段,避免一击秒杀)
  const card = {
    ...ult,
    fx: {
      ...ult.fx,
      dmg: typeof ult.fx.dmg === "number" ? Math.floor(ult.fx.dmg * ULT_PVP_DMG_SCALE) : ult.fx.dmg,
    },
  };
  const prevFoeStatus = foe.status;
  const events = applyCardFx(card, ctx);

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
  if (foe.ctrlImmuneTurns > 0 && foe.status && (foe.status.type === "freeze" || foe.status.type === "sleep")) {
    foe.status = prevFoeStatus;
  }

  f.ultGauge = 0;
  f.ultUsed = true;

  const totalDmg = events.reduce(
    (sum, e) => (e.type === "dmg" ? sum + e.amount : sum),
    0,
  );
  pushFx(st, side, `必杀!${card.name}`, "#ffd700", "card", totalDmg > 0 ? totalDmg : undefined);
  if (foe.hp <= 0 && checkKO(st, other(side))) return true;
  if (f.hp <= 0 && checkKO(st, side)) return true;
  return true;
}

/** 板块联动(数值统一不随学员变,保证公平;联动类型随学员主板块变) */
function applyLink(st: PvpState, side: PvpSide, card: { attr?: string }): void {
  const f = fighterOf(st, side);
  const foe = fighterOf(st, other(side));
  const attr = getValkById(f.valkId)?.attr;
  if (!attr || card.attr !== attr || f.linkUsed.includes(attr)) return;
  f.linkUsed.push(attr);
  const vName = getValkById(f.valkId)?.c ?? f.name;
  if (attr === "law") {
    const dmg = hit(st, side, 4 + f.atk);
    pushFx(st, side, `联动!${vName} 制裁 -${dmg}`, "#ffb300", "card", dmg);
    checkKO(st, other(side));
  } else if (attr === "signal") {
    f.energy += 1;
    pushFx(st, side, `联动!${vName} 调度 +1⚡`, "#57c7a7");
  } else if (attr === "safety") {
    f.block += 4;
    pushFx(st, side, `联动!${vName} 守护 +4🛡️`, "#4ec98c");
  } else {
    if (Math.random() < 0.3) {
      foe.status = { type: "confuse", turns: 1 };
      pushFx(st, side, `联动!${vName} 远光眩目`, "#c76fd8", "status");
    } else {
      pushFx(st, side, `联动!${vName} 眩目未中…`, "#a8878e");
    }
  }
}

/** 结束回合(出牌阶段) */
export function pvpEndTurn(st: PvpState, side: PvpSide): boolean {
  if (st.over || st.turn !== side || st.phase !== "card") return false;
  st.fxSeq += 1;
  endTurn(st, side);
  return true;
}

/** 宿主动作分发(answer/enterCard/play/ult/endTurn 统一入口) */
export function pvpApply(st: PvpState, side: PvpSide, act: PvpAct): boolean {
  switch (act.act) {
    case "answer":
      return pvpAnswer(st, side, act.pick);
    case "enterCard":
      return pvpEnterCard(st, side);
    case "play":
      return pvpPlayCard(st, side, act.handIdx);
    case "ult":
      return pvpUlt(st, side);
    case "endTurn":
      return pvpEndTurn(st, side);
  }
}

/** 抽牌(弃牌堆空自动洗回) */
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

/** 快照:补算剩余毫秒;viewer 指定时隐藏对方(宿主)的牌面信息(等长空串,防作弊) */
export function pvpSnapshot(st: PvpState, viewer?: PvpSide): PvpState {
  const snap: PvpState = {
    ...st,
    qRemainMs: st.qLocked ? 0 : Math.max(0, st.qEndsAt - Date.now()),
    cardRemainMs:
      st.phase === "card" ? Math.max(0, st.cardEndsAt - Date.now()) : 0,
  };
  if (viewer === "guest") {
    const hide = (arr: string[]) => arr.map(() => "");
    snap.host = { ...snap.host, deck: hide(snap.host.deck), hand: hide(snap.host.hand), drawPile: hide(snap.host.drawPile), discardPile: hide(snap.host.discardPile) };
  }
  return snap;
}

/** 宿主定时推进:答题超时/出牌超时(返回 true 表示状态有变,需推送) */
export function pvpTick(st: PvpState): boolean {
  if (st.over) return false;
  if (st.phase === "question" && !st.qLocked) {
    if (Date.now() < st.qEndsAt) return false;
    return pvpTimeout(st);
  }
  if (st.phase === "card" && Date.now() >= st.cardEndsAt) {
    pushFx(st, st.turn, "出牌超时,自动结束回合", "#ff8800", "timeout");
    return pvpEndTurn(st, st.turn);
  }
  return false;
}
