/** Clean public API for game logic + store (no React components). */

export * from "./types";
export {
  RARITY_LABEL,
  RARITY_CSS,
  VALK_BY_ID,
  rand,
  pick,
  clamp,
  shuffle,
  getValkById,
  getValkName,
  getBST,
  getEnemyStats,
  getRandomEnemy,
  getPlayerAtk,
  getMaxHpFromMeta,
  upgradeCost,
  rarityWeight,
  NODE_ICONS,
  NODE_NAMES,
  enemyPoolForNode,
  generateRewardsFor,
} from "./formulas";

export {
  generateMapNodes,
  renderMap,
  hitTest,
  applyNodeSelection,
} from "./map";

export {
  ALL_CARDS,
  STARTER_CARD_IDS,
  CARD_CAT_NAMES,
  findCard,
  hydrateCard,
  hydrateCardList,
  cardFromIdList,
  applyCardFx,
} from "./cards";

export {
  shuffleDeck,
  drawCardsInto,
  dealEnemyDamage,
  damagePlayer,
  startTurn,
  enterCardPhase,
  endTurn,
  playCardOn,
  answerBattle,
  startBattleOn,
  pickBattleQuestion,
} from "./battle";

export { GAME_EVENTS } from "./events";
export {
  EXAM_CONST,
  buildExamSession,
  gradeExam,
  isExamPass,
} from "./exam";
export { resolveQuestionPool, parseImportedQuestions } from "./questions";
export {
  META_KEY,
  RUN_KEY,
  IMPORTED_KEY,
  loadMeta,
  saveMeta,
  loadRun,
  saveRun,
  hasRun,
} from "./save";

export {
  useGameStore,
} from "./store";

export type { AnswerResult } from "./store";

export { ICON } from "./icon";
export { AudioEngine } from "./audio";
export { BattleFX } from "./fx3d";
export { spawnDmg, spawnFxText, domBurst } from "./dom-fx";
