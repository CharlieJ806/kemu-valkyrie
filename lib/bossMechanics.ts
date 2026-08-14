/* 章节 Boss 专属机制:按 bossId 配置钩子,战斗流程(battle.ts)负责调用。 */

import type { RunState } from "./types";

export type BossMechanic = {
  /** 机制名(战斗 UI 展示) */
  name: string;
  /** 机制说明(战斗 UI 展示) */
  desc: string;
  /** 隐藏伤害数字意图(迷雾) */
  hideIntent?: boolean;
  /** 战斗开始(startBattleOn 时,数值已就绪) */
  onBattleStart?: (run: RunState) => void;
  /** 玩家回合开始(startTurn 时) */
  onPlayerTurnStart?: (run: RunState) => void;
  /** 敌方行动开始(endTurn 敌方阶段前) */
  onEnemyActStart?: (run: RunState) => void;
  /** 敌方行动结束(endTurn 敌方阶段后) */
  onEnemyActEnd?: (run: RunState) => void;
  /** 玩家对敌伤害倍率(在 playerDmgMult 之外,如路障减伤) */
  dmgMult?: (run: RunState) => number;
  /** 敌方攻击伤害额外倍率(在 enemyAtkMult 之外) */
  atkMult?: (run: RunState) => number;
  /** 出牌前钩子:返回提示文案(如信号干扰),由 playCardOn 追加费用 */
  onPlayCard?: (run: RunState) => string | null;
  /** 敌方是否闪避玩家攻击(雾隐) */
  dodgeActive?: (run: RunState) => boolean;
};

const M: Record<number, BossMechanic> = {
  /* 1 章 · 违停之街:违停车辆越堆越多,每回合给自己加格挡 */
  117: {
    name: "违停堆积",
    desc: "每回合结束时堆积违停(+10 格挡)",
    onEnemyActEnd: (run) => {
      run.enemyBlock += 10;
    },
  },

  /* 2 章 · 超速狂飙:越开越快,攻击每回合 +2;被「限速减速」按住则回落 */
  118: {
    name: "速度狂飙",
    desc: "每回合攻击 +2;处于限速减速时每回合 -2",
    onBattleStart: (run) => {
      run.bossVars.baseDmg = run.enemyBaseDamage;
    },
    onEnemyActEnd: (run) => {
      const base = run.bossVars.baseDmg ?? run.enemyBaseDamage;
      if (run.enemyStatus && run.enemyStatus.type === "para") {
        run.enemyBaseDamage = Math.max(base, run.enemyBaseDamage - 2);
      } else {
        run.enemyBaseDamage += 2;
      }
    },
  },

  /* 3 章 · 迷雾之夜:隐藏意图;每 3 回合下一题限时缩短为 30 秒 */
  119: {
    name: "雾夜迷雾",
    desc: "隐藏攻击伤害;每 3 回合下一题限时 30 秒",
    hideIntent: true,
    onPlayerTurnStart: (run) => {
      run.bossVars.turn = (run.bossVars.turn || 0) + 1;
      if (run.bossVars.turn % 3 === 0) run.bossVars.fog = 1;
    },
  },

  /* 8 章 · 信号崩坏:每 3 回合干扰,你下一张牌费用 +1 */
  120: {
    name: "信号干扰",
    desc: "每 3 回合干扰:你下一张牌费用 +1",
    onPlayerTurnStart: (run) => {
      run.bossVars.turn = (run.bossVars.turn || 0) + 1;
      if (run.bossVars.turn % 3 === 0) run.bossVars.tax = 1;
    },
    onPlayCard: (run) => {
      if (run.bossVars.tax) {
        run.bossVars.tax = 0;
        return "📡 信号干扰:本张牌费用 +1";
      }
      return null;
    },
  },

  /* 4 章 · 路障要塞:每 3 回合竖起路障(+40 格挡);有格挡时受伤减半 */
  121: {
    name: "路障要塞",
    desc: "每 3 回合 +40 格挡;有格挡时受伤减半",
    onPlayerTurnStart: (run) => {
      run.bossVars.turn = (run.bossVars.turn || 0) + 1;
      if (run.bossVars.turn % 3 === 0) run.enemyBlock += 40;
    },
    dmgMult: (run) => (run.enemyBlock > 0 ? 0.5 : 1),
  },

  /* 5 章 · 红灯禁区:每 3 回合红灯暴怒,本回合攻击 +50% */
  122: {
    name: "红灯暴怒",
    desc: "每 3 回合红灯暴怒:本回合攻击 +50%",
    onEnemyActStart: (run) => {
      run.bossVars.turn = (run.bossVars.turn || 0) + 1;
      if (run.bossVars.turn % 3 === 0) run.bossVars.red = 1;
    },
    atkMult: (run) => (run.bossVars.red ? 1.5 : 1),
    onEnemyActEnd: (run) => {
      run.bossVars.red = 0;
    },
  },

  /* 6 章 · 迷途雾境:每 4 回合雾隐 1 回合,闪避你的攻击;被远光眩目破除 */
  123: {
    name: "雾隐闪避",
    desc: "每 4 回合雾隐 1 回合:闪避攻击,被远光眩目破除",
    onPlayerTurnStart: (run) => {
      run.bossVars.turn = (run.bossVars.turn || 0) + 1;
      run.bossVars.dodge = run.bossVars.turn % 4 === 0 ? 1 : 0;
    },
    dodgeActive: (run) =>
      !!run.bossVars.dodge &&
      (!run.enemyStatus || run.enemyStatus.type !== "confuse"),
  },

  /* 7 章 · 残骸废墟:HP≤40% 狂暴,攻击 +50% 且每回合回复 3% */
  124: {
    name: "残骸狂暴",
    desc: "HP≤40% 狂暴:攻击 +50%,每回合回复 3% HP",
    atkMult: (run) =>
      run.enemyHp > 0 && run.enemyHp <= run.enemyMaxHp * 0.4 ? 1.5 : 1,
    onEnemyActEnd: (run) => {
      if (run.enemyHp > 0 && run.enemyHp <= run.enemyMaxHp * 0.4) {
        run.enemyHp = Math.min(
          run.enemyMaxHp,
          run.enemyHp + Math.floor(run.enemyMaxHp * 0.03),
        );
      }
    },
  },

  /* 9 章 · 幽灵堵城(最终 Boss):每 2 回合车流淤积,+15 格挡且本回合攻击 +25% */
  125: {
    name: "车流淤积",
    desc: "每 2 回合车流淤积:+15 格挡,本回合攻击 +25%",
    onEnemyActStart: (run) => {
      run.bossVars.turn = (run.bossVars.turn || 0) + 1;
      if (run.bossVars.turn % 2 === 0) {
        run.bossVars.jam = 1;
        run.enemyBlock += 15;
      }
    },
    atkMult: (run) => (run.bossVars.jam ? 1.25 : 1),
    onEnemyActEnd: (run) => {
      run.bossVars.jam = 0;
    },
  },
};

export function getBossMechanic(bossId: number): BossMechanic | null {
  return M[bossId] ?? null;
}

/** 敌方是否闪避玩家攻击(Boss 雾隐,被眩目破除) */
export function bossDodgeActive(run: RunState): boolean {
  if (!run.enemyPkm) return false;
  const mech = M[run.enemyPkm.id];
  return !!mech?.dodgeActive?.(run);
}
