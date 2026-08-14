import type { EnemyIntent, MapNode, Question, RunState } from "./types";
import {
  applyCardFx,
  hydrateCard,
  findCard,
  buildUltCard,
  ULT_PREFIX,
  type BattleCtx,
  type CardFxEvent,
} from "./cards";
import { getQuestionCat, getValkById, type AttrKey, type Valkyrie } from "@/data";
import {
  getEnemyStats,
  getPlayerAtk,
  rand,
  shuffle,
} from "./formulas";
import {
  AFFIX_NAMES,
  BATTLE_Q_TIME_MS,
  FOG_Q_TIME_MS,
} from "@/data/constants";
import { bossDodgeActive, getBossMechanic } from "./bossMechanics";

/** 精英词缀池(按节点类型/周目投掷) */
export const AFFIX_POOL = Object.keys(AFFIX_NAMES);

/** 敌方意图权重:攻击 / 防御 / 连环 / 蓄力 */
const INTENT_WEIGHTS: [EnemyIntent["type"], number][] = [
  ["attack", 60],
  ["guard", 15],
  ["multi", 15],
  ["charge", 10],
];

function pickIntentType(): EnemyIntent["type"] {
  const total = INTENT_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of INTENT_WEIGHTS) {
    r -= w;
    if (r <= 0) return t;
  }
  return "attack";
}

/* ============ 牌堆 ============ */

export function shuffleDeck(run: RunState): void {
  run.drawPile = shuffle(run.deck);
  run.discardPile = [];
}

/** 清理必杀卡(不进入任何牌堆,防污染存档) */
export function stripUltCards(run: RunState): void {
  const isUlt = (id: string) => id.startsWith(ULT_PREFIX);
  run.hand = run.hand.filter((h) => !isUlt(h));
  run.deck = run.deck.filter((h) => !isUlt(h));
  run.drawPile = run.drawPile.filter((h) => !isUlt(h));
  run.discardPile = run.discardPile.filter((h) => !isUlt(h));
}

/* ============ 板块联动 ============ */

/** 队伍中第一只存活且主板块/觉醒第二板块匹配的学员 */
export function getLinkValk(run: RunState, attr: AttrKey): Valkyrie | null {
  for (let i = 0; i < run.team.length; i++) {
    if ((run.teamHp[i] || 0) <= 0) continue;
    const v = getValkById(run.team[i]!);
    if (!v) continue;
    if (v.attr === attr || run.awakened?.[v.id] === attr) return v;
  }
  return null;
}

/** 领队存活检查(大招槽只在领队存活时累积) */
export function leaderAlive(run: RunState): boolean {
  if (run.leaderId == null) return false;
  const i = run.team.indexOf(run.leaderId);
  return i >= 0 && (run.teamHp[i] || 0) > 0;
}

/** 板块联动效果(law 制裁/signal 调度/safety 守护/civility 眩目),返回事件 */
export function applyLinkEffect(
  run: RunState,
  valk: Valkyrie,
  attr: AttrKey,
  metaAtkLv: number,
): CardFxEvent | null {
  if (attr === "law") {
    const amount = Math.floor(valk.atk * 1.25) + (metaAtkLv || 0);
    const dealt = dealEnemyDamage(run, amount);
    return { type: "link", valkId: valk.id, valkName: valk.c, amount: dealt.dealt, bonus: "dmg" };
  }
  if (attr === "signal") {
    run.energy += 1;
    return { type: "link", valkId: valk.id, valkName: valk.c, amount: 1, bonus: "energy" };
  }
  if (attr === "safety") {
    run.block += 4;
    return { type: "link", valkId: valk.id, valkName: valk.c, amount: 4, bonus: "block" };
  }
  // civility:50% 概率眩目 1 回合
  if (Math.random() < 0.5) {
    run.enemyStatus = { type: "confuse", turns: 1 };
    return { type: "link", valkId: valk.id, valkName: valk.c, amount: 1, bonus: "confuse" };
  }
  return { type: "link", valkId: valk.id, valkName: valk.c, amount: 0, bonus: "confuse" };
}

export function drawCardsInto(run: RunState, n: number): void {
  for (let i = 0; i < n; i++) {
    if (run.drawPile.length === 0) {
      if (run.discardPile.length === 0) break;
      run.drawPile = shuffle(run.discardPile);
      run.discardPile = [];
    }
    if (run.drawPile.length > 0) {
      const id = run.drawPile.pop()!;
      run.hand.push(id);
    }
  }
}

/* ============ 队伍出战(多学员上阵) ============ */

/** 把当前出战学员的 HP 读入 run.hp/maxHp(战斗开始时调用) */
export function syncActiveToHp(run: RunState): void {
  const i = run.activeIdx ?? 0;
  if (run.teamHp && run.teamHp[i] != null) {
    run.hp = run.teamHp[i]!;
    run.maxHp = run.teamMaxHp?.[i] ?? run.maxHp;
  }
}

/** 把 run.hp 回写到当前出战学员(战斗结束/切换时调用) */
export function saveActiveFromHp(run: RunState): void {
  const i = run.activeIdx ?? 0;
  if (run.teamHp && run.teamHp[i] != null) {
    run.teamHp[i] = run.hp;
  }
}

/** 当前出战倒下后,自动切换到下一名存活学员;返回是否切换成功 */
export function switchToNextAlive(run: RunState): boolean {
  if (!run.teamHp || run.team.length < 2) return false;
  saveActiveFromHp(run); // 先把当前(已倒下的)血量回写
  const n = run.team.length;
  for (let k = 1; k < n; k++) {
    const i = (run.activeIdx + k) % n;
    if ((run.teamHp[i] || 0) > 0) {
      run.activeIdx = i;
      run.hp = run.teamHp[i]!;
      run.maxHp = run.teamMaxHp?.[i] ?? run.maxHp;
      return true;
    }
  }
  return false;
}

/** 手动切换出战(仅战斗外/战斗内均可;返回 false 表示目标已倒下或下标非法) */
export function switchActiveTo(run: RunState, idx: number): boolean {
  if (idx < 0 || idx >= run.team.length || idx === run.activeIdx) return false;
  if ((run.teamHp[idx] || 0) <= 0) return false;
  saveActiveFromHp(run);
  run.activeIdx = idx;
  syncActiveToHp(run);
  return true;
}

/* ============ 伤害 ============ */

/** 敌方是否闪避本次玩家攻击(Boss 雾隐) */
export function enemyDodges(run: RunState): boolean {
  return bossDodgeActive(run);
}

/** Boss 机制伤害倍率(路障减伤等) */
function bossDmgMult(run: RunState): number {
  if (!run.enemyPkm) return 1;
  return getBossMechanic(run.enemyPkm.id)?.dmgMult?.(run) ?? 1;
}

/** 词缀·复苏:首次阵亡复活 50% HP */
function tryAffixRevive(run: RunState): boolean {
  if (!run.enemyAffix.includes("revive")) return false;
  if (run.affixRevived) return false;
  if (run.enemyHp > 0) return false;
  run.affixRevived = true;
  run.enemyHp = Math.max(1, Math.floor(run.enemyMaxHp * 0.5));
  return true;
}

/** 词缀·荆棘:反伤 25%(无视格挡);DoT/敌方自伤不触发 */
function applyThorn(run: RunState, dealt: number): void {
  if (dealt <= 0) return;
  if (!run.enemyAffix.includes("thorn")) return;
  damagePlayer(run, Math.max(1, Math.floor(dealt * 0.25)));
}

/** 对敌方造成伤害(格挡结算)。返回 { dealt, blocked, revived } */
export function dealEnemyDamage(
  run: RunState,
  amount: number,
  ignoreBlock = false,
  opts?: { reflect?: boolean },
): { dealt: number; blocked: number; revived: boolean } {
  if (amount <= 0) return { dealt: 0, blocked: 0, revived: false };
  // Boss 雾隐闪避
  if (enemyDodges(run)) return { dealt: 0, blocked: 0, revived: false };
  let actual = Math.floor(amount * run.playerDmgMult * bossDmgMult(run));
  let blocked = 0;
  if (!ignoreBlock && run.enemyBlock > 0) {
    blocked = Math.min(run.enemyBlock, actual);
    run.enemyBlock -= blocked;
    actual -= blocked;
  }
  run.enemyHp = Math.max(0, run.enemyHp - actual);
  const revived = tryAffixRevive(run);
  // 荆棘反伤:实际造成伤害后反噬(敌方自伤/异常灼烧不触发)
  if (opts?.reflect !== false && actual > 0) applyThorn(run, actual);
  return { dealt: actual, blocked, revived };
}

/** 对玩家造成伤害(格挡结算);当前学员倒下且队伍有存活成员时自动换人 */
export function damagePlayer(run: RunState, amount: number): number {
  let actual = amount;
  if (run.block > 0) {
    const blocked = Math.min(run.block, actual);
    run.block -= blocked;
    actual -= blocked;
  }
  run.hp = Math.max(0, run.hp - Math.floor(actual));
  if (Math.floor(actual) > 0) run.chapterDamaged = true;
  if (run.hp <= 0 && run.team.length > 1) {
    switchToNextAlive(run);
  }
  return Math.floor(actual);
}

/* ============ 抽题(迁移自 nextBattleQuestion) ============ */

/** 牌组众数板块(用于抽题弱联动;牌组无板块信息时返回 null) */
export function dominantDeckAttr(run: RunState): AttrKey | null {
  const counts: Partial<Record<AttrKey, number>> = {};
  let best: AttrKey | null = null;
  let bestN = 0;
  for (const id of run.deck) {
    const card = findCard(id);
    const attr = (card as { attr?: AttrKey } | null)?.attr;
    if (!attr) continue;
    counts[attr] = (counts[attr] || 0) + 1;
    if (counts[attr]! > bestN) {
      bestN = counts[attr]!;
      best = attr;
    }
  }
  return best;
}

export function pickBattleQuestion(
  run: RunState,
  allQuestions: Question[],
): Question | null {
  if (allQuestions.length === 0) return null;
  const recent = run.questionHistory.slice(-10);
  let candidates = allQuestions.filter((q) => !recent.includes(q.id));

  // 弱联动:50% 概率从牌组众数板块抽题(导入题库无分类 → 不参与过滤,过滤后为空回退全量)
  const dominant = dominantDeckAttr(run);
  if (dominant && Math.random() < 0.5) {
    const pool = candidates.filter((q) => getQuestionCat(q.id) === dominant);
    if (pool.length > 0) candidates = pool;
  }

  const q =
    candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]!
      : allQuestions[Math.floor(Math.random() * allQuestions.length)]!;
  run.currentQ = q;
  run.questionHistory.push(q.id);
  if (run.questionHistory.length > 60) run.questionHistory.splice(0, 20);
  return q;
}

/* ============ 回合流程(迁移自 startTurn / enterCardPhase / endTurn) ============ */

export function startTurn(run: RunState, allQuestions: Question[]): void {
  run.turnPhase = "question";
  run.turnCorrect = 0;
  run.energy = 0;
  run.block = 0;
  run.cardPlayedThisTurn = false;
  run.questionAnswered = false;
  run.playerDmgMult = 1;
  run.playerDefMult = 1;
  // 敌方格挡跨回合保留(防御意图/厚甲/路障均依赖)

  // Boss 机制:玩家回合开始钩子(雾隐/信号干扰/路障/迷雾限时)
  if (run.enemyPkm) getBossMechanic(run.enemyPkm.id)?.onPlayerTurnStart?.(run);

  // 答题限时:默认 60 秒;迷雾 Boss 的迷障回合缩短为 30 秒
  run.qTimeLimit = run.bossVars.fog ? FOG_Q_TIME_MS : BATTLE_Q_TIME_MS;
  run.bossVars.fog = 0;

  // 手牌清空入弃牌堆(必杀卡不入堆)
  stripUltCards(run);
  if (run.hand.length > 0) {
    run.discardPile = [...run.discardPile, ...run.hand];
    run.hand = [];
  }

  // 意图明牌:按权重抽 4 种意图之一
  const type = pickIntentType();
  const baseDmg = run.enemyBaseDamage + rand(-2, 3);
  run.enemyIntent =
    type === "guard"
      ? { damage: Math.max(1, Math.floor(baseDmg * 0.5)), type, block: rand(10, 20) }
      : type === "multi"
        ? { damage: Math.max(1, Math.floor(baseDmg * 0.6)), type }
        : { damage: Math.max(1, baseDmg), type };

  pickBattleQuestion(run, allQuestions);
}

/** 答错/停止答题 → 进入出牌阶段(energy = 答对数) */
export function enterCardPhase(run: RunState): void {
  run.turnPhase = "card";
  run.energy = run.turnCorrect;
  run.questionAnswered = true;
  if (run.drawPile.length === 0) run.drawPile = shuffle(run.deck);
  drawCardsInto(run, 5);
}

export type EndTurnResult = {
  enemyDead: boolean;
  playerDead: boolean;
  dumpDmg: number;
  enemyDmg: number;
  statusTick: { type: string; dmg: number } | null;
  revived: boolean;
};

/** 结束回合:泄能 → 异常结算 → 敌方按意图行动 → 开始新回合 */
export function endTurn(
  run: RunState,
  allQuestions: Question[],
  metaAtkLv: number,
): EndTurnResult {
  const res: EndTurnResult = {
    enemyDead: false,
    playerDead: false,
    dumpDmg: 0,
    enemyDmg: 0,
    statusTick: null,
    revived: false,
  };

  if (run.turnPhase === "question") {
    run.energy = run.turnCorrect;
  }

  // 泄能:剩余能量 × 攻击力
  if (run.energy > 0 && run.enemyHp > 0) {
    const dump = run.energy * getPlayerAtk(metaAtkLv);
    if (dump > 0) {
      const r = dealEnemyDamage(run, dump);
      if (r.revived) res.revived = true;
      res.dumpDmg = dump;
    }
    run.energy = 0;
    if (run.enemyHp <= 0) {
      stripUltCards(run);
      run.discardPile = [...run.discardPile, ...run.hand];
      run.hand = [];
      res.enemyDead = true;
      return res;
    }
  }

  // 清手牌(必杀卡不入堆)
  stripUltCards(run);
  run.discardPile = [...run.discardPile, ...run.hand];
  run.hand = [];

  // 异常状态回合结算(灼烧/中毒;DoT 不触发荆棘反伤)
  if (run.enemyStatus && run.enemyHp > 0) {
    const st = run.enemyStatus;
    if (st.type === "burn") {
      const r = dealEnemyDamage(run, 4, true, { reflect: false });
      if (r.revived) res.revived = true;
      res.statusTick = { type: "burn", dmg: 4 };
    } else if (st.type === "poison") {
      const r = dealEnemyDamage(run, 6, true, { reflect: false });
      if (r.revived) res.revived = true;
      res.statusTick = { type: "poison", dmg: 6 };
    }
    st.turns -= 1;
    if (st.turns <= 0) run.enemyStatus = null;
    if (run.enemyHp <= 0) {
      res.enemyDead = true;
      return res;
    }
  }

  // 敌方按意图行动
  if (run.enemyPkm && run.enemyHp > 0 && run.enemyIntent) {
    const intent = run.enemyIntent;
    const mech = getBossMechanic(run.enemyPkm.id);
    mech?.onEnemyActStart?.(run);

    const atkBase =
      intent.damage *
      run.playerDefMult *
      (run.enemyAtkMult || 1) *
      (run.enemyChargeMul || 1) *
      (mech?.atkMult?.(run) ?? 1);

    /** 实际挥出一击(意图伤害 × para 修正),蓄力倍率在攻击后消耗 */
    const strike = (dmg: number): boolean => {
      let d = dmg;
      if (run.enemyStatus && run.enemyStatus.type === "para") {
        d = Math.floor(d * 0.6);
      }
      const actual = damagePlayer(run, Math.floor(d));
      res.enemyDmg += actual;
      run.enemyChargeMul = 1; // 蓄力倍率已随本次攻击消耗
      if (run.hp <= 0) res.playerDead = true;
      return res.playerDead;
    };

    const asleep = run.enemyStatus && run.enemyStatus.type === "sleep";
    const frozen = run.enemyStatus && run.enemyStatus.type === "freeze";
    const confused =
      run.enemyStatus &&
      run.enemyStatus.type === "confuse" &&
      Math.random() < 0.5;

    let acted = false;
    if (asleep) {
      // 睡着了…跳过行动
      run.enemyStatus!.turns -= 1;
      if (run.enemyStatus!.turns <= 0) run.enemyStatus = null;
    } else if (intent.type === "charge") {
      // 蓄力:本回合不攻击,下回合攻击 ×1.8
      run.enemyChargeMul = 1.8;
      acted = true;
    } else if (confused) {
      // 混乱:50% 概率自伤(蓄力以外的攻击意图)
      const selfDmg = Math.floor(intent.damage * 0.5);
      const r = dealEnemyDamage(run, selfDmg, true, { reflect: false });
      if (r.revived) res.revived = true;
      acted = true;
      if (run.enemyHp <= 0) {
        res.enemyDead = true;
        return res;
      }
    } else if (frozen) {
      // 冻结:无法行动
      run.enemyStatus!.turns -= 1;
      if (run.enemyStatus!.turns <= 0) run.enemyStatus = null;
    } else if (intent.type === "guard") {
      // 防御:先竖格挡,再轻攻击
      run.enemyBlock += intent.block ?? 15;
      acted = true;
      if (strike(atkBase)) return res;
    } else if (intent.type === "multi") {
      // 连环:两段攻击(每段 60%,格挡分别结算)
      acted = true;
      if (strike(atkBase)) return res;
      if (strike(atkBase)) return res;
    } else {
      // 普通攻击
      acted = true;
      if (strike(atkBase)) return res;
    }

    // 词缀·迅捷:本场首个行动回合,若成功出手则追加一次普通攻击
    if (
      acted &&
      run.enemyAffix.includes("swift") &&
      !run.affixSwiftDone &&
      !res.playerDead &&
      run.enemyHp > 0
    ) {
      run.affixSwiftDone = true;
      const extra =
        intent.damage *
        run.playerDefMult *
        (run.enemyAtkMult || 1) *
        (mech?.atkMult?.(run) ?? 1);
      const actual = damagePlayer(run, Math.floor(extra));
      res.enemyDmg += actual;
      if (run.hp <= 0) {
        res.playerDead = true;
        return res;
      }
    }

    // Boss 机制:敌方行动结束钩子(违停堆积/速度狂飙/狂暴回血/清除临时旗标)
    mech?.onEnemyActEnd?.(run);

    // 词缀·厚甲:每回合 +10 格挡
    if (run.enemyAffix.includes("thick") && run.enemyHp > 0) {
      run.enemyBlock += 10;
    }

    // 敌方减伤回合递减:归零才恢复伤害
    if (run.enemyWeakTurns > 0) {
      run.enemyWeakTurns -= 1;
      if (run.enemyWeakTurns <= 0) run.enemyAtkMult = 1;
    } else {
      run.enemyAtkMult = 1;
    }
  }

  run.block = Math.max(0, run.block);
  run.playerDmgMult = 1;
  run.playerDefMult = 1;

  if (!res.playerDead) startTurn(run, allQuestions);
  return res;
}

/* ============ 出牌(迁移自 playCard) ============ */

export type PlayCardResult = {
  cardId: string;
  events: ReturnType<typeof applyCardFx>;
  enemyDead: boolean;
  playerDead: boolean;
};

export function playCardOn(
  run: RunState,
  idx: number,
  metaAtkLv: number,
): PlayCardResult | null {
  if (run.turnPhase !== "card") return null;
  if (idx < 0 || idx >= run.hand.length) return null;

  const rawId = run.hand[idx]!;
  const isUlt = rawId.startsWith(ULT_PREFIX);
  // 必杀卡按当前领队现场构建(不查 ALL_CARDS)
  const card = isUlt
    ? run.leaderId != null
      ? buildUltCard(getValkById(run.leaderId)!)
      : null
    : hydrateCard(rawId);
  if (!card) return null;
  if (typeof card.cost !== "number") card.cost = 0;
  if (run.energy < card.cost) return null;
  if (card._played) return null;

  run.energy -= card.cost;
  run.cardPlayedThisTurn = true;

  // Boss 机制:出牌前钩子(信号干扰 +1 费;必杀卡不受干扰)
  const taxMsg = run.enemyPkm
    ? getBossMechanic(run.enemyPkm.id)?.onPlayCard?.(run) ?? null
    : null;
  if (taxMsg && !isUlt) card.cost += 1;

  const ctx: BattleCtx = {
    enemyHp: run.enemyHp,
    enemyMaxHp: run.enemyMaxHp,
    enemyBlock: run.enemyBlock,
    block: run.block,
    hp: run.hp,
    maxHp: run.maxHp,
    energy: run.energy,
    playerDmgMult: run.playerDmgMult,
    playerDefMult: run.playerDefMult,
    enemyAtkMult: run.enemyAtkMult,
    enemyWeakTurns: run.enemyWeakTurns,
    enemyStatus: run.enemyStatus,
    atk: getPlayerAtk(metaAtkLv),
    draw: (n) => drawCardsInto(run, n),
    dodge: enemyDodges(run),
    dmgMult: bossDmgMult(run),
    reflect: (amt) => applyThorn(run, amt),
    revive: run.enemyAffix.includes("revive") && !run.affixRevived,
  };

  const events = applyCardFx(card, ctx);

  // 回写
  run.enemyHp = ctx.enemyHp;
  run.enemyBlock = ctx.enemyBlock;
  run.block = ctx.block;
  run.hp = ctx.hp;
  run.energy = ctx.energy;
  run.playerDmgMult = ctx.playerDmgMult;
  run.playerDefMult = ctx.playerDefMult;
  run.enemyAtkMult = ctx.enemyAtkMult;
  run.enemyWeakTurns = ctx.enemyWeakTurns ?? 0;
  run.enemyStatus = ctx.enemyStatus;
  if (events.some((e) => e.type === "revive")) {
    run.affixRevived = true;
  }
  if (taxMsg) events.push({ type: "tax", message: taxMsg });

  // 板块联动:队伍有该板块存活学员 → 追加联动效果
  if (run.enemyHp > 0) {
    const linkValk = getLinkValk(run, card.attr);
    if (linkValk) {
      const evt = applyLinkEffect(run, linkValk, card.attr, metaAtkLv);
      if (evt) events.push(evt);
    }
  }

  // 领队大招槽:每出一张牌+1,攒满自动将必杀卡加入手牌;必杀卡打出后清零
  if (isUlt) {
    run.ultGauge = 0;
  } else if (run.leaderId != null && leaderAlive(run) && run.enemyHp > 0) {
    run.ultGauge = Math.min(run.ultMax, run.ultGauge + 1);
    if (
      run.ultGauge >= run.ultMax &&
      !run.hand.some((h) => h.startsWith(ULT_PREFIX))
    ) {
      run.hand.push(ULT_PREFIX + run.leaderId);
    }
  }

  // 移入弃牌堆(必杀卡不入堆)
  if (!isUlt) run.discardPile.push(card.id);
  run.hand.splice(idx, 1);

  return {
    cardId: card.id,
    events,
    enemyDead: run.enemyHp <= 0,
    playerDead: run.hp <= 0,
  };
}

/* ============ 答题(迁移自 handleBattleAnswer) ============ */

export type AnswerBattleResult = {
  correct: boolean;
  combo: number;
  dmg: number;
  counterDmg: number;
  enemyDead: boolean;
  playerDead: boolean;
  revived: boolean;
  /** 答题超时(pickedIdx = -1 时由 UI 判定) */
  timedOut?: boolean;
};

export function answerBattle(
  run: RunState,
  idx: number,
  metaAtkLv: number,
): AnswerBattleResult | null {
  if (run.turnPhase !== "question") return null;
  const q = run.currentQ;
  if (!q) return null;

  const correct = idx === q.ans;
  run.totalAnswered++;

  const res: AnswerBattleResult = {
    correct,
    combo: run.combo,
    dmg: 0,
    counterDmg: 0,
    enemyDead: false,
    playerDead: false,
    revived: false,
  };

  if (correct) {
    run.totalCorrect++;
    run.combo++;
    run.turnCorrect++;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
    run.score += 5;

    // 攻击伤害随连击成长
    const baseDmg = 3 + Math.floor(run.combo / 3) * 2 + getPlayerAtk(metaAtkLv);
    const comboMult = 1 + (run.combo - 1) * 0.15;
    const totalDmg = Math.floor(baseDmg * comboMult * run.playerDmgMult);
    const dmgRes = dealEnemyDamage(run, totalDmg);
    res.combo = run.combo;
    res.dmg = dmgRes.dealt;
    res.revived = dmgRes.revived;

    if (run.enemyHp <= 0) res.enemyDead = true;
  } else {
    run.combo = 0;
    res.combo = 0;

    const counterDmg = Math.floor(run.enemyBaseDamage * 0.5);
    damagePlayer(run, counterDmg);
    res.counterDmg = counterDmg;
    if (run.hp <= 0) {
      res.playerDead = true;
    } else {
      // 答错先停留在答题阶段,由 UI 展示正确答案后再进入出牌阶段
      run.questionAnswered = true;
    }
  }

  return res;
}

/** 答题超时:按答错处理(连击清零 + 反伤 + 进入出牌阶段) */
export function timeoutBattle(run: RunState): AnswerBattleResult | null {
  if (run.turnPhase !== "question" || run.questionAnswered) return null;
  run.totalAnswered++;
  run.combo = 0;
  run.questionAnswered = true;
  const counterDmg = Math.floor(run.enemyBaseDamage * 0.5);
  damagePlayer(run, counterDmg);
  return {
    correct: false,
    combo: 0,
    dmg: 0,
    counterDmg,
    enemyDead: false,
    playerDead: run.hp <= 0,
    revived: false,
    timedOut: true,
  };
}

/* ============ 战斗开始(迁移自 startBattle) ============ */

/** 按节点类型/周目投掷精英词缀 */
export function rollAffixes(nodeType: string, loop: number): string[] {
  const pool = [...AFFIX_POOL];
  const pickOne = () => {
    const i = Math.floor(Math.random() * pool.length);
    return pool.splice(i, 1)[0]!;
  };
  if (nodeType === "elite") {
    const n = loop >= 2 ? 2 : 1;
    return Array.from({ length: n }, pickOne);
  }
  if (nodeType === "battle" && loop >= 3 && Math.random() < 0.2) {
    return [pickOne()];
  }
  return [];
}

export function startBattleOn(
  run: RunState,
  node: MapNode,
  isBoss: boolean,
  allQuestions: Question[],
): void {
  run.inBattle = true;
  syncActiveToHp(run); // 出战学员的血量 → run.hp/maxHp(战斗内统一走 run.hp)
  run.combo = 0;
  run.block = 0;
  run.playerDmgMult = 1;
  run.playerDefMult = 1;
  run.turnPhase = "question";
  run.turnCorrect = 0;
  run.energy = 0;
  run.hand = [];
  run.enemyStatus = null;
  run.enemyAtkMult = 1;
  run.enemyWeakTurns = 0;
  run.enemyChargeMul = 1;
  run.currentQ = null;
  run.questionAnswered = false;
  run.cardPlayedThisTurn = false;
  run.ultGauge = 0; // 每场战斗大招槽从 0 开始(领队/觉醒跨战斗保留)
  run.bossVars = {}; // Boss 机制变量按场重置
  run.qTimeLimit = BATTLE_Q_TIME_MS;

  const pkm = node.enemyPkm!;
  const stats = getEnemyStats(pkm, run.floor);
  run.enemyPkm = pkm;
  run.enemyMaxHp = isBoss ? Math.floor(stats.hp * 1.5) : stats.hp;
  run.enemyHp = run.enemyMaxHp;
  run.enemyBlock = 0;
  run.enemyBaseDamage = stats.dmg;
  run.enemyCaptureRate = stats.captureRate;

  // 精英词缀
  run.enemyAffix = rollAffixes(node.type, run.loop);
  run.affixSwiftDone = false;
  run.affixRevived = false;
  if (run.enemyAffix.includes("rage")) {
    run.enemyBaseDamage = Math.floor(run.enemyBaseDamage * 1.3);
  }
  if (run.enemyAffix.includes("thick")) {
    run.enemyBlock = 30;
  }

  // Boss 机制:战斗开始钩子(记录初始攻击等)
  getBossMechanic(pkm.id)?.onBattleStart?.(run);

  run.drawPile = shuffle(run.deck);
  run.discardPile = [];

  startTurn(run, allQuestions);
}
