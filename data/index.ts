import valkyriesData from "./valkyries.json";
import questionsData from "./questions.json";
import questionCatsData from "./question_cats.json";
import gameRulesData from "./game_rules.json";
import { GAME_CONST } from "./constants";

export type Rarity = "c" | "u" | "r" | "l";

/** 科目一四大板块(卡牌属性/角色主修) */
export type AttrKey = "law" | "signal" | "safety" | "civility";

export type ValkyrieLook = {
  hair: "long" | "short" | "twin" | "bob" | "ponytail";
  hairColor: string;
  eyeColor: string;
  skin: string;
  outfit: string;
  /** 违章魔物:立绘加暗色滤镜+红瞳 */
  dark?: boolean;
};

export type CardFxLike = {
  dmg?: number;
  hits?: number;
  pierce?: number;
  ignoreBlock?: boolean;
  block?: number;
  selfBlock?: number;
  selfDmg?: number;
  healFlat?: number;
  healPct?: number;
  lifesteal?: number;
  energy?: number;
  mult?: number;
  defMult?: number;
  enemyWeak?: number;
  status?: string;
  statusChance?: number;
  statusTurns?: number;
  draw?: number;
};

/** 女武神(学员)/违章魔物 共用结构 */
export type Valkyrie = {
  id: number;
  n: string;
  c: string;
  r: Rarity;
  i: number;
  attr: AttrKey;
  attr2: AttrKey;
  hp: number;
  atk: number;
  bst: number;
  look: ValkyrieLook;
  ult: { name: string; desc: string; fx: CardFxLike };
  flavor: string;
};

/** 兼容别名(旧代码大量引用 Pokemon,Phase 6 统一换名) */
export type Pokemon = Valkyrie;

export type Question = {
  id: string;
  q: string;
  opts: string[];
  ans: number;
};

export type GameRules = {
  rarity_labels: Record<Rarity, string>;
  rarity_colors: Record<Rarity, string>;
  hp_formula: string;
  rarity_hp_mult: Record<Rarity, number>;
  speed_base: string;
  rarity_speed_mult: Record<Rarity, number>;
  icon_fallback_colors: string[];
};

const VD = valkyriesData as { valkyries: Valkyrie[]; monsters: Valkyrie[] };

/** 玩家可收集的女武神(旧名 POKEMON,Phase 6 换名) */
export const POKEMON = VD.valkyries;
/** 违章魔物(敌方池) */
export const MONSTERS = VD.monsters;
export const QUESTIONS = questionsData as Question[];
export const GAME_RULES = gameRulesData as GameRules;
export { GAME_CONST };

/** 题库板块分类索引(scripts/classify-questions.mjs 生成) */
export const QUESTION_CATS = questionCatsData as Record<
  string,
  { cat: AttrKey; manual?: boolean }
>;

export function getQuestionCat(id: string): AttrKey | null {
  return QUESTION_CATS[id]?.cat ?? null;
}

export const VALKYRIES_BY_ID: Record<number, Valkyrie> = {};
for (const v of [...VD.valkyries, ...VD.monsters]) {
  VALKYRIES_BY_ID[v.id] = v;
}

export function getValkById(id: number): Valkyrie | null {
  return VALKYRIES_BY_ID[id] ?? null;
}

/** 是否玩家学员(而非魔物) */
export function isValkyrie(id: number): boolean {
  return id >= 1 && id < 100;
}

export {
  TIER1_LEGEND,
  TIER2_LEGEND,
  MYTHICAL_PKMN,
  DEFAULT_POKEMON_ID,
  SPAWN_INTERVAL,
  SPAWN_MAX,
  MAX_UPGRADE_LEVEL,
  BANK_PAGE_SIZE,
  MAX_MONSTERS,
} from "./constants";
