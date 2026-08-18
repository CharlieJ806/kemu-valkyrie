"use client";

import { create } from "zustand";
import {
  QUESTIONS,
  STORY,
  VALKYRIES,
  getChapterById,
  type Question,
  type StoryLine,
} from "@/data";
import {
  DECK_MAX,
  DEFAULT_VALKYRIES_ID,
  GACHA_COST,
  MAX_TEAM_SIZE,
  MAX_UPGRADE_LEVEL,
  STARTING_GOLD,
  CAPTURE_ELITE_MULT,
  CAPTURE_REWARD,
  BATTLE_Q_TIME_MS,
} from "@/data/constants";
import {
  answerBattle,
  endTurn,
  enterCardPhase as enterCardPhaseOn,
  playCardOn,
  pickBattleQuestion as pickQuestion,
  saveActiveFromHp,
  startBattleOn,
  switchActiveTo,
  switchToNextAlive,
  timeoutBattle,
  type EndTurnResult,
} from "./battle";
import { AudioEngine } from "./audio";
import { checkAchievements } from "./achievements";
import { applyNodeSelection, generateMapNodes } from "./map";
import {
  ALL_CARDS,
  findCard,
  STARTER_CARD_IDS,
  ULT_GAUGE_MAX,
  type CardFxEvent,
} from "./cards";
import {
  getMaxHpFromMeta,
  getValkMaxHp,
  getValkName,
  rarityWeight,
  upgradeCost,
} from "./formulas";
import {
  defaultMeta,
  exportSave as exportSaveToCode,
  hasRun,
  importSave as importSaveFromCode,
  loadImportedQuestions,
  loadMeta,
  loadRun,
  saveImportedQuestions,
  saveMeta as persistMeta,
  saveRun as persistRun,
  wipeAll as wipeStorage,
} from "./save";
import type {
  GameOverInfo,
  MapNode,
  MetaState,
  ModalState,
  RunState,
  ScreenId,
  ToastState,
} from "./types";
import { GAME_EVENTS } from "./events";

/** 剧情对白队列(screen=story 时播放) */
export type StoryQueue = StoryLine[];

/** 章节总数(第 9 章为最终 Boss 战) */
export const TOTAL_CHAPTERS = STORY.chapters.length;
/** 最终 Boss:拥堵车流幽灵(两阶段) */
export const FINAL_BOSS_ID = STORY.chapters[TOTAL_CHAPTERS - 1]!.bossId;

/** 已解锁学员 id 集(剧情解锁:初始赤红 + 每通一章解锁一名;id 顺序即解锁顺序) */
export function unlockedIds(storyCleared: number): number[] {
  const n = Math.min(VALKYRIES.length, Math.max(1, storyCleared + 1));
  return VALKYRIES.slice(0, n).map((v) => v.id);
}

/** 新开局牌组:构建列表过滤已拥有,不足 5 张用基础技补齐 */
function deckFromBuilt(meta: MetaState): string[] {
  let ids = (meta.builtDeckIds || []).filter((id) => meta.ownedCards?.[id]);
  if (ids.length === 0) ids = [...STARTER_CARD_IDS];
  while (ids.length < 5) {
    for (const sid of STARTER_CARD_IDS) {
      if (ids.length >= 5) break;
      ids.push(sid);
    }
  }
  return ids;
}

function ensureMetaDefaults(meta: MetaState): void {
  if (typeof meta.metaGold !== "number") meta.metaGold = 0;
  if (typeof meta.metaHpLv !== "number") meta.metaHpLv = 0;
  if (typeof meta.metaAtkLv !== "number") meta.metaAtkLv = 0;
  if (!meta.ownedCards || typeof meta.ownedCards !== "object") {
    meta.ownedCards = {};
  }
  STARTER_CARD_IDS.forEach((id) => {
    meta.ownedCards![id] = true;
  });
  if (!Array.isArray(meta.builtDeckIds) || meta.builtDeckIds.length === 0) {
    meta.builtDeckIds = [...STARTER_CARD_IDS];
  }
  if (!Array.isArray(meta.pvpDeckIds) || meta.pvpDeckIds.length === 0) {
    meta.pvpDeckIds = [...(meta.builtDeckIds || STARTER_CARD_IDS)];
  }
}

export type AnswerResult = {
  id: number; // 单调递增,UI 去重(StrictMode/连键)
  pickedIdx: number;
  correct: boolean;
  combo: number;
  dmg: number;
  counterDmg: number;
  enemyDead: boolean;
  playerDead: boolean;
  revived: boolean;
  timedOut?: boolean;
};

/** 最近一次出牌结果(ephemeral,UI 据此播放联动/必杀反馈) */
export type PlayEvent = {
  id: number; // 单调递增,UI 去重
  cardId: string;
  events: CardFxEvent[];
};

type GameStore = {
  meta: MetaState;
  run: RunState | null;
  screen: ScreenId;
  prevScreen: ScreenId | null;
  toast: ToastState;
  modal: ModalState;
  gameOver: GameOverInfo | null;
  questionPool: Question[];
  hydrated: boolean;
  activeEventId: string | null;
  gachaLastId: string | null;
  /** 剧情对白队列(非空时屏幕应为 story) */
  storyQueue: StoryQueue | null;
  /** 最近一次答题结果(ephemeral,UI 据此播放反馈/调度下一题,键盘鼠标统一) */
  lastAnswer: AnswerResult | null;
  /** 最近一次出牌事件(ephemeral,UI 据此播放板块联动/必杀反馈) */
  lastPlay: PlayEvent | null;

  /* ---- 持久化 ---- */
  hydrate: () => void;
  saveMeta: () => void;
  saveRun: () => void;

  /* ---- UI 壳 ---- */
  setScreen: (id: ScreenId) => void;
  showToast: (message: string, ms?: number) => void;
  clearToast: () => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;

  /* ---- 剧情 ---- */
  storyAdvance: () => void;
  storySkip: () => void;

  /* ---- meta 类 ---- */
  toggleSound: () => void;
  setBgmVol: (v: number) => void;
  setSfxVol: (v: number) => void;
  tryUpgradeHp: () => void;
  tryUpgradeAtk: () => void;
  /* 名册队伍编辑(meta.team,下次开局生效) */
  addToTeam: (id: number) => void;
  removeFromTeam: (id: number) => void;
  setActiveTeam: (id: number) => void;
  doGachaOnce: () => void;
  toggleDeckCard: (id: string) => void;
  resetBuiltDeck: () => void;
  /** 对战备战:保存自定义出战牌组(5-12 张,持久化) */
  setPvpDeck: (ids: string[]) => void;
  bumpWrongQ: (qid: string, n?: number) => void;
  clearWrongQ: (qid: string) => void;
  recordExamResult: (score: number, wrongIds: string[], correctIds?: string[]) => void;
  importQuestions: (qs: Question[]) => void;
  exportSaveCode: () => string | null;
  importSaveCode: (code: string) => string | null;
  wipeAll: () => void;
  /** 成就判定 + 发放奖励(meta 为克隆对象,直接修改并持久化) */
  awardFor: (
    meta: MetaState,
    run: RunState | null,
    extra?: Parameters<typeof checkAchievements>[2],
  ) => void;

  /* ---- 开局 ---- */
  newRun: (starterId?: number) => void;
  continueRun: () => boolean;
  quitToTitle: () => void;
  hasSave: () => boolean;

  /* ---- 地图 ---- */
  selectNode: (col: number, node: MapNode) => void;

  /* ---- 商店 / 咖啡厅 / 事件 / 置物柜 ---- */
  openShop: () => void;
  leaveShop: () => void;
  buyShopCard: (cardId: string, price: number) => void;
  removeDeckCard: () => void;
  confirmRemoveCard: (cardId: string) => void;
  openRest: () => void;
  restHeal: () => void;
  restTrain: () => void;
  leaveRest: () => void;
  openEvent: () => void;
  doEventChoice: (i: number) => void;
  openTreasure: () => void;

  /* ---- 战斗 ---- */
  startBattle: (node: MapNode, isBoss?: boolean) => void;
  switchPoke: (idx: number) => void;
  answer: (idx: number) => AnswerResult | null;
  timeoutQuestion: () => AnswerResult | null;
  nextBattleQuestion: () => void;
  enterCardPhase: () => void;
  playCard: (idx: number) => void;
  endTurnAction: () => EndTurnResult | null;
  endBattle: (won: boolean) => void;
  clearChapter: () => void;
  chooseRewardCard: (cardId: string) => void;
  skipReward: () => void;
  gameOverDefeat: () => void;
  showOverScreen: () => void;
};

function cloneMeta(meta: MetaState): MetaState {
  return JSON.parse(JSON.stringify(meta)) as MetaState;
}

function cloneRun(run: RunState): RunState {
  return JSON.parse(JSON.stringify(run)) as RunState;
}

export const useGameStore = create<GameStore>((set, get) => ({
  meta: defaultMeta(),
  run: null,
  screen: "title",
  prevScreen: null,
  toast: null,
  modal: null,
  gameOver: null,
  questionPool: [],
  hydrated: false,
  activeEventId: null,
  gachaLastId: null,
  storyQueue: null,
  lastAnswer: null,
  lastPlay: null,

  /* ---- 持久化 ---- */

  hydrate: () => {
    if (get().hydrated) return;
    const meta = loadMeta();
    ensureMetaDefaults(meta);
    const imported = getImportedQuestions();
    set({
      meta,
      questionPool: imported ? imported : [...QUESTIONS],
      hydrated: true,
    });
    persistMeta(meta);
  },

  saveMeta: () => {
    persistMeta(get().meta);
  },

  saveRun: () => {
    persistRun(get().run);
  },

  /* ---- UI 壳 ---- */

  setScreen: (id) => {
    set((s) => ({ prevScreen: s.screen, screen: id }));
  },

  showToast: (message, ms = 1800) => {
    set({ toast: { message, ms, id: Date.now() } });
  },

  clearToast: () => set({ toast: null }),

  openModal: (modal) => set({ modal }),

  closeModal: () => set({ modal: null }),

  /* ---- 剧情对白 ---- */

  storyAdvance: () => {
    const queue = get().storyQueue;
    if (!queue || queue.length === 0) return;
    const next = queue.slice(1);
    set({ storyQueue: next.length > 0 ? next : null });
    if (next.length === 0) {
      // 对白播完 → 回地图
      set({ screen: "map", prevScreen: get().screen });
    }
  },

  storySkip: () => {
    set({ storyQueue: null, screen: "map", prevScreen: get().screen });
  },

  /* ---- meta 类 ---- */

  toggleSound: () => {
    const meta = cloneMeta(get().meta);
    meta.soundEnabled = !meta.soundEnabled;
    set({ meta });
    persistMeta(meta);
  },

  setBgmVol: (v) => {
    const meta = cloneMeta(get().meta);
    meta.bgmVol = Math.max(0, Math.min(1, v));
    set({ meta });
    persistMeta(meta);
    AudioEngine.setBgmVol(meta.bgmVol);
  },

  setSfxVol: (v) => {
    const meta = cloneMeta(get().meta);
    meta.sfxVol = Math.max(0, Math.min(1, v));
    set({ meta });
    persistMeta(meta);
    AudioEngine.setSfxVol(meta.sfxVol);
  },

  tryUpgradeHp: () => {
    const meta = cloneMeta(get().meta);
    ensureMetaDefaults(meta);
    if (meta.metaHpLv >= MAX_UPGRADE_LEVEL) {
      get().showToast(`生命已达最高等级(${MAX_UPGRADE_LEVEL})`, 1500);
      return;
    }
    const cost = upgradeCost(meta.metaHpLv);
    if (meta.metaGold < cost) {
      get().showToast("养成金币不足！", 1500);
      return;
    }
    meta.metaGold -= cost;
    meta.metaHpLv += 1;
    set({ meta });
    persistMeta(meta);
    // 若在冒险中,全队同步提升上限并回一点血
    const run0 = get().run;
    if (run0 && !run0.gameOver && run0.maxHp) {
      const run = cloneRun(run0);
      run.teamMaxHp = run.team.map((id) => getValkMaxHp(id, meta.metaHpLv));
      run.teamHp = run.teamHp.map((h, i) =>
        Math.min(run.teamMaxHp[i] ?? h, h + 3),
      );
      run.maxHp = run.teamMaxHp[run.activeIdx] ?? run.maxHp;
      run.hp = run.teamHp[run.activeIdx] ?? run.hp;
      set({ run });
      persistRun(run);
    }
    get().showToast("生命升级！+3 最大HP", 1800);
  },

  tryUpgradeAtk: () => {
    const meta = cloneMeta(get().meta);
    ensureMetaDefaults(meta);
    if (meta.metaAtkLv >= MAX_UPGRADE_LEVEL) {
      get().showToast(`攻击已达最高等级(${MAX_UPGRADE_LEVEL})`, 1500);
      return;
    }
    const cost = upgradeCost(meta.metaAtkLv);
    if (meta.metaGold < cost) {
      get().showToast("养成金币不足！", 1500);
      return;
    }
    meta.metaGold -= cost;
    meta.metaAtkLv += 1;
    set({ meta });
    persistMeta(meta);
    get().showToast("攻击升级！+1 攻击", 1800);
  },

  /* ---- 名册队伍编辑(meta.team,下次开局生效;照搬 standalone showPkmDetail) ---- */

  addToTeam: (id) => {
    const meta = cloneMeta(get().meta);
    if (meta.team.includes(id)) return;
    if (meta.team.length >= MAX_TEAM_SIZE) {
      get().showToast(`队伍已满(${MAX_TEAM_SIZE}名),请先移出其他学员`, 1800);
      return;
    }
    meta.team.push(id);
    set({ meta });
    persistMeta(meta);
    get().showToast(`${getValkName(id)} 加入队伍!`, 1500);
  },

  removeFromTeam: (id) => {
    const meta = cloneMeta(get().meta);
    if (!meta.team.includes(id)) return;
    meta.team = meta.team.filter((x) => x !== id);
    set({ meta });
    persistMeta(meta);
    get().showToast(`${getValkName(id)} 已移出队伍`, 1500);
  },

  setActiveTeam: (id) => {
    const meta = cloneMeta(get().meta);
    if (meta.team[0] === id) return;
    meta.team = [id, ...meta.team.filter((x) => x !== id)];
    set({ meta });
    persistMeta(meta);
    get().showToast(`${getValkName(id)} 设为出战!`, 1500);
  },

  doGachaOnce: () => {
    const meta = cloneMeta(get().meta);
    ensureMetaDefaults(meta);
    if (meta.metaGold < GACHA_COST) {
      get().showToast("养成金币不足！", 1500);
      return;
    }
    const pool = ALL_CARDS.filter((c) => !meta.ownedCards![c.id]);
    if (pool.length === 0) {
      get().showToast("已集齐全部技能！", 1800);
      return;
    }
    // 加权抽取(迁移自 screens.js doGachaOnce)
    const totalW = pool.reduce((a, c) => a + rarityWeight(c.rarity), 0);
    let r = Math.random() * totalW;
    let pick = pool[0]!;
    for (const c of pool) {
      r -= rarityWeight(c.rarity);
      if (r <= 0) {
        pick = c;
        break;
      }
    }
    meta.metaGold -= GACHA_COST;
    meta.ownedCards![pick.id] = true;
    set({ meta, gachaLastId: pick.id });
    persistMeta(meta);
    get().awardFor(meta, get().run, {});
  },

  /** 成就判定 + 发放奖励(内部辅助:meta 已克隆,直接修改并 toast 新解锁) */
  awardFor: (meta, run, extra) => {
    const unlocked = checkAchievements(meta, run, extra);
    if (unlocked.length > 0) {
      const names = unlocked.map((a) => a.name).join("、");
      const total = unlocked.reduce((s, a) => s + a.reward, 0);
      get().showToast(`🏅 成就达成:${names} (+${total} 金币)`, 2800);
      AudioEngine.sfx("levelup");
      set({ meta });
      persistMeta(meta);
    }
  },

  toggleDeckCard: (id) => {
    const meta = cloneMeta(get().meta);
    ensureMetaDefaults(meta);
    const ids = [...(meta.builtDeckIds || [])];
    const idx = ids.indexOf(id);
    if (idx >= 0) {
      ids.splice(idx, 1);
    } else {
      if (ids.length >= DECK_MAX) {
        get().showToast(`牌组已满（${DECK_MAX}）`, 1500);
        return;
      }
      ids.push(id);
    }
    meta.builtDeckIds = ids;
    set({ meta });
    persistMeta(meta);
  },

  resetBuiltDeck: () => {
    const meta = cloneMeta(get().meta);
    meta.builtDeckIds = [...STARTER_CARD_IDS];
    set({ meta });
    persistMeta(meta);
    get().showToast("已重置为初始五张基础技", 1800);
  },

  setPvpDeck: (ids) => {
    const meta = cloneMeta(get().meta);
    meta.pvpDeckIds = ids.slice(0, DECK_MAX);
    set({ meta });
    persistMeta(meta);
  },

  bumpWrongQ: (qid, n = 1) => {
    const meta = cloneMeta(get().meta);
    meta.wrongQ[qid] = (meta.wrongQ[qid] || 0) + n;
    set({ meta });
    persistMeta(meta);
  },

  clearWrongQ: (qid) => {
    const meta = cloneMeta(get().meta);
    if (meta.wrongQ[qid]) {
      delete meta.wrongQ[qid];
      set({ meta });
      persistMeta(meta);
    }
  },

  /** 考试交卷:错题答错只增、答对移出(统一「答对即移出」规则),totalAnswered += 100 */
  recordExamResult: (score, wrongIds, correctIds = []) => {
    const meta = cloneMeta(get().meta);
    meta.totalAnswered += 100;
    meta.totalCorrect += score;
    for (const id of wrongIds) {
      meta.wrongQ[id] = (meta.wrongQ[id] || 0) + 1;
    }
    for (const id of correctIds) {
      if (meta.wrongQ[id]) delete meta.wrongQ[id];
    }
    set({ meta });
    persistMeta(meta);
    get().awardFor(meta, get().run, { examScore: score });
  },

  importQuestions: (qs) => {
    set({ questionPool: qs });
    saveImportedQuestions(qs);
    get().showToast(`成功导入 ${qs.length} 道题！`, 2000);
  },

  exportSaveCode: () => exportSaveToCode(),

  importSaveCode: (code) => {
    const err = importSaveFromCode(code);
    if (err) {
      get().showToast(`导入失败:${err}`, 2200);
      return err;
    }
    // 重新读取并注入状态
    const meta = loadMeta();
    ensureMetaDefaults(meta);
    const imported = getImportedQuestions();
    const run = loadRun();
    set({
      meta,
      run,
      questionPool: imported ? imported : [...QUESTIONS],
      screen: "title",
      prevScreen: get().screen,
      gameOver: null,
      modal: null,
    });
    persistMeta(meta);
    if (run) persistRun(run);
    get().showToast("✅ 存档导入成功!", 2200);
    AudioEngine.sfx("caught");
    return null;
  },

  wipeAll: () => {
    wipeStorage();
    set({
      meta: defaultMeta(),
      run: null,
      gameOver: null,
      modal: null,
      questionPool: [...QUESTIONS],
    });
    get().showToast("所有数据已重置", 1500);
  },

  /* ---- 开局 ---- */

  /**
   * 新开一局。starterId 可选:
   * - 传入(首次初始选择):标记收集并置为队首;
   * - 不传(非首次「新的冒险」):直接使用名册配置的队伍 meta.team。
   */
  newRun: (starterId?: number) => {
    const meta = cloneMeta(get().meta);
    ensureMetaDefaults(meta);
    meta.totalRuns++;
    // 剧情解锁:已解锁学员 = 赤红 + 已通关章节解锁的角色
    const unlocked = unlockedIds(meta.storyCleared);
    for (const id of unlocked) {
      meta.collected = { ...meta.collected, [String(id)]: true };
    }

    // 开局队伍:名册队伍 ∩ 已解锁(不足补其余已解锁者,上限 MAX_TEAM_SIZE)
    const team = [
      ...(meta.team || []).filter((id) => unlocked.includes(id)),
      ...unlocked.filter((id) => !(meta.team || []).includes(id)),
    ].slice(0, MAX_TEAM_SIZE);
    if (team.length === 0) team.push(DEFAULT_VALKYRIES_ID); // 兜底
    meta.team = [...team];

    const teamMaxHp = team.map((id) => getValkMaxHp(id, meta.metaHpLv));
    const teamHp = [...teamMaxHp];
    const chapter = 1;
    const loop = 1;
    const floor = (loop - 1) * TOTAL_CHAPTERS + chapter;
    const ch = getChapterById(chapter)!;
    const mapNodes = generateMapNodes(floor, ch.bossId);
    if (mapNodes[0].length > 0) mapNodes[0][0]!.reachable = true;

    const run: RunState = {
      hp: teamMaxHp[0] ?? getMaxHpFromMeta(meta.metaHpLv),
      maxHp: teamMaxHp[0] ?? getMaxHpFromMeta(meta.metaHpLv),
      gold: STARTING_GOLD,
      score: 0,
      floor,
      chapter,
      loop,
      deck: deckFromBuilt(meta),
      hand: [],
      drawPile: [],
      discardPile: [],
      energy: 0,
      block: 0,
      combo: 0,
      maxCombo: 0,
      totalCorrect: 0,
      totalAnswered: 0,
      inBattle: false,
      mapNodes,
      currentNodeIdx: -1,
      team,
      teamHp,
      teamMaxHp,
      activeIdx: 0,
      gameOver: false,
      runWon: false,
      visitedNodes: [],
      questionHistory: [],
      restUsed: false,
      enemyPkm: null,
      enemyHp: 0,
      enemyMaxHp: 0,
      enemyBlock: 0,
      enemyBaseDamage: 8,
      enemyCaptureRate: 0.5,
      enemyIntent: null,
      enemyStatus: null,
      enemyAtkMult: 1,
      playerDmgMult: 1,
      playerDefMult: 1,
      enemyWeakTurns: 0,
      enemyChargeMul: 1,
      enemyAffix: [],
      affixSwiftDone: false,
      affixRevived: false,
      bossVars: {},
      qTimeLimit: BATTLE_Q_TIME_MS,
      chapterDamaged: false,
      currentQ: null,
      questionAnswered: false,
      cardPlayedThisTurn: false,
      turnPhase: "question",
      turnCorrect: 0,
      bossPhase: 1,
      leaderId: null,
      awakened: {},
      ultGauge: 0,
      ultMax: ULT_GAUGE_MAX,
    };

    const queue = storyQueueWith(
      meta.storyCleared === 0 ? STORY.prologue : [],
      run,
      STORY.prologueCg,
    );

    set({
      meta,
      run,
      gameOver: null,
      modal: null,
      storyQueue: queue,
      screen: queue ? "story" : "map",
      prevScreen: get().screen,
    });
    persistMeta(meta);
    persistRun(run);
    get().showToast(
      `第 ${run.chapter} 章 · 第 ${run.loop} 周目 — 队伍: ${team.map((id) => getValkName(id)).join(" / ")}`,
      2400,
    );
  },

  continueRun: () => {
    const save = loadRun();
    if (!save) return false;
    const meta = loadMeta();
    ensureMetaDefaults(meta);
    set({
      run: save,
      meta,
      screen: save.inBattle ? "battle" : "map",
      prevScreen: get().screen,
      gameOver: null,
      modal: null,
    });
    persistMeta(meta);
    persistRun(save); // loadRun 已净化旧档(非法角色 id),立即回写清掉脏 blob
    get().showToast("继续冒险！", 1800);
    return true;
  },

  quitToTitle: () => {
    persistRun(get().run);
    set({
      screen: "title",
      prevScreen: get().screen,
      modal: null,
    });
    get().showToast("进度已保存", 1500);
  },

  hasSave: () => hasRun(),

  /* ---- 地图 ---- */

  selectNode: (col, node) => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    applyNodeSelection(run.mapNodes, col, node);
    run.currentNodeIdx = col;
    set({ run });
    persistRun(run);

    switch (node.type) {
      case "battle":
      case "elite":
        get().startBattle(node);
        break;
      case "boss":
        get().startBattle(node, true);
        break;
      case "shop":
        get().openShop();
        break;
      case "rest":
        get().openRest();
        break;
      case "treasure":
        get().openTreasure();
        break;
      case "event":
        get().openEvent();
        break;
    }
  },

  /* ---- 商店 / 营地 / 事件 / 宝箱 ---- */

  openShop: () => {
    set({ screen: "shop", prevScreen: get().screen });
  },

  leaveShop: () => {
    set({ screen: "map", prevScreen: get().screen });
    persistRun(get().run);
  },

  buyShopCard: (cardId, price) => {
    const run0 = get().run;
    if (!run0) return;
    if (run0.gold < price) {
      get().showToast("金币不足！", 1200);
      return;
    }
    const run = cloneRun(run0);
    run.gold -= price;
    run.deck.push(cardId);
    set({ run });
    persistRun(run);
    get().showToast(`购买: ${findCard(cardId)?.name ?? cardId}`, 1500);
  },

  /** 打开「移除一张牌」选择模态(校验金币/牌数后由 Modal 自选) */
  removeDeckCard: () => {
    const run0 = get().run;
    if (!run0) return;
    if (run0.gold < 75) {
      get().showToast("金币不足！", 1500);
      return;
    }
    if (run0.deck.length <= 5) {
      get().showToast("牌组至少保留5张！", 1500);
      return;
    }
    set({ modal: { kind: "removeCard" } });
  },

  confirmRemoveCard: (cardId) => {
    const run0 = get().run;
    if (!run0) return;
    if (run0.gold < 75) {
      get().showToast("金币不足！", 1500);
      return;
    }
    if (run0.deck.length <= 5) {
      get().showToast("牌组至少保留5张！", 1500);
      return;
    }
    const run = cloneRun(run0);
    run.gold -= 75;
    run.deck.splice(run.deck.indexOf(cardId), 1);
    run.drawPile = run.drawPile.filter((id) => id !== cardId);
    run.discardPile = run.discardPile.filter((id) => id !== cardId);
    run.hand = run.hand.filter((id) => id !== cardId);
    set({ run, modal: null });
    persistRun(run);
    get().showToast(`移除: ${findCard(cardId)?.name ?? cardId}`, 1500);
  },

  openRest: () => {
    const run0 = get().run;
    if (run0) {
      const run = cloneRun(run0);
      run.restUsed = false; // 每次进入休息点重置,本节点限一次
      set({ run, screen: "rest", prevScreen: get().screen });
      persistRun(run);
    } else {
      set({ screen: "rest", prevScreen: get().screen });
    }
  },

  restHeal: () => {
    const run0 = get().run;
    if (!run0) return;
    if (run0.restUsed) {
      get().showToast("本咖啡厅已使用过，无法再次休息", 1500);
      return;
    }
    const run = cloneRun(run0);
    run.restUsed = true;
    // 全队恢复 30%
    run.teamHp = run.teamHp.map((h, i) =>
      Math.min(run.teamMaxHp[i] ?? h, h + Math.floor((run.teamMaxHp[i] ?? h) * 0.3)),
    );
    run.hp = run.teamHp[run.activeIdx] ?? run.hp;
    set({ run });
    persistRun(run);
    get().showToast("全队回复了 30% HP！", 1800);
  },

  restTrain: () => {
    const run0 = get().run;
    if (!run0) return;
    if (run0.restUsed) {
      get().showToast("本咖啡厅已使用过，无法再次特训", 1500);
      return;
    }
    const run = cloneRun(run0);
    run.restUsed = true;
    // 全队恢复 15%
    run.teamHp = run.teamHp.map((h, i) =>
      Math.min(run.teamMaxHp[i] ?? h, h + Math.floor((run.teamMaxHp[i] ?? h) * 0.15)),
    );
    run.hp = run.teamHp[run.activeIdx] ?? run.hp;
    const meta = cloneMeta(get().meta);
    meta.metaGold += 3;
    set({ run, meta });
    persistRun(run);
    persistMeta(meta);
    get().showToast("特训完成！全队回复HP，养成金币+3", 1800);
  },

  leaveRest: () => {
    set({ screen: "map", prevScreen: get().screen });
  },

  openEvent: () => {
    const evt = GAME_EVENTS[Math.floor(Math.random() * GAME_EVENTS.length)]!;
    set({ modal: { kind: "event", eventId: evt.id }, activeEventId: evt.id });
  },

  doEventChoice: (i) => {
    const run0 = get().run;
    if (!run0) return;
    const id = get().activeEventId;
    const evt = id ? GAME_EVENTS.find((e) => e.id === id) : null;
    const choice = evt?.choices[i];
    if (!evt || !choice) {
      set({ modal: null, activeEventId: null });
      return;
    }
    const run = cloneRun(run0);
    const msg = choice.effect(run);
    // 事件扣血打倒当前学员:队伍有存活成员则自动换人继续
    if (run.hp <= 0 && run.team.length > 1 && switchToNextAlive(run)) {
      set({ run, modal: null, activeEventId: null });
      persistRun(run);
      if (msg) get().showToast(`${msg} · ${getValkName(run.team[run.activeIdx]!)} 顶了上来！`, 2000);
      return;
    }
    const dead = run.hp <= 0;
    set({ run, modal: null, activeEventId: null });
    persistRun(run);
    if (msg) get().showToast(msg, 1800);
    if (dead) get().gameOverDefeat();
  },

  openTreasure: () => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    const node = currentNode(run);
    const gold = node?.rewards.gold || 30;
    run.gold += gold;
    let cardMsg = "";
    if (node && node.rewards.cardChoices > 0) {
      const card = ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)]!;
      if (card.rarity !== "l" || Math.random() < 0.1) {
        run.deck.push(card.id);
        cardMsg = `获得卡片: ${card.name}`;
      }
    }
    set({ run });
    persistRun(run);
    get().showToast(
      cardMsg ? `🎁 获得 ${gold} 金币！ ${cardMsg}` : `🎁 获得 ${gold} 金币！`,
      2200,
    );
  },

  /* ---- 战斗 ---- */

  startBattle: (node, isBoss = false) => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    startBattleOn(run, node, isBoss, get().questionPool);
    // 图鉴:标记遭遇的魔物(跨局持久化)
    if (run.enemyPkm) {
      const meta = cloneMeta(get().meta);
      meta.seenMonsters = { ...meta.seenMonsters, [String(run.enemyPkm.id)]: true };
      set({ meta });
      persistMeta(meta);
    }
    set({
      run,
      screen: "battle",
      prevScreen: get().screen,
      modal: null,
      lastAnswer: null,
    });
    persistRun(run);
  },

  /** 战斗中手动切换出战学员 */
  switchPoke: (idx) => {
    const run0 = get().run;
    if (!run0 || !run0.inBattle) return;
    const run = cloneRun(run0);
    if (!switchActiveTo(run, idx)) {
      if ((run.teamHp[idx] || 0) <= 0) {
        get().showToast("该学员已倒下,无法出战", 1500);
      }
      return;
    }
    set({ run });
    persistRun(run);
    get().showToast(`${getValkName(run.team[idx]!)} 出战!`, 1200);
  },

  answer: (idx) => {
    const run0 = get().run;
    const meta0 = get().meta;
    if (!run0 || run0.turnPhase !== "question" || run0.questionAnswered) return null;
    const run = cloneRun(run0);
    const meta = cloneMeta(meta0);
    const q = run.currentQ;
    if (!q) return null;

    const res = answerBattle(run, idx, meta.metaAtkLv);
    if (!res) return null;

    // 错题本联动:答错 +1(只增),答对删除(线上版战斗行为)
    if (res.correct) {
      if (meta.wrongQ[q.id]) delete meta.wrongQ[q.id];
    } else {
      meta.wrongQ[q.id] = (meta.wrongQ[q.id] || 0) + 1;
    }
    if (run.maxCombo > meta.maxComboEver) meta.maxComboEver = run.maxCombo;

    const result: AnswerResult = {
      ...res,
      id: ++answerEventSeq,
      pickedIdx: idx,
    };
    set({ run, meta, lastAnswer: result });
    persistRun(run);
    persistMeta(meta);

    if (res.revived) {
      get().showToast("💚 复苏词缀:敌方残骸重新拼合!", 2000);
      AudioEngine.sfx("boss");
    }
    get().awardFor(meta, run, {});

    // 答题击杀敌人 → 结束战斗(答错不再反伤,无败北路径;保留守卫)
    if (res.enemyDead) {
      get().endBattle(true);
    } else if (res.playerDead) {
      get().gameOverDefeat();
    }
    return result;
  },

  /** 答题超时:按答错处理(连击清零 + 反伤 + 展示答案后进入出牌阶段) */
  timeoutQuestion: () => {
    const run0 = get().run;
    const meta0 = get().meta;
    if (!run0 || run0.turnPhase !== "question" || run0.questionAnswered) return null;
    const run = cloneRun(run0);
    const meta = cloneMeta(meta0);
    const res = timeoutBattle(run);
    if (!res) return null;
    const q = run.currentQ;
    if (q) meta.wrongQ[q.id] = (meta.wrongQ[q.id] || 0) + 1;
    const result: AnswerResult = {
      ...res,
      id: ++answerEventSeq,
      pickedIdx: -1,
    };
    set({ run, meta, lastAnswer: result });
    persistRun(run);
    persistMeta(meta);
    if (res.playerDead) get().gameOverDefeat();
    return result;
  },

  nextBattleQuestion: () => {
    const run0 = get().run;
    if (!run0 || run0.turnPhase !== "question") return;
    const run = cloneRun(run0);
    const q = pickQuestion(run, get().questionPool);
    if (!q) return;
    set({ run });
    persistRun(run);
  },

  enterCardPhase: () => {
    const run0 = get().run;
    if (!run0 || run0.turnPhase !== "question") return;
    const run = cloneRun(run0);
    enterCardPhaseOn(run);
    set({ run });
    persistRun(run);
  },

  playCard: (idx) => {
    const run0 = get().run;
    const meta0 = get().meta;
    if (!run0) return;
    const run = cloneRun(run0);
    const res = playCardOn(run, idx, meta0.metaAtkLv);
    if (!res) return;
    set({ run, lastPlay: { id: ++playEventSeq, cardId: res.cardId, events: res.events } });
    persistRun(run);

    if (res.events.some((e) => e.type === "revive")) {
      get().showToast("💚 复苏词缀:敌方残骸重新拼合!", 2000);
      AudioEngine.sfx("boss");
    }
    const tax = res.events.find((e) => e.type === "tax");
    if (tax && tax.type === "tax") {
      get().showToast(tax.message, 1800);
    }

    if (res.enemyDead) {
      get().endBattle(true);
    } else if (res.playerDead) {
      get().gameOverDefeat();
    }
  },

  endTurnAction: () => {
    const run0 = get().run;
    const meta0 = get().meta;
    if (!run0) return null;
    const run = cloneRun(run0);
    const res = endTurn(run, get().questionPool, meta0.metaAtkLv);
    set({ run });
    persistRun(run);

    if (res.revived) {
      get().showToast("💚 复苏词缀:敌方残骸重新拼合!", 2000);
      AudioEngine.sfx("boss");
    }

    if (res.enemyDead) {
      get().endBattle(true);
    } else if (res.playerDead) {
      get().gameOverDefeat();
    }
    return res;
  },

  endBattle: (won) => {
    const run0 = get().run;
    if (!run0) return;

    if (won) {
      const run = cloneRun(run0);
      saveActiveFromHp(run); // 出战学员血量回写(跨战斗保留)
      const node = currentNode(run);
      const meta = cloneMeta(get().meta);
      if (node && node.rewards) {
        const g = node.rewards.gold || 20;
        run.gold += g;
        meta.metaGold += g;
        run.score +=
          node.type === "boss" ? 100 : node.type === "elite" ? 50 : 20;
      }

      // 净化收服:击败普通/精英魔物后自动按概率判定(仅图鉴收集 + 奖励)
      if (
        node &&
        (node.type === "battle" || node.type === "elite") &&
        run.enemyPkm &&
        !run.enemyPkm.boss
      ) {
        const rate =
          run.enemyCaptureRate *
          (node.type === "elite" ? CAPTURE_ELITE_MULT : 1);
        if (Math.random() < rate) {
          const id = run.enemyPkm.id;
          const first = !meta.caughtMonsters[String(id)];
          meta.caughtMonsters = { ...meta.caughtMonsters, [String(id)]: true };
          if (first) {
            run.gold += CAPTURE_REWARD.gold;
            meta.metaGold += CAPTURE_REWARD.metaGold;
            get().showToast(
              `✨ 净化成功!${run.enemyPkm.c} 已收服(+${CAPTURE_REWARD.gold}金)`,
              2600,
            );
            AudioEngine.sfx("caught");
          } else {
            run.gold += CAPTURE_REWARD.dupGold;
            get().showToast(
              `已收服过 ${run.enemyPkm.c},+${CAPTURE_REWARD.dupGold}金币`,
              2000,
            );
            AudioEngine.sfx("coin");
          }
        }
      }

      set({ meta });
      persistMeta(meta);
      get().awardFor(meta, run, {
        battleWon: node?.type === "battle",
        caughtCount: Object.keys(meta.caughtMonsters).length,
      });

      // 击败 Boss:章节通关 → 解锁角色 → 下一章/下一周目
      if (node && node.type === "boss") {
        // 最终 Boss 第一形态击破 → 暴走二阶段(同场再战,敌方满血强化)
        if (
          node.enemyPkm &&
          node.enemyPkm.id === FINAL_BOSS_ID &&
          (run.bossPhase ?? 1) === 1
        ) {
          run.bossPhase = 2;
          startBattleOn(run, node, true, get().questionPool);
          run.enemyMaxHp = Math.floor(run.enemyMaxHp * 1.25);
          run.enemyHp = run.enemyMaxHp;
          run.enemyBaseDamage = Math.ceil(run.enemyBaseDamage * 1.2);
          set({ run });
          persistRun(run);
          get().showToast("💀 车河暴走！拥堵车流幽灵进入二阶段！", 2800);
          return;
        }
        get().clearChapter();
        const st = get();
        if (st.run && st.run.score > st.meta.bestScore) {
          st.showToast("🏆 新最高分！", 2000);
        }
        return;
      }

      run.inBattle = false;
      run.combo = 0;
      set({ run });
      persistRun(run);
      afterBattleRewards(get, set);
      const st = get();
      if (st.run && st.run.score > st.meta.bestScore) {
        st.showToast("🏆 新最高分！", 2000);
      }
    } else {
      get().gameOverDefeat();
    }
  },

  /** 章节通关:结算 → 解锁角色 → 全员回满血 → 下一章/下一周目 → 剧情对白 */
  clearChapter: () => {
    const run0 = get().run;
    const meta0 = get().meta;
    if (!run0) return;
    const run = cloneRun(run0);
    const meta = cloneMeta(meta0);
    const ch = getChapterById(run.chapter);

    run.inBattle = false;
    run.combo = 0;
    run.score += 50 + run.floor * 10;

    // 通关章节的收尾对白(章末结语),稍后拼接下一章开场
    const clearedOutro = storyQueueWith(ch?.outro ?? [], run, ch?.cg);
    if (ch) {
      // 剧情进度与角色解锁
      meta.storyCleared = Math.max(meta.storyCleared, ch.id);
      if (ch.unlockId != null) {
        meta.collected = { ...meta.collected, [String(ch.unlockId)]: true };
        const newbie = VALKYRIES.find((v) => v.id === ch.unlockId);
        if (newbie) {
          get().showToast(`🎉 ${newbie.c} 加入队伍！`, 2600);
          // 自动编入队伍(有空位时)
          if (!run.team.includes(newbie.id) && run.team.length < MAX_TEAM_SIZE) {
            run.team.push(newbie.id);
            const mhp = getValkMaxHp(newbie.id, meta.metaHpLv);
            run.teamMaxHp.push(mhp);
            run.teamHp.push(mhp);
          }
          if (!meta.team.includes(newbie.id)) meta.team.push(newbie.id);
        }
      }
      // 无解锁章节的纪念奖励(第 8 章:全角色集结)
      if (ch.unlockId == null && ch.id === TOTAL_CHAPTERS - 1) {
        const bonus = 3000;
        meta.metaGold += bonus;
        run.gold += bonus;
      }
    }

    // 下一章 / 下一周目
    const parts: StoryQueue = [];
    if (clearedOutro) parts.push(...clearedOutro);
    if (run.chapter < TOTAL_CHAPTERS) {
      run.chapter++;
    } else {
      run.loop++;
      run.chapter = 1;
      // 周目总结对白(复用序章 CG)
      const loop = storyQueueWith(STORY.loopOutro, run, STORY.prologueCg);
      if (loop) parts.push(...loop);
    }
    const nextCh = getChapterById(run.chapter);
    const intro = storyQueueWith(nextCh?.intro ?? [], run, nextCh?.cg);
    if (intro) parts.push(...intro);
    const queue: StoryQueue | null = parts.length > 0 ? parts : null;
    run.floor = (run.loop - 1) * TOTAL_CHAPTERS + run.chapter;
    run.mapNodes = generateMapNodes(run.floor, nextCh?.bossId);
    run.currentNodeIdx = -1;
    run.visitedNodes = [];
    if (run.mapNodes[0].length > 0) {
      run.mapNodes[0].forEach((n) => (n.reachable = true));
    }

    // 章节通关:全员回满血
    run.teamHp = [...run.teamMaxHp];
    saveActiveFromHp(run); // run.hp 同步为出战学员满血
    run.hp = run.teamMaxHp[run.activeIdx] ?? run.hp;
    run.maxHp = run.teamMaxHp[run.activeIdx] ?? run.maxHp;

    // 成就判定(通关/无伤/周目/集结)+ 重置本章受伤标记
    get().awardFor(meta, run, { chapterCleared: true });
    run.chapterDamaged = false;

    set({ run, meta, storyQueue: queue, screen: queue ? "story" : "map", modal: null });
    persistRun(run);
    persistMeta(meta);
    get().showToast(
      `🎉 第 ${ch?.name ?? run.chapter} 章通关！进入第 ${run.chapter} 章 · 第 ${run.loop} 周目`,
      2600,
    );
  },

  chooseRewardCard: (cardId) => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    run.deck.push(cardId);
    // 奖励来自战斗胜利:关闭模态并回到地图(否则 screen 停在 battle 导致空白)
    set({ run, modal: null, screen: "map", prevScreen: get().screen });
    persistRun(run);
    get().showToast(`获得卡片: ${findCard(cardId)?.name ?? cardId}`, 1800);
  },

  skipReward: () => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    run.gold += 25;
    set({ run, modal: null, screen: "map", prevScreen: get().screen });
    persistRun(run);
    get().showToast("跳过 (获得25金币)", 1500);
  },

  gameOverDefeat: () => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    const meta = cloneMeta(get().meta);
    saveActiveFromHp(run);
    run.gameOver = true;
    // 战败保留战场:由 BattleScreen 播放倒下动画后经 showOverScreen 收尾

    // 剩余金币入库养成
    if (run.gold > 0) {
      meta.metaGold += run.gold;
      get().showToast(`剩余 ${run.gold} 金已存入养成`, 2000);
    }

    // 最高分/最深进度
    const isRecord = run.score > meta.bestScore;
    if (isRecord) meta.bestScore = run.score;
    if (run.floor > meta.bestFloor) meta.bestFloor = run.floor;

    const info: GameOverInfo = {
      win: false,
      floor: run.floor,
      chapter: run.chapter,
      loop: run.loop,
      score: run.score,
      isRecord,
      correct: run.totalCorrect,
      answered: run.totalAnswered,
      maxCombo: run.maxCombo,
      caught: Object.keys(meta.collected).length,
    };

    set({
      run,
      meta,
      gameOver: info,
      modal: null,
    });
    persistRun(run);
    persistMeta(meta);
    get().awardFor(meta, run, {});
  },

  showOverScreen: () => {
    const run0 = get().run;
    if (run0) {
      const run = cloneRun(run0);
      run.inBattle = false;
      set({ run, screen: "over", prevScreen: get().screen });
      persistRun(run);
    } else {
      set({ screen: "over", prevScreen: get().screen });
    }
  },
}));

/* ============ 内部辅助 ============ */

/** 单调递增 id,供 UI 在 React StrictMode 下对 lastAnswer/lastPlay 做去重(参考工程同款) */
let answerEventSeq = 0;
let playEventSeq = 0;

function getImportedQuestions(): Question[] | null {
  return loadImportedQuestions<Question>();
}

function currentNode(run: RunState): MapNode | null {
  if (!run.mapNodes || run.mapNodes.length === 0) return null;
  const col = run.mapNodes[run.currentNodeIdx];
  if (!col) return null;
  return col.find((n) => n.visited) ?? null;
}

/** 对白队列:替换 {loop} 占位符;空数组返回 null。cg 为默认剧情 CG(行级可覆盖)。 */
function storyQueueWith(
  lines: StoryLine[],
  run: RunState,
  cg?: string,
): StoryQueue | null {
  if (!lines || lines.length === 0) return null;
  return lines.map((l) => ({
    speaker: l.speaker,
    text: l.text.replaceAll("{loop}", String(run.loop)),
    cg: l.cg ?? cg,
  }));
}

/** 战斗胜利后的收尾:奖励选卡弹窗或回地图(替代原净化流程) */
function afterBattleRewards(
  get: () => ReturnType<typeof useGameStore.getState>,
  set: (partial: Partial<ReturnType<typeof useGameStore.getState>>) => void,
): void {
  const run = get().run;
  const node = run ? currentNode(run) : null;
  if (
    node &&
    node.rewards &&
    node.rewards.cardChoices > 0 &&
    node.type !== "shop" &&
    node.type !== "rest"
  ) {
    set({ modal: { kind: "reward", nodeType: node.type } });
  } else {
    set({ screen: "map", prevScreen: get().screen });
  }
}
