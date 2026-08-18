import {
  MONSTERS,
  VALKYRIES,
  VALKYRIES_BY_ID,
  isValkyrie,
  type Valkyrie,
  type Rarity,
} from "@/data";
import { RARITY_CAPTURE, RARITY_DMG_MULT, RARITY_HP_MULT, RARITY_NAMES } from "@/data/constants";
import type { NodeType } from "./types";

/* ============ 通用工具(兼容参考工程同名函数) ============ */

export const RARITY_LABEL = RARITY_NAMES;
export const RARITY_CSS: Record<Rarity, string> = {
  c: "tag-c",
  u: "tag-u",
  r: "tag-r",
  l: "tag-l",
};

export const VALK_BY_ID: Record<number, Valkyrie> = {};
for (const p of [...VALKYRIES, ...MONSTERS]) {
  VALK_BY_ID[p.id] = p;
}

export function rand(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function randFloat(a: number, b: number): number {
  return Math.random() * (b - a) + a;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============ 学员查询(迁移自 standalone game.js) ============ */

export function getValkById(id: number): Valkyrie | null {
  return VALK_BY_ID[id] ?? null;
}

export function getValkName(id: number): string {
  return VALK_BY_ID[id]?.c ?? "???";
}

/** 种族值等效(直接读角色数据;缺失回退 300) */
export function getBST(id: number): number {
  const v = VALKYRIES_BY_ID[id];
  return typeof v?.bst === "number" ? v.bst : 300;
}

const TIER1 = new Set<number>([]);
const TIER2 = new Set<number>([]);
const MYTHICAL = new Set<number>([]);

export function isTier1Legend(id: number): boolean {
  return TIER1.has(id);
}
export function isTier2Legend(id: number): boolean {
  return TIER2.has(id);
}
export function isMythical(id: number): boolean {
  return MYTHICAL.has(id);
}

/** 敌方数值(迁移自 standalone getEnemyStats) */
export function getEnemyStats(
  pkm: Valkyrie,
  floor: number,
): {
  hp: number;
  dmg: number;
  captureRate: number;
  isBoss: boolean;
} {
  const bst = getBST(pkm.id);
  const rarity = pkm.r || "c";
  const hpMult = RARITY_HP_MULT[rarity] || 1;
  const f = Math.max(1, floor || 1);
  const floorScale = 1 + (f - 1) * 0.12; // F1=1.0, F5≈1.48, F10≈2.08
  const baseHp = 20 + (bst / 720) * 80;
  const hp = Math.floor(baseHp * hpMult * floorScale);
  const dmg = Math.floor(
    (5 + ((bst / 720) * 15 * (RARITY_DMG_MULT[rarity] || 1))) * floorScale,
  );
  const captureRate = RARITY_CAPTURE[rarity] || 0.5;
  if (TIER1.has(pkm.id)) {
    return { hp: Math.floor(hp * 3), dmg: Math.floor(dmg * 2.5), captureRate: 0.02, isBoss: true };
  }
  if (TIER2.has(pkm.id)) {
    return { hp: Math.floor(hp * 2), dmg: Math.floor(dmg * 1.8), captureRate: 0.05, isBoss: true };
  }
  if (MYTHICAL.has(pkm.id)) {
    return { hp: Math.floor(hp * 2.5), dmg: Math.floor(dmg * 2), captureRate: 0.03, isBoss: true };
  }
  return { hp, dmg, captureRate, isBoss: false };
}

/** 按稀有度权重随机违章魔物(敌方池;迁移自 getRandomEnemy) */
export function getRandomEnemy(
  rarityWeights: Partial<Record<Rarity, number>> | null = null,
): Valkyrie {
  const defaults: Record<Rarity, number> = { c: 60, u: 25, r: 10, l: 5 };
  const weights = { ...defaults, ...(rarityWeights || {}) };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [rarity, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) {
      const pool = MONSTERS.filter((p) => p.r === rarity);
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]!;
    }
  }
  return MONSTERS[Math.floor(Math.random() * MONSTERS.length)]!;
}

/** 随机一名女武神学员(标题飘动/展示用) */
export function getRandomValkyrie(): Valkyrie {
  return VALKYRIES[Math.floor(Math.random() * VALKYRIES.length)]!;
}

/* ============ 养成数值(迁移自 standalone battle.js) ============ */

export const STARTING_HP = 80;
export const HP_PER_LEVEL = 3;
export const ATK_PER_LEVEL = 1;
export const UPGRADE_BASE_COST = 5;
export const UPGRADE_COST_STEP = 2;

export function getPlayerAtk(metaAtkLv: number): number {
  return 1 + (metaAtkLv || 0) * ATK_PER_LEVEL;
}

/**
 * 学员定位(强度平衡·按策划分配):
 * 速攻(赤红/刹/深夜)= 高攻低血;均衡(蔚蓝/晴岚/藏青)= 中攻中血;坦克(白银/格瑞)= 低攻高血。
 * 定位决定 PvE 面板(HP 80/100/120、攻击 4/3/2),同一强度预算,强度差异主要由技能与板块提供。
 * 养成等级仍生效(HP +3/级、攻击 +0.5/级),但只作用于 PvE,不进对战。
 */
export type ValkRole = "atk" | "bal" | "tank";

export const VALKYRIE_ROLE: Record<number, ValkRole> = {
  1: "atk", // 赤红
  2: "bal", // 蔚蓝
  3: "tank", // 白银
  4: "atk", // 深夜
  5: "bal", // 藏青
  6: "tank", // 格瑞
  7: "bal", // 晴岚
  8: "atk", // 刹
};

export const VALKYRIE_ROLE_NAMES: Record<ValkRole, string> = {
  atk: "速攻",
  bal: "均衡",
  tank: "坦克",
};

export function getValkRole(id: number): ValkRole {
  return VALKYRIE_ROLE[id] ?? "bal";
}

/** 定位 → PvE 面板(攻/血基准,养成在其上叠加) */
const ROLE_PVE_STATS: Record<ValkRole, { hp: number; atk: number }> = {
  atk: { hp: 80, atk: 4 },
  bal: { hp: 100, atk: 3 },
  tank: { hp: 120, atk: 2 },
};

export function getValkAtk(valkId: number, metaAtkLv: number): number {
  const v = getValkById(valkId);
  const lv = metaAtkLv || 0;
  if (!v || !isValkyrie(valkId)) return 3 + Math.floor(lv / 2);
  return ROLE_PVE_STATS[getValkRole(valkId)].atk + Math.floor(lv / 2);
}

export function getMaxHpFromMeta(metaHpLv: number): number {
  return STARTING_HP + (metaHpLv || 0) * HP_PER_LEVEL;
}

/** 学员最大 HP(按定位):速攻 80 / 均衡 100 / 坦克 120,养成等级 +3/级 */
export function getValkMaxHp(valkId: number, metaHpLv: number): number {
  const v = getValkById(valkId);
  if (!v || !isValkyrie(valkId)) return getMaxHpFromMeta(metaHpLv);
  return getMaxHpFromMeta(metaHpLv) + (ROLE_PVE_STATS[getValkRole(valkId)].hp - 80);
}

export function upgradeCost(level: number): number {
  return UPGRADE_BASE_COST + level * UPGRADE_COST_STEP;
}

/* ============ 抽卡权重(迁移自 screens.js rarityWeight) ============ */

export function rarityWeight(r: Rarity): number {
  return r === "c" ? 50 : r === "u" ? 28 : r === "r" ? 16 : 6;
}

/* ============ 节点(迁移自 standalone game.js) ============ */

export const NODE_ICONS: Record<NodeType, string> = {
  battle: "/art/ui/item-sword.webp",
  elite: "/art/ui/item-star.webp",
  shop: "/art/ui/item-coin.webp",
  rest: "/art/ui/item-campfire.webp",
  event: "/art/ui/item-book.webp",
  treasure: "/art/ui/item-trophy.webp",
  boss: "/art/ui/item-skull.webp",
};

export const NODE_NAMES: Record<NodeType, string> = {
  battle: "战斗",
  elite: "强敌",
  shop: "补给点",
  rest: "咖啡厅",
  event: "异变",
  treasure: "置物柜",
  boss: "违章魔王",
};

export const NODE_DESC: Record<NodeType, string> = {
  battle: "击败违章魔物，获得金币与卡牌奖励",
  elite: "精英魔物，更强但奖励更丰厚",
  shop: "花费金币购买或移除卡牌",
  rest: "恢复生命，或特训获得养成金币（每处限一次）",
  event: "触发随机事件，有收益也有风险",
  treasure: "直接获得金币与卡牌",
  boss: "击败本章魔王即可通关",
};

export function enemyPoolForNode(type: NodeType): Partial<Record<Rarity, number>> {
  if (type === "boss") return { c: 20, u: 30, r: 30, l: 20 };
  if (type === "elite") return { c: 30, u: 35, r: 25, l: 10 };
  return { c: 60, u: 25, r: 12, l: 3 };
}

export function generateRewardsFor(type: NodeType): {
  gold: number;
  cardChoices: number;
} {
  switch (type) {
    case "battle":
      return { gold: rand(15, 30), cardChoices: 1 };
    case "elite":
      return { gold: rand(30, 50), cardChoices: 2 };
    case "boss":
      return { gold: rand(50, 100), cardChoices: 3 };
    case "treasure":
      return { gold: rand(25, 45), cardChoices: 1 };
    default:
      return { gold: rand(10, 20), cardChoices: 1 };
  }
}
