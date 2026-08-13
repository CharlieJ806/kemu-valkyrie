"use client";

import { create } from "zustand";
import { QUESTIONS, type Question } from "@/data";
import {
  DECK_MAX,
  DEFAULT_POKEMON_ID,
  GACHA_COST,
  MAX_TEAM_SIZE,
  POKE_BALLS,
  STARTING_GOLD,
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
} from "./battle";
import { applyNodeSelection, generateMapNodes } from "./map";
import { ALL_CARDS, STARTER_CARD_IDS } from "./cards";
import {
  getMaxHpFromMeta,
  getPkmMaxHp,
  getPkmName,
  rarityWeight,
  upgradeCost,
} from "./formulas";
import {
  defaultMeta,
  hasRun,
  loadMeta,
  loadRun,
  saveImportedQuestions,
  saveMeta as persistMeta,
  saveRun as persistRun,
  wipeAll as wipeStorage,
} from "./save";
import type {
  BallKey,
  GameOverInfo,
  MapNode,
  MetaState,
  ModalState,
  RunState,
  ScreenId,
  ToastState,
} from "./types";
import { GAME_EVENTS } from "./events";

export type StarterDef = {
  id: number;
  desc: string;
};

export const STARTERS: StarterDef[] = [
  { id: 1, desc: "草系伙伴 · 稳扎稳打，HP 均衡" },
  { id: 4, desc: "火系伙伴 · 攻击手，答题越快越强" },
  { id: 7, desc: "水系伙伴 · 坚韧可靠，适合新手" },
];

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
  /** 3D 投球捕获动画进行中(期间战斗舞台保持渲染,canvas 不卸载) */
  captureAnimating: boolean;
  /** 最近一次答题结果(ephemeral,UI 据此播放反馈/调度下一题,键盘鼠标统一) */
  lastAnswer: AnswerResult | null;

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

  /* ---- meta 类 ---- */
  toggleSound: () => void;
  tryUpgradeHp: () => void;
  tryUpgradeAtk: () => void;
  /* 图鉴队伍编辑(meta.team,下次开局生效) */
  addToTeam: (id: number) => void;
  removeFromTeam: (id: number) => void;
  setActiveTeam: (id: number) => void;
  doGachaOnce: () => void;
  toggleDeckCard: (id: string) => void;
  resetBuiltDeck: () => void;
  bumpWrongQ: (qid: string, n?: number) => void;
  clearWrongQ: (qid: string) => void;
  recordExamResult: (score: number, wrongIds: string[]) => void;
  importQuestions: (qs: Question[]) => void;
  wipeAll: () => void;

  /* ---- 开局 ---- */
  newRun: (starterId?: number) => void;
  continueRun: () => boolean;
  quitToTitle: () => void;
  hasSave: () => boolean;

  /* ---- 地图 ---- */
  selectNode: (col: number, node: MapNode) => void;

  /* ---- 商店 / 营地 / 事件 / 宝箱 ---- */
  openShop: () => void;
  leaveShop: () => void;
  buyBall: (key: BallKey) => void;
  buyShopCard: (cardId: string, price: number) => void;
  removeDeckCard: () => void;
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
  nextBattleQuestion: () => void;
  enterCardPhase: () => void;
  playCard: (idx: number) => void;
  endTurnAction: () => void;
  endBattle: (won: boolean) => void;
  attemptCapture: (ball: BallKey) => { success: boolean; pkmId: number } | undefined;
  beginCaptureAnim: () => void;
  finishCapture: () => void;
  skipCapture: () => void;
  chooseRewardCard: (cardId: string) => void;
  skipReward: () => void;
  gameOverDefeat: () => void;
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
  captureAnimating: false,
  lastAnswer: null,

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

  /* ---- meta 类 ---- */

  toggleSound: () => {
    const meta = cloneMeta(get().meta);
    meta.soundEnabled = !meta.soundEnabled;
    set({ meta });
    persistMeta(meta);
  },

  tryUpgradeHp: () => {
    const meta = cloneMeta(get().meta);
    ensureMetaDefaults(meta);
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
      run.teamMaxHp = run.team.map((id) => getPkmMaxHp(id, meta.metaHpLv));
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

  /* ---- 图鉴队伍编辑(meta.team,下次开局生效;照搬 standalone showPkmDetail) ---- */

  addToTeam: (id) => {
    const meta = cloneMeta(get().meta);
    if (meta.team.includes(id)) return;
    if (meta.team.length >= MAX_TEAM_SIZE) {
      get().showToast(`队伍已满(${MAX_TEAM_SIZE}只),请先移出其他宝可梦`, 1800);
      return;
    }
    meta.team.push(id);
    set({ meta });
    persistMeta(meta);
    get().showToast(`${getPkmName(id)} 加入队伍!`, 1500);
  },

  removeFromTeam: (id) => {
    const meta = cloneMeta(get().meta);
    if (!meta.team.includes(id)) return;
    meta.team = meta.team.filter((x) => x !== id);
    set({ meta });
    persistMeta(meta);
    get().showToast(`${getPkmName(id)} 已移出队伍`, 1500);
  },

  setActiveTeam: (id) => {
    const meta = cloneMeta(get().meta);
    if (meta.team[0] === id) return;
    meta.team = [id, ...meta.team.filter((x) => x !== id)];
    set({ meta });
    persistMeta(meta);
    get().showToast(`${getPkmName(id)} 设为出战!`, 1500);
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

  /** 考试交卷:错题只增不删,totalAnswered += 100(线上版行为) */
  recordExamResult: (score, wrongIds) => {
    const meta = cloneMeta(get().meta);
    meta.totalAnswered += 100;
    meta.totalCorrect += score;
    for (const id of wrongIds) {
      meta.wrongQ[id] = (meta.wrongQ[id] || 0) + 1;
    }
    set({ meta });
    persistMeta(meta);
  },

  importQuestions: (qs) => {
    set({ questionPool: qs });
    saveImportedQuestions(qs);
    get().showToast(`成功导入 ${qs.length} 道题！`, 2000);
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
   * - 不传(非首次「新的冒险」):直接使用图鉴配置的队伍 meta.team。
   */
  newRun: (starterId?: number) => {
    const meta = cloneMeta(get().meta);
    ensureMetaDefaults(meta);
    meta.totalRuns++;
    if (starterId != null) {
      meta.collected = { ...meta.collected, [String(starterId)]: true };
    }

    // 开局队伍:所选御三家(如有)+ 图鉴配置的队伍(去重,上限 MAX_TEAM_SIZE)
    const team = [
      ...(starterId != null ? [starterId] : []),
      ...(meta.team || []).filter((id) => id !== starterId),
    ].slice(0, MAX_TEAM_SIZE);
    if (team.length === 0) team.push(DEFAULT_POKEMON_ID); // 兜底(理论上不会发生)
    meta.team = [...team];

    const teamMaxHp = team.map((id) => getPkmMaxHp(id, meta.metaHpLv));
    const teamHp = [...teamMaxHp];
    const mapNodes = generateMapNodes(1);
    if (mapNodes[0].length > 0) mapNodes[0][0]!.reachable = true;

    const run: RunState = {
      hp: teamMaxHp[0] ?? getMaxHpFromMeta(meta.metaHpLv),
      maxHp: teamMaxHp[0] ?? getMaxHpFromMeta(meta.metaHpLv),
      gold: STARTING_GOLD,
      score: 0,
      floor: 1,
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
      pokeBalls: { normal: 3, great: 0, ultra: 0, beast: 0, master: 0 },
      gameOver: false,
      runWon: false,
      visitedNodes: [],
      questionHistory: [],
      captureBonus: 0,
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
      currentQ: null,
      questionAnswered: false,
      cardPlayedThisTurn: false,
      turnPhase: "question",
      turnCorrect: 0,
    };

    set({
      meta,
      run,
      gameOver: null,
      modal: null,
      screen: "map",
      prevScreen: get().screen,
    });
    persistMeta(meta);
    persistRun(run);
    get().showToast(
      `上阵队伍: ${team.map((id) => getPkmName(id)).join(" / ")}`,
      2200,
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

  buyBall: (key) => {
    const run0 = get().run;
    if (!run0) return;
    const ball = POKE_BALLS[key];
    if (run0.gold < ball.price) {
      get().showToast("金币不足！", 1500);
      return;
    }
    const run = cloneRun(run0);
    run.gold -= ball.price;
    run.pokeBalls[key] = (run.pokeBalls[key] || 0) + 1;
    set({ run });
    persistRun(run);
    get().showToast(`购买: ${ball.name}`, 1500);
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
    get().showToast(`购买: ${cardId}`, 1500);
  },

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
    const run = cloneRun(run0);
    run.gold -= 75;
    const idx = Math.floor(Math.random() * run.deck.length);
    const removed = run.deck.splice(idx, 1)[0]!;
    run.drawPile = run.drawPile.filter((id) => id !== removed);
    run.discardPile = run.discardPile.filter((id) => id !== removed);
    run.hand = run.hand.filter((id) => id !== removed);
    set({ run });
    persistRun(run);
    get().showToast(`移除: ${removed}`, 1500);
  },

  openRest: () => {
    set({ screen: "rest", prevScreen: get().screen });
  },

  restHeal: () => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
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
    const run = cloneRun(run0);
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
    // 事件扣血打倒当前宝可梦:队伍有存活成员则自动换人继续
    if (run.hp <= 0 && run.team.length > 1 && switchToNextAlive(run)) {
      set({ run, modal: null, activeEventId: null });
      persistRun(run);
      if (msg) get().showToast(`${msg} · ${getPkmName(run.team[run.activeIdx]!)} 顶了上来！`, 2000);
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
    set({
      run,
      screen: "battle",
      prevScreen: get().screen,
      modal: null,
      lastAnswer: null,
    });
    persistRun(run);
  },

  /** 战斗中手动切换出战宝可梦 */
  switchPoke: (idx) => {
    const run0 = get().run;
    if (!run0 || !run0.inBattle) return;
    const run = cloneRun(run0);
    if (!switchActiveTo(run, idx)) {
      if ((run.teamHp[idx] || 0) <= 0) {
        get().showToast("该宝可梦已倒下,无法出战", 1500);
      }
      return;
    }
    set({ run });
    persistRun(run);
    get().showToast(`${getPkmName(run.team[idx]!)} 出战!`, 1200);
  },

  answer: (idx) => {
    const run0 = get().run;
    const meta0 = get().meta;
    if (!run0 || run0.turnPhase !== "question") return null;
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

    // 答题击杀敌人 → 结束战斗;答错反伤致死 → 败北(迁移自 standalone handleBattleAnswer)
    if (res.enemyDead) {
      get().endBattle(true);
    } else if (res.playerDead) {
      get().gameOverDefeat();
    }
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
    set({ run });
    persistRun(run);

    if (res.enemyDead) {
      get().endBattle(true);
    } else if (res.playerDead) {
      get().gameOverDefeat();
    }
  },

  endTurnAction: () => {
    const run0 = get().run;
    const meta0 = get().meta;
    if (!run0) return;
    const run = cloneRun(run0);
    const res = endTurn(run, get().questionPool, meta0.metaAtkLv);
    set({ run });
    persistRun(run);

    if (res.enemyDead) {
      get().endBattle(true);
    } else if (res.playerDead) {
      get().gameOverDefeat();
    }
  },

  endBattle: (won) => {
    const run0 = get().run;
    if (!run0) return;

    if (won) {
      const run = cloneRun(run0);
      saveActiveFromHp(run); // 出战宝可梦血量回写(跨战斗保留)
      const node = currentNode(run);
      if (node && node.rewards) {
        const g = node.rewards.gold || 20;
        run.gold += g;
        const meta = cloneMeta(get().meta);
        meta.metaGold += g;
        run.score +=
          node.type === "boss" ? 100 : node.type === "elite" ? 50 : 20;
        set({ meta });
        persistMeta(meta);
      }

      // 击败 BOSS:进入下一层(无限闯关)
      if (node && node.type === "boss") {
        const clearedFloor = run.floor;
        run.floor++;
        run.score += 50 + clearedFloor * 10;
        run.mapNodes = generateMapNodes(run.floor);
        run.currentNodeIdx = -1;
        run.visitedNodes = [];
        if (run.mapNodes[0].length > 0) {
          run.mapNodes[0].forEach((n) => (n.reachable = true));
        }
        get().showToast(
          `🎉 击败第 ${clearedFloor} 层BOSS！进入第 ${run.floor} 层！`,
          2500,
        );
      }

      run.inBattle = false;
      run.combo = 0;
      set({ run });
      persistRun(run);

      // 总是提供捕获(除非已阵亡)
      if (run.enemyPkm && run.enemyPkm.id) {
        set({ modal: { kind: "capture" } });
      } else {
        set({ screen: "map", prevScreen: get().screen });
      }
      const st = get();
      if (st.run && st.run.score > st.meta.bestScore) {
        st.showToast("🏆 新最高分！", 2000);
      }
    } else {
      get().gameOverDefeat();
    }
  },

  /**
   * 掷球捕获:同步扣球并结算结果(数据立即落档)。
   * 返回 { success, pkmId };UI 表现(3D 投球动画/飘字)由调用方播放,
   * 结束后调用 finishCapture() 关闭弹窗并进入奖励/回地图。
   */
  attemptCapture: (ball): { success: boolean; pkmId: number } | undefined => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    const meta = cloneMeta(get().meta);
    const pkm = run.enemyPkm;
    if (!pkm) return;

    run.pokeBalls[ball] = Math.max(0, (run.pokeBalls[ball] || 0) - 1);
    const ballDef = POKE_BALLS[ball];
    const finalRate = ballDef.rates[pkm.r] || ballDef.rates.c || 0.5;

    const success = Math.random() < finalRate;
    if (success) {
      meta.collected = { ...meta.collected, [String(pkm.id)]: true };
      // 队伍有空位时自动上阵(meta 跨局保留,run 本局立即生效)
      if (meta.team.length < MAX_TEAM_SIZE && !meta.team.includes(pkm.id)) {
        meta.team.push(pkm.id);
        run.team.push(pkm.id);
        run.teamMaxHp.push(getPkmMaxHp(pkm.id, meta.metaHpLv));
        run.teamHp.push(run.teamMaxHp[run.teamMaxHp.length - 1]!);
      } else if (!meta.team.includes(pkm.id)) {
        get().showToast("队伍已满,新伙伴将在图鉴中待命", 1800);
      }
    }
    set({ run, meta });
    persistRun(run);
    persistMeta(meta);
    return { success, pkmId: pkm.id };
  },

  /** 开始投球捕获动画:关弹窗 + 标记动画中(战斗舞台保持渲染,canvas 不卸载) */
  beginCaptureAnim: () => {
    set({ modal: null, captureAnimating: true });
  },

  /** 捕获动画播完后的收尾:关弹窗 → 奖励选卡或回地图 */
  finishCapture: () => {
    const run = get().run;
    set({ modal: null, captureAnimating: false });
    if (!run) return;
    const node = currentNode(run);
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
  },

  skipCapture: () => {
    const run = get().run;
    set({ modal: null });
    if (!run) return;
    const node = currentNode(run);
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
    get().showToast("放弃了捕获...", 1500);
  },

  chooseRewardCard: (cardId) => {
    const run0 = get().run;
    if (!run0) return;
    const run = cloneRun(run0);
    run.deck.push(cardId);
    // 奖励来自战斗胜利:关闭模态并回到地图(否则 screen 停在 battle 导致空白)
    set({ run, modal: null, screen: "map", prevScreen: get().screen });
    persistRun(run);
    get().showToast(`获得卡片: ${cardId}`, 1800);
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
    run.inBattle = false;

    // 剩余金币入库养成
    if (run.gold > 0) {
      meta.metaGold += run.gold;
      get().showToast(`剩余 ${run.gold} 金已存入养成`, 2000);
    }

    // 最高分/最高层
    const isRecord = run.score > meta.bestScore;
    if (isRecord) meta.bestScore = run.score;
    if (run.floor > meta.bestFloor) meta.bestFloor = run.floor;

    const info: GameOverInfo = {
      win: false,
      floor: run.floor,
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
      screen: "over",
      prevScreen: get().screen,
    });
    persistRun(run);
    persistMeta(meta);
  },
}));

/* ============ 内部辅助 ============ */

/** 单调递增 id,供 UI 在 React StrictMode 下对 lastAnswer 做去重(参考工程同款) */
let answerEventSeq = 0;

function getImportedQuestions(): Question[] | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem("dungeonDrive_importedQuestions");
    if (!saved) return null;
    const data = JSON.parse(saved);
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

function currentNode(run: RunState): MapNode | null {
  if (!run.mapNodes || run.mapNodes.length === 0) return null;
  const col = run.mapNodes[run.currentNodeIdx];
  if (!col) return null;
  return col.find((n) => n.visited) ?? null;
}
