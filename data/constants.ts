/** Game constants derived from assets/constants.ts + ref/pokedriver GAME_CONST */

type Rarity = "c" | "u" | "r" | "l";
type BallKey = "normal" | "great" | "ultra" | "beast" | "master";

export const TIER1_LEGEND = new Set([
  150, 249, 250, 382, 383, 384, 483, 484, 487, 493, 643, 644, 646, 716, 717, 718,
]);

export const TIER2_LEGEND = new Set([
  144, 145, 146, 243, 244, 245, 377, 378, 379, 380, 381, 480, 481, 482, 485, 486,
  488, 638, 639, 640, 641, 642, 645,
]);

export const MYTHICAL_PKMN = new Set([
  151, 251, 385, 386, 489, 490, 491, 492, 494, 647, 648, 649, 719, 720, 721,
]);

export const DEFAULT_POKEMON_ID = 25; // Pikachu
export const SPAWN_INTERVAL = 3800;
export const SPAWN_MAX = 5;
export const MAX_UPGRADE_LEVEL = 10;
export const BANK_PAGE_SIZE = 30;
export const MAX_MONSTERS = 6;

/* ============ 卡牌版游戏常量(迁移自 standalone game.js) ============ */

export const FLOORS_PER_RUN = Infinity;
export const NODES_PER_FLOOR = 7;
export const STARTING_HP = 80;
export const STARTING_GOLD = 0;
export const MAX_ENERGY = 3;
export const MAX_TEAM_SIZE = 3;
export const DECK_MAX = 12;
export const HAND_DRAW = 5;
export const GACHA_COST = 50;
export const UPGRADE_BASE_COST = 5;
export const UPGRADE_COST_STEP = 2;
export const HP_PER_LEVEL = 3;
export const ATK_PER_LEVEL = 1;

export const RARITY_COLORS: Record<Rarity, string> = {
  c: "#90a4ae",
  u: "#00e5ff",
  r: "#ff9100",
  l: "#ffd740",
};

export const RARITY_NAMES: Record<Rarity, string> = {
  c: "普通",
  u: "稀有",
  r: "超稀有",
  l: "传说",
};

export const RARITY_CAPTURE: Record<Rarity, number> = {
  c: 0.7,
  u: 0.45,
  r: 0.25,
  l: 0.08,
};

export const RARITY_HP_MULT: Record<Rarity, number> = {
  c: 0.7,
  u: 1.0,
  r: 1.5,
  l: 3.0,
};

export const RARITY_DMG_MULT: Record<Rarity, number> = {
  c: 0.7,
  u: 1.0,
  r: 1.4,
  l: 2.2,
};

/** Poke Ball types with exact capture rates per rarity [c, u, r, l] */
export const POKE_BALLS: Record<BallKey, {
  id: BallKey;
  name: string;
  icon: string;
  price: number;
  rates: Record<Rarity, number>;
  desc: string;
}> = {
  normal: { id: "normal", name: "精灵球", icon: "🔴", price: 30, rates: { c: 0.3, u: 0.2, r: 0.1, l: 0.01 }, desc: "基础捕获" },
  great: { id: "great", name: "超级球", icon: "🔵", price: 75, rates: { c: 0.5, u: 0.3, r: 0.2, l: 0.05 }, desc: "较好捕获" },
  ultra: { id: "ultra", name: "高级球", icon: "🟡", price: 150, rates: { c: 0.6, u: 0.4, r: 0.3, l: 0.08 }, desc: "强力捕获" },
  beast: { id: "beast", name: "究极球", icon: "🟣", price: 300, rates: { c: 0.7, u: 0.5, r: 0.4, l: 0.1 }, desc: "究极捕获" },
  master: { id: "master", name: "大师球", icon: "⭐", price: 1000, rates: { c: 1.0, u: 1.0, r: 1.0, l: 1.0 }, desc: "100%必定捕获！" },
};

/* ============ 考试常量(线上版 scr-exam) ============ */

export const EXAM_QUESTION_COUNT = 100;
export const EXAM_TIME_MS = 45 * 60 * 1000; // 45 分钟
export const EXAM_PASS_LINE = 90; // 90 分合格

/** Aggregated export matching ref/pokedriver window.GAME_CONST shape */
export const GAME_CONST = {
  TIER1_LEGEND: Array.from(TIER1_LEGEND),
  TIER2_LEGEND: Array.from(TIER2_LEGEND),
  MYTHICAL: Array.from(MYTHICAL_PKMN),
  MAX_LEVEL: MAX_UPGRADE_LEVEL,
  MAX_TEAM: MAX_MONSTERS,
  DEFAULT_POKEMON_ID,
  SPAWN_INTERVAL,
  SPAWN_MAX,
  BANK_PAGE_SIZE,
} as const;
