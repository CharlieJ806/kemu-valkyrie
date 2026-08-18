import type { Rarity, Valkyrie, Question, AttrKey } from "@/data";

export type { Rarity, Valkyrie, Question, AttrKey };

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
  /** 科目一四大板块:打该板块牌 → 队伍中该板块学员联动行动 */
  attr: AttrKey;
  power: number;
  fx: CardFx;
};

export type Card = CardDef & { _played?: boolean };

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
  enemyPkm: Valkyrie | null;
  visited: boolean;
  reachable: boolean;
  rewards: { gold: number; cardChoices: number };
};

export type EnemyIntentType = "attack" | "guard" | "multi" | "charge";

export type EnemyIntent = {
  damage: number;
  type: EnemyIntentType;
  /** guard 意图的格挡量 */
  block?: number;
};

export type EnemyStatus = { type: StatusType; turns: number };

/* ============ Meta(跨局,持久化到 dungeonDrive_meta) ============ */

export type MetaState = {
  // ── 旧字段(与本地版同名,保证老存档可读) ──
  bestScore: number;
  bestFloor: number;
  totalRuns: number;
  collected: Record<string, boolean>;
  team: number[];
  soundEnabled: boolean;
  metaGold: number;
  metaHpLv: number;
  metaAtkLv: number;
  ownedCards: Record<string, boolean> | null;
  builtDeckIds: string[] | null;
  /** 对战「各自牌组」模式使用的出战牌组(备战区编辑;缺省回退 builtDeckIds) */
  pvpDeckIds: string[] | null;
  // ── 新字段(缺省填充) ──
  wrongQ: Record<string, number>;
  totalCorrect: number;
  totalAnswered: number;
  maxComboEver: number;
  /** 剧情进度:已通关章节数(0-4)。已解锁学员 id ≤ storyCleared+1 */
  storyCleared: number;
  /** 已遭遇的魔物 id 集(图鉴用,跨局) */
  seenMonsters: Record<string, boolean>;
  /** 已收服(净化)的魔物 id 集(图鉴用,跨局) */
  caughtMonsters: Record<string, boolean>;
  /** 已解锁成就 id 集 */
  achievements: Record<string, boolean>;
  /** BGM 音量 0-1 */
  bgmVol: number;
  /** 音效音量 0-1 */
  sfxVol: number;
};

/* ============ Run(单局,持久化到 dungeonDrive_save) ============ */

export type RunState = {
  hp: number;
  maxHp: number;
  gold: number;
  score: number;
  /** 有效深度 = (loop-1)*4+chapter,驱动敌方数值公式 */
  floor: number;
  /** 当前章节 1-4 */
  chapter: number;
  /** 周目数(从 1 开始) */
  loop: number;
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
  team: number[]; // 上阵学员 id(开局快照)
  teamHp: number[]; // 每只当前 HP(与 team 下标对应)
  teamMaxHp: number[]; // 每只最大 HP
  activeIdx: number; // 当前出战下标
  gameOver: boolean;
  runWon: boolean;
  visitedNodes: string[];
  questionHistory: string[];
  /** 咖啡厅(rest)本节点是否已使用过休息/特训(每处休息点限一次) */
  restUsed: boolean;
  // ── 点火觉醒/领队(单局字段,不跨局) ──
  leaderId: number | null; // 领队(点火觉醒学员,每局最多 1 名)
  awakened: Record<number, AttrKey>; // 本局觉醒名单 valkId → 第二板块
  ultGauge: number; // 领队大招槽 0..ultMax(每出一张牌+1)
  ultMax: number; // 大招槽上限(=9)

  // ── 战斗现场(仅在 inBattle 时有意义) ──
  bossPhase: number; // 最终 Boss 战斗阶段(1 常态 / 2 暴走二阶段)
  enemyPkm: Valkyrie | null;
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
  /** 敌方减伤剩余回合(0 = 无减益;回合结束递减,归零时 enemyAtkMult 恢复 1) */
  enemyWeakTurns: number;
  /** 敌方蓄力倍率(charge 意图设定,下次攻击结算后归 1) */
  enemyChargeMul: number;
  /** 精英词缀列表 */
  enemyAffix: string[];
  /** 词缀·迅捷:本场额外攻击是否已消耗 */
  affixSwiftDone: boolean;
  /** 词缀·复苏:是否已复活过 */
  affixRevived: boolean;
  /** Boss 专属机制运行时变量(每场战斗重置) */
  bossVars: Record<string, number>;
  /** 本题答题时限(毫秒;默认 15000,迷雾 Boss 缩短为 10000) */
  qTimeLimit: number;
  /** 本章是否受过伤(成就·无伤传说用) */
  chapterDamaged: boolean;
  currentQ: Question | null;
  questionAnswered: boolean;
  cardPlayedThisTurn: boolean;
  turnPhase: "question" | "card";
  turnCorrect: number;
};

/* ============ 屏幕 ============ */

export type ScreenId =
  | "title"
  | "story"
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
  | "achievements"
  | "pvp"
  | "over";

/* ============ UI 状态 ============ */

export type ToastState = { message: string; ms: number; id: number } | null;

export type ModalState =
  | { kind: "reward"; nodeType: NodeType }
  | { kind: "event"; eventId: string }
  | { kind: "confirm"; title: string; message: string; okText: string; cancelText: string }
  | { kind: "pkmDetail"; id: number }
  | { kind: "removeCard" }
  | null;

/* ============ 考试 ============ */

export type ExamSession = {
  qs: Question[];
  idx: number;
  picked: (number | null)[];
  marked: boolean[];
  timeLeft: number;
  done: boolean;
  /** 实时得分:100 起,每答错一题 -1 */
  score: number;
  /** 分数跌破合格线(89)提前终止 */
  failed: boolean;
};

export type GameOverInfo = {
  win: boolean;
  floor: number;
  chapter: number;
  loop: number;
  score: number;
  isRecord: boolean;
  correct: number;
  answered: number;
  maxCombo: number;
  caught: number;
};

/** 剧情对白条目(StoryScreen 队列) */
export type StoryLine = { speaker: "narrator" | number; text: string; cg?: string };
