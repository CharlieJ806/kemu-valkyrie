/* 角色技能系统(对战/剧情共用)。
 * 数据源:data/valkyries.json 的 skills[].kind === "passive" 为被动技能,
 * 主动技能(必杀大招)沿用 ult 字段。本模块提供与引擎解耦的取值钩子:
 * PvE(battle.ts)与 PvP(pvp.ts)在各自的结算点调用,保证两模式表现一致。 */

import { getValkById, type ValkSkill, type Valkyrie } from "@/data";
import type { CardDef } from "./types";

/** 取角色的被动技能(无则 null) */
export function getPassive(v: Valkyrie | null | undefined): ValkSkill | null {
  return v?.skills?.find((s) => s.kind === "passive") ?? null;
}

export function getPassiveById(id: number): ValkSkill | null {
  return getPassive(getValkById(id));
}

/** 连击倍率额外加成(每层;基础 0.15 之上追加) */
export function skillComboBonus(v: Valkyrie | null | undefined): number {
  return getPassive(v)?.fx.comboBonus ?? 0;
}

/** 攻击牌(带 dmg 的牌)伤害加成 */
export function skillCardAtkBonus(
  v: Valkyrie | null | undefined,
  card?: Pick<CardDef, "type" | "fx"> | null,
): number {
  const p = getPassive(v);
  const b = p?.fx.cardAtkBonus;
  if (!b) return 0;
  // 仅对攻击型(带伤害)的牌生效
  if (card && card.type !== "atk" && !card.fx?.dmg) return 0;
  return b;
}

/** 出牌阶段开始时的额外资源(能量/抽牌) */
export function skillCardPhaseBonus(
  v: Valkyrie | null | undefined,
): { energy: number; draw: number } {
  const p = getPassive(v);
  return {
    energy: p?.fx.cardPhaseEnergy ?? 0,
    draw: p?.fx.cardPhaseDraw ?? 0,
  };
}

/** 受击固定减免(至少造成 1 点) */
export function skillHurtReduce(v: Valkyrie | null | undefined): number {
  return getPassive(v)?.fx.hurtReduce ?? 0;
}

/** 答对回复 */
export function skillAnswerHeal(v: Valkyrie | null | undefined): number {
  return getPassive(v)?.fx.answerHeal ?? 0;
}

/** 答对施加异常的概率(眩目/冻结,均 1 回合) */
export function skillAnswerStatusChance(
  v: Valkyrie | null | undefined,
): { confuse: number; freeze: number } {
  const p = getPassive(v);
  return {
    confuse: p?.fx.answerConfuseChance ?? 0,
    freeze: p?.fx.answerFreezeChance ?? 0,
  };
}

/** 对决/战斗首回合伤害倍率(仅一场的首个自己回合生效) */
export function skillFirstTurnMult(v: Valkyrie | null | undefined): number | null {
  return getPassive(v)?.fx.firstTurnMult ?? null;
}
