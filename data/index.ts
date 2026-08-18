import valkyriesData from "./valkyries.json";
import storyData from "./story.json";
import questionsData from "./questions.json";
import questionCatsData from "./question_cats.json";
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

/** 角色技能效果字段(被动技能专属,与卡牌 CardFxLike 互补) */
export type SkillFx = {
  /** 连击倍率额外加成:每层连击在基础 0.15 上追加(如 0.05 → 每层 0.20) */
  comboBonus?: number;
  /** 答对时回复的固定生命 */
  answerHeal?: number;
  /** 答对时使敌方「远光眩目」1 回合的概率 0-1 */
  answerConfuseChance?: number;
  /** 答对时使敌方「冻结车流」1 回合的概率 0-1 */
  answerFreezeChance?: number;
  /** 每回合进入出牌阶段时额外获得的指令(能量) */
  cardPhaseEnergy?: number;
  /** 每回合进入出牌阶段时额外抽的牌数 */
  cardPhaseDraw?: number;
  /** 攻击牌(带 dmg 的牌)伤害加成 */
  cardAtkBonus?: number;
  /** 受到伤害时的固定减免(至少造成 1 点) */
  hurtReduce?: number;
  /** 每场对决/每场战斗首回合伤害倍率 */
  firstTurnMult?: number;
};

/** 角色技能:被动(常驻触发)/主动(必杀大招) */
export type ValkSkill = {
  id: string;
  name: string;
  kind: "passive" | "active";
  desc: string;
  fx: SkillFx;
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
  /** 章节 Boss(固定出现在章节末节点,不进入普通魔物池) */
  boss?: boolean;
  /** 角色技能(学员拥有;魔物无技能) */
  skills?: ValkSkill[];
};


export type Question = {
  id: string;
  q: string;
  opts: string[];
  ans: number;
};



const VD = valkyriesData as { valkyries: Valkyrie[]; monsters: Valkyrie[] };

/** 玩家可收集的女武神(学员池) */
export const VALKYRIES = VD.valkyries;
/** 违章魔物(敌方池) */
export const MONSTERS = VD.monsters;
export const QUESTIONS = questionsData as Question[];
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

/* ============ 剧情/关卡 ============ */

export type StoryLine = { speaker: "narrator" | number; text: string; cg?: string };

export type ChapterDef = {
  id: number;
  name: string;
  bossId: number;
  unlockId: number | null;
  cg: string;
  intro: StoryLine[];
  outro: StoryLine[];
};

export type StoryData = {
  prologue: StoryLine[];
  prologueCg: string;
  chapters: ChapterDef[];
  loopOutro: StoryLine[];
};


export const STORY = storyData as StoryData;

/** 常规魔物池(不含章节 Boss) */
export const REGULAR_MONSTERS = VD.monsters.filter((m) => !m.boss);
/** Boss 池(117-120) */
export const BOSSES = VD.monsters.filter((m) => !!m.boss);

export function getChapterById(id: number): ChapterDef | null {
  return STORY.chapters.find((c) => c.id === id) ?? null;
}

export function getBossById(id: number): Valkyrie | null {
  return BOSSES.find((b) => b.id === id) ?? null;
}

export {
  TIER1_LEGEND,
  TIER2_LEGEND,
  MYTHICAL_PKMN,
  DEFAULT_VALKYRIES_ID,
  SPAWN_INTERVAL,
  SPAWN_MAX,
  MAX_UPGRADE_LEVEL,
  BANK_PAGE_SIZE,
  MAX_MONSTERS,
} from "./constants";
