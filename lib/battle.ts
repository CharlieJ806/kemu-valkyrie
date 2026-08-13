import type { MapNode, Question, RunState } from "./types";
import { applyCardFx, hydrateCard, type BattleCtx } from "./cards";
import {
  getEnemyStats,
  getPlayerAtk,
  rand,
  shuffle,
} from "./formulas";

/* ============ 牌堆 ============ */

export function shuffleDeck(run: RunState): void {
  run.drawPile = shuffle(run.deck);
  run.discardPile = [];
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

/* ============ 队伍出战(多宝可梦上阵) ============ */

/** 把当前出战宝可梦的 HP 读入 run.hp/maxHp(战斗开始时调用) */
export function syncActiveToHp(run: RunState): void {
  const i = run.activeIdx ?? 0;
  if (run.teamHp && run.teamHp[i] != null) {
    run.hp = run.teamHp[i]!;
    run.maxHp = run.teamMaxHp?.[i] ?? run.maxHp;
  }
}

/** 把 run.hp 回写到当前出战宝可梦(战斗结束/切换时调用) */
export function saveActiveFromHp(run: RunState): void {
  const i = run.activeIdx ?? 0;
  if (run.teamHp && run.teamHp[i] != null) {
    run.teamHp[i] = run.hp;
  }
}

/** 当前出战倒下后,自动切换到下一只存活宝可梦;返回是否切换成功 */
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

/** 对敌方造成伤害(格挡结算)。返回 { dealt, blocked } */
export function dealEnemyDamage(
  run: RunState,
  amount: number,
  ignoreBlock = false,
): { dealt: number; blocked: number } {
  let actual = Math.floor(amount * run.playerDmgMult);
  let blocked = 0;
  if (!ignoreBlock && run.enemyBlock > 0) {
    blocked = Math.min(run.enemyBlock, actual);
    run.enemyBlock -= blocked;
    actual -= blocked;
  }
  run.enemyHp = Math.max(0, run.enemyHp - actual);
  return { dealt: actual, blocked };
}

/** 对玩家造成伤害(格挡结算);当前宝可梦倒下且队伍有存活成员时自动换人 */
export function damagePlayer(run: RunState, amount: number): number {
  let actual = amount;
  if (run.block > 0) {
    const blocked = Math.min(run.block, actual);
    run.block -= blocked;
    actual -= blocked;
  }
  run.hp = Math.max(0, run.hp - Math.floor(actual));
  if (run.hp <= 0 && run.team.length > 1) {
    switchToNextAlive(run);
  }
  return Math.floor(actual);
}

/* ============ 抽题(迁移自 nextBattleQuestion) ============ */

export function pickBattleQuestion(
  run: RunState,
  allQuestions: Question[],
): Question | null {
  if (allQuestions.length === 0) return null;
  const recent = run.questionHistory.slice(-10);
  const candidates = allQuestions.filter((q) => !recent.includes(q.id));
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
  run.enemyBlock = 0;
  run.captureBonus = 0;

  // 手牌清空入弃牌堆
  if (run.hand.length > 0) {
    run.discardPile = [...run.discardPile, ...run.hand];
    run.hand = [];
  }

  run.enemyIntent = {
    damage: run.enemyBaseDamage + rand(-2, 3),
    type: "attack",
  };

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
};

/** 结束回合:泄能 → 异常结算 → 敌方攻击 → 开始新回合 */
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
  };

  if (run.turnPhase === "question") {
    run.energy = run.turnCorrect;
  }

  // 泄能:剩余能量 × 攻击力
  if (run.energy > 0 && run.enemyHp > 0) {
    const dump = run.energy * getPlayerAtk(metaAtkLv);
    if (dump > 0) {
      dealEnemyDamage(run, dump);
      res.dumpDmg = dump;
    }
    run.energy = 0;
    if (run.enemyHp <= 0) {
      run.discardPile = [...run.discardPile, ...run.hand];
      run.hand = [];
      res.enemyDead = true;
      return res;
    }
  }

  // 清手牌
  run.discardPile = [...run.discardPile, ...run.hand];
  run.hand = [];

  // 异常状态回合结算(灼烧/中毒)
  if (run.enemyStatus && run.enemyHp > 0) {
    const st = run.enemyStatus;
    if (st.type === "burn") {
      dealEnemyDamage(run, 4, true);
      res.statusTick = { type: "burn", dmg: 4 };
    } else if (st.type === "poison") {
      dealEnemyDamage(run, 6, true);
      res.statusTick = { type: "poison", dmg: 6 };
    }
    st.turns -= 1;
    if (st.turns <= 0) run.enemyStatus = null;
    if (run.enemyHp <= 0) {
      res.enemyDead = true;
      return res;
    }
  }

  // 敌方攻击
  if (run.enemyPkm && run.enemyHp > 0 && run.enemyIntent) {
    if (run.enemyStatus && run.enemyStatus.type === "sleep") {
      // 敌方睡着了… 跳过攻击
      run.enemyStatus.turns -= 1;
      if (run.enemyStatus.turns <= 0) run.enemyStatus = null;
    } else if (
      run.enemyStatus &&
      run.enemyStatus.type === "confuse" &&
      Math.random() < 0.5
    ) {
      const selfDmg = Math.floor(
        (run.enemyIntent.damage || run.enemyBaseDamage) * 0.5,
      );
      dealEnemyDamage(run, selfDmg, true);
      if (run.enemyHp <= 0) {
        res.enemyDead = true;
        return res;
      }
    } else {
      let dmg = Math.floor(
        (run.enemyIntent.damage || run.enemyBaseDamage) *
          run.playerDefMult *
          (run.enemyAtkMult || 1),
      );
      if (run.enemyStatus && run.enemyStatus.type === "para") {
        dmg = Math.floor(dmg * 0.6);
      }
      if (run.enemyStatus && run.enemyStatus.type === "freeze") {
        // 敌方被冰冻,无法行动
        run.enemyStatus.turns -= 1;
        if (run.enemyStatus.turns <= 0) run.enemyStatus = null;
      } else {
        const actual = damagePlayer(run, dmg);
        res.enemyDmg = actual;
        if (run.hp <= 0) {
          res.playerDead = true;
          return res;
        }
      }
    }
  }

  run.block = Math.max(0, run.block);
  run.playerDmgMult = 1;
  run.playerDefMult = 1;
  run.enemyAtkMult = 1;

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

  const card = hydrateCard(run.hand[idx]!);
  if (!card) return null;
  if (typeof card.cost !== "number") card.cost = 0;
  if (run.energy < card.cost) return null;
  if (card._played) return null;

  run.energy -= card.cost;
  run.cardPlayedThisTurn = true;

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
    enemyStatus: run.enemyStatus,
    atk: getPlayerAtk(metaAtkLv),
    draw: (n) => drawCardsInto(run, n),
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
  run.enemyStatus = ctx.enemyStatus;

  // 移入弃牌堆
  run.discardPile.push(card.id);
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
    dealEnemyDamage(run, totalDmg);
    res.combo = run.combo;
    res.dmg = totalDmg;

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
      enterCardPhase(run);
    }
  }

  return res;
}

/* ============ 战斗开始(迁移自 startBattle) ============ */

export function startBattleOn(
  run: RunState,
  node: MapNode,
  isBoss: boolean,
  allQuestions: Question[],
): void {
  run.inBattle = true;
  syncActiveToHp(run); // 出战宝可梦的血量 → run.hp/maxHp(战斗内统一走 run.hp)
  run.combo = 0;
  run.block = 0;
  run.playerDmgMult = 1;
  run.playerDefMult = 1;
  run.captureBonus = 0;
  run.turnPhase = "question";
  run.turnCorrect = 0;
  run.energy = 0;
  run.hand = [];
  run.enemyStatus = null;
  run.enemyAtkMult = 1;
  run.currentQ = null;
  run.questionAnswered = false;
  run.cardPlayedThisTurn = false;

  const pkm = node.enemyPkm!;
  const stats = getEnemyStats(pkm, run.floor);
  run.enemyPkm = pkm;
  run.enemyMaxHp = isBoss ? Math.floor(stats.hp * 1.5) : stats.hp;
  run.enemyHp = run.enemyMaxHp;
  run.enemyBlock = 0;
  run.enemyBaseDamage = stats.dmg;
  run.enemyCaptureRate = stats.captureRate;

  run.drawPile = shuffle(run.deck);
  run.discardPile = [];

  startTurn(run, allQuestions);
}
