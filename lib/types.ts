import type { Rarity, Pokemon, Question } from "@/data";

export type { Rarity, Pokemon, Question };

/* ============ 卡牌系统 ============ */

export type CardType = "atk" | "def" | "heal" | "control" | "status";

export type StatusType =
  | "burn"
  | "para"
  | "poison"
  | "sleep"
  | "freeze"
  | "confuse";

export type CardFx = {
  dmg?: number;
  hits?: number;
  pierce?: number; // 0-1 无视格挡比例
  ignoreBlock?: boolean;
  block?: number;
  selfBlock?: number; // 可为负(自损格挡)
  selfDmg?: number; // 自身直接伤害(无视格挡)
  healFlat?: number;
  healPct?: number;
  lifesteal?: number; // 造成伤害的回复比例
  energy?: number;
  mult?: number; // 本回合伤害倍率
  defMult?: number; // 本回合受伤倍率
  enemyWeak?: number; // 敌方伤害削减
  status?: StatusType;
  statusChance?: number;
  statusTurns?: number;
  draw?: number;
};

export type CardDef = {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  icon: string;
  desc: string;
  rarity: Rarity;
  cat: string;
  power: number;
  fx: CardFx;
};

export type Card = CardDef & { _played?: boolean };

/* ============ 精灵球 ============ */

export type BallKey = "normal" | "great" | "ultra" | "beast" | "master";

export type BallDef = {
  id: BallKey;
  name: string;
  icon: string;
  price: number;
  rates: Record<Rarity, number>;
  desc: string;
};

/* ============ 地图 ============ */

export type NodeType =
  | "battle"
  | "elite"
  | "shop"
  | "rest"
  | "event"
  | "treasure"
  | "boss";

export type MapNode = {
  id: string;
  type: NodeType;
  col: number;
  row: number;
  enemyPkm: Pokemon | null;
  visited: boolean;
  reachable: boolean;
  rewards: { gold: number; cardChoices: number };
};

export type EnemyIntent = { damage: number; type: "attack" };

export type EnemyStatus = { type: StatusType; turns: number };

/* ============ Meta(跨局,持久化到 dungeonDrive_meta) ============ */

export type MetaState = {
  // ── 旧字段(与本地版同名,保证老存档可读) ──
  bestScore: number;
  bestFloor: number;
  totalRuns: number;
  collected: Record<string, boolean>;
  team: number[];
  pokeBalls: Record<BallKey, number>;
  soundEnabled: boolean;
  metaGold: number;
  metaHpLv: number;
  metaAtkLv: number;
  ownedCards: Record<string, boolean> | null;
  builtDeckIds: string[] | null;
  // ── 新字段(缺省填充) ──
  wrongQ: Record<string, number>;
  totalCorrect: number;
  totalAnswered: number;
  maxComboEver: number;
};

/* ============ Run(单局,持久化到 dungeonDrive_save) ============ */

export type RunState = {
  hp: number;
  maxHp: number;
  gold: number;
  score: number;
  floor: number;
  deck: string[]; // 卡 id
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  energy: number;
  block: number;
  combo: number;
  maxCombo: number;
  totalCorrect: number;
  totalAnswered: number;
  inBattle: boolean;
  mapNodes: MapNode[][];
  currentNodeIdx: number;
  team: number[]; // 上阵宝可梦 id(开局快照)
  teamHp: number[]; // 每只当前 HP(与 team 下标对应)
  teamMaxHp: number[]; // 每只最大 HP
  activeIdx: number; // 当前出战下标
  pokeBalls: Record<BallKey, number>;
  gameOver: boolean;
  runWon: boolean;
  visitedNodes: string[];
  questionHistory: string[];
  captureBonus: number;

  // ── 战斗现场(仅在 inBattle 时有意义) ──
  enemyPkm: Pokemon | null;
  enemyHp: number;
  enemyMaxHp: number;
  enemyBlock: number;
  enemyBaseDamage: number;
  enemyCaptureRate: number;
  enemyIntent: EnemyIntent | null;
  enemyStatus: EnemyStatus | null;
  enemyAtkMult: number;
  playerDmgMult: number;
  playerDefMult: number;
  currentQ: Question | null;
  questionAnswered: boolean;
  cardPlayedThisTurn: boolean;
  turnPhase: "question" | "card";
  turnCorrect: number;
};

/* ============ 屏幕 ============ */

export type ScreenId =
  | "title"
  | "starter"
  | "map"
  | "battle"
  | "shop"
  | "rest"
  | "dex"
  | "bank"
  | "train"
  | "gacha"
  | "deckbuild"
  | "settings"
  | "study"
  | "exam"
  | "wrong"
  | "over";

/* ============ UI 状态 ============ */

export type ToastState = { message: string; ms: number; id: number } | null;

export type ModalState =
  | { kind: "capture" }
  | { kind: "reward"; nodeType: NodeType }
  | { kind: "event"; eventId: string }
  | { kind: "confirm"; title: string; message: string; okText: string; cancelText: string }
  | { kind: "pkmDetail"; id: number }
  | null;

/* ============ 考试 ============ */

export type ExamSession = {
  qs: Question[];
  idx: number;
  picked: (number | null)[];
  marked: boolean[];
  timeLeft: number;
  done: boolean;
};

export type GameOverInfo = {
  win: boolean;
  floor: number;
  score: number;
  isRecord: boolean;
  correct: number;
  answered: number;
  maxCombo: number;
  caught: number;
};
