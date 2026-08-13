import type { MapNode, MetaState, RunState } from "./types";
import { cardFromIdList } from "./cards";

/** 沿用本地版(localStorage)键名,保证老存档可读 */
export const META_KEY = "dungeonDrive_meta";
export const RUN_KEY = "dungeonDrive_save";
export const IMPORTED_KEY = "dungeonDrive_importedQuestions";

export function defaultPokeBalls() {
  return { normal: 3, great: 0, ultra: 0, beast: 0, master: 0 };
}

export function defaultMeta(): MetaState {
  return {
    bestScore: 0,
    bestFloor: 0,
    totalRuns: 0,
    collected: {},
    team: [],
    pokeBalls: defaultPokeBalls(),
    soundEnabled: true,
    metaGold: 0,
    metaHpLv: 0,
    metaAtkLv: 0,
    ownedCards: null,
    builtDeckIds: null,
    wrongQ: {},
    totalCorrect: 0,
    totalAnswered: 0,
    maxComboEver: 0,
  };
}

/**
 * 从老/新存档读取 meta 并迁移:
 * 旧字段同名直读 + 默认值;新字段(wrongQ 等)缺省填充;立即回写补全。
 */
export function loadMeta(): MetaState {
  if (typeof window === "undefined") return defaultMeta();
  try {
    const raw = localStorage.getItem(META_KEY);
    const d = raw ? JSON.parse(raw) : {};
    if (typeof d !== "object" || d === null) return defaultMeta();
    const meta: MetaState = {
      bestScore: d.bestScore || 0,
      bestFloor: d.bestFloor || 0,
      totalRuns: d.totalRuns || 0,
      collected: d.collected || {},
      team: Array.isArray(d.team) ? d.team : [],
      pokeBalls: { ...defaultPokeBalls(), ...(d.pokeBalls || {}) },
      soundEnabled: d.soundEnabled !== false,
      metaGold: d.metaGold || 0,
      metaHpLv: d.metaHpLv || 0,
      metaAtkLv: d.metaAtkLv || 0,
      ownedCards: d.ownedCards || null,
      builtDeckIds: d.builtDeckIds || null,
      wrongQ: d.wrongQ || {},
      totalCorrect: d.totalCorrect || 0,
      totalAnswered: d.totalAnswered || 0,
      maxComboEver: d.maxComboEver || 0,
    };
    // 迁移后立即写回,补全缺省字段
    saveMeta(meta);
    return meta;
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta: MetaState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** 地图可达性重算(迁移自 standalone loadGame):进入存档后按 currentNodeIdx 重建 */
export function recomputeReachability(
  mapNodes: MapNode[][],
  currentNodeIdx: number,
): void {
  if (!Array.isArray(mapNodes) || mapNodes.length === 0) return;
  // 重置前先捕获当前列已访问节点(standalone 原版先重置再 find 永远找不到,本版修复)
  let currentVisited: MapNode | null = null;
  if (currentNodeIdx >= 0 && mapNodes[currentNodeIdx]) {
    currentVisited = mapNodes[currentNodeIdx]!.find((n) => n.visited) ?? null;
  }
  mapNodes.forEach((col) =>
    col.forEach((n) => {
      n.reachable = false;
      n.visited = false;
    }),
  );
  if (mapNodes[0].length > 0) mapNodes[0].forEach((n) => (n.reachable = true));
  if (currentNodeIdx >= 0) {
    mapNodes.forEach((col, ci) => {
      if (ci < currentNodeIdx) {
        col.forEach((n) => {
          n.visited = true;
          n.reachable = false;
        });
      } else if (ci === currentNodeIdx) {
        if (currentVisited) currentVisited.visited = true;
        col.forEach((n) => {
          if (n !== currentVisited) {
            n.visited = true;
            n.reachable = false;
          }
        });
        if (ci + 1 < mapNodes.length) {
          mapNodes[ci + 1].forEach((n) => (n.reachable = true));
        }
      }
    });
  }
}

/** 从老/新存档读取 run;gameOver 视为无存档;卡牌 id 数组水合 */
export function loadRun(): RunState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.gameOver) return null;

    const run: RunState = {
      hp: d.hp ?? 80,
      maxHp: d.maxHp ?? 80,
      gold: d.gold ?? 0,
      score: d.score ?? 0,
      floor: d.floor ?? 1,
      deck: cardIds(d.deck),
      hand: cardIds(d.hand),
      drawPile: cardIds(d.drawPile),
      discardPile: cardIds(d.discardPile),
      energy: d.energy ?? 0,
      block: d.block ?? 0,
      combo: d.combo ?? 0,
      maxCombo: d.maxCombo ?? 0,
      totalCorrect: d.totalCorrect ?? 0,
      totalAnswered: d.totalAnswered ?? 0,
      inBattle: !!d.inBattle,
      mapNodes: d.mapNodes || [],
      currentNodeIdx: d.currentNodeIdx ?? -1,
      team: Array.isArray(d.team) ? d.team : [],
      // 旧存档无队伍血量字段 → 每只按当前 maxHp 满血补全
      teamHp: Array.isArray(d.teamHp)
        ? d.teamHp
        : Array.isArray(d.team)
          ? d.team.map(() => d.maxHp ?? 80)
          : [],
      teamMaxHp: Array.isArray(d.teamMaxHp)
        ? d.teamMaxHp
        : Array.isArray(d.team)
          ? d.team.map(() => d.maxHp ?? 80)
          : [],
      activeIdx: typeof d.activeIdx === "number" ? d.activeIdx : 0,
      pokeBalls: { ...defaultPokeBalls(), ...(d.pokeBalls || {}) },
      gameOver: !!d.gameOver,
      runWon: !!d.runWon,
      visitedNodes: d.visitedNodes || [],
      questionHistory: d.questionHistory || [],
      captureBonus: d.captureBonus || 0,

      enemyPkm: d.enemyPkm || null,
      enemyHp: d.enemyHp ?? 0,
      enemyMaxHp: d.enemyMaxHp ?? 0,
      enemyBlock: d.enemyBlock ?? 0,
      enemyBaseDamage: d.enemyBaseDamage ?? 8,
      enemyCaptureRate: d.enemyCaptureRate ?? 0.5,
      enemyIntent: d.enemyIntent || null,
      enemyStatus: d.enemyStatus || null,
      enemyAtkMult: d.enemyAtkMult ?? 1,
      playerDmgMult: d.playerDmgMult ?? 1,
      playerDefMult: d.playerDefMult ?? 1,
      currentQ: d.currentQ || null,
      questionAnswered: !!d.questionAnswered,
      cardPlayedThisTurn: !!d.cardPlayedThisTurn,
      turnPhase: d.turnPhase === "card" ? "card" : "question",
      turnCorrect: d.turnCorrect || 0,
    };

    // 老存档的 deck 是完整卡对象数组 → 只取 id
    recomputeReachability(run.mapNodes, run.currentNodeIdx);

    // 若抽牌堆空但有牌组,预置一份(与本地版 loadGame 一致)
    if (run.drawPile.length === 0 && run.deck.length > 0) {
      run.drawPile = cardFromIdList(run.deck).map((c) => c.id);
    }
    return run;
  } catch {
    return null;
  }
}

/** 对象数组 → 卡 id 数组(兼容完整卡对象与 id 字符串两种老格式) */
function cardIds(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object") {
        const o = c as { id?: unknown; cardId?: unknown };
        return typeof o.id === "string" ? o.id : typeof o.cardId === "string" ? o.cardId : null;
      }
      return null;
    })
    .filter((x): x is string => !!x);
}

export function saveRun(run: RunState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function hasRun(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    return !d.gameOver;
  } catch {
    return false;
  }
}

/* ============ 导入题库 ============ */

export function loadImportedQuestions<T>(): T[] | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(IMPORTED_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

export function saveImportedQuestions<T>(qs: T[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify(qs));
  } catch {
    /* ignore */
  }
}

/** 清空全部存档(设置页重置) */
export function wipeAll(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(RUN_KEY);
    localStorage.removeItem(IMPORTED_KEY);
  } catch {
    /* ignore */
  }
}
