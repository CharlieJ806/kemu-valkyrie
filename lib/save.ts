import type { MapNode, MetaState, RunState } from "./types";
import { cardFromIdList } from "./cards";
import { VALKYRIES, MONSTERS, getValkById } from "@/data";

/** 旧版存档(16 角色时期)可能残留非法角色 id → 净化队伍/收集 */
export function isValidTeamId(id: number): boolean {
  return VALKYRIES.some((v) => v.id === id);
}

/** 过滤队伍中的非法角色 id,并同步血量数组 */
export function sanitizeTeam(
  team: number[],
  teamHp: number[],
  teamMaxHp: number[],
): { team: number[]; teamHp: number[]; teamMaxHp: number[] } {
  const valid = team
    .map((id, i) => ({ id, hp: teamHp[i] ?? null, max: teamMaxHp[i] ?? null }))
    .filter((t) => isValidTeamId(t.id));
  return {
    team: valid.map((t) => t.id),
    teamHp: valid.map((t) => t.hp ?? t.max ?? 80),
    teamMaxHp: valid.map((t) => t.max ?? 80),
  };
}

/** 新游戏独立存档键(与旧项目 dungeonDrive_* 不串档) */
export const META_KEY = "kemuValkyrie_meta";
export const RUN_KEY = "kemuValkyrie_save";
export const IMPORTED_KEY = "kemuValkyrie_importedQuestions";
/** 对战昵称记忆(轻量键值,非存档) */
export const PVP_NAME_KEY = "kemuValkyrie_pvpName";

export function loadPvpName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PVP_NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function savePvpName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PVP_NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

export function defaultMeta(): MetaState {
  return {
    bestScore: 0,
    bestFloor: 0,
    totalRuns: 0,
    collected: {},
    team: [],
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
    storyCleared: 0,
    seenMonsters: {},
    caughtMonsters: {},
    achievements: {},
    bgmVol: 0.6,
    sfxVol: 0.8,
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
      collected: Object.fromEntries(
        Object.entries(d.collected || {}).filter(([k]) => isValidTeamId(Number(k))),
      ) as Record<string, boolean>,
      team: Array.isArray(d.team) ? d.team.filter((id: number) => isValidTeamId(id)) : [],
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
      storyCleared: typeof d.storyCleared === "number" ? d.storyCleared : 0,
      seenMonsters: Object.fromEntries(
        Object.entries(d.seenMonsters || {}).filter(([k]) =>
          MONSTERS.some((m) => m.id === Number(k)),
        ),
      ) as Record<string, boolean>,
      caughtMonsters: Object.fromEntries(
        Object.entries(d.caughtMonsters || {}).filter(([k]) =>
          MONSTERS.some((m) => m.id === Number(k)),
        ),
      ) as Record<string, boolean>,
      achievements:
        d.achievements && typeof d.achievements === "object" ? d.achievements : {},
      bgmVol: typeof d.bgmVol === "number" ? d.bgmVol : 0.6,
      sfxVol: typeof d.sfxVol === "number" ? d.sfxVol : 0.8,
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
      chapter: typeof d.chapter === "number" ? d.chapter : 1,
      loop: typeof d.loop === "number" ? d.loop : 1,
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
      gameOver: !!d.gameOver,
      runWon: !!d.runWon,
      visitedNodes: d.visitedNodes || [],
      questionHistory: d.questionHistory || [],
      restUsed: !!d.restUsed,

      bossPhase: typeof d.bossPhase === "number" ? d.bossPhase : 1,
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
      enemyWeakTurns: typeof d.enemyWeakTurns === "number" ? d.enemyWeakTurns : 0,
      enemyChargeMul: typeof d.enemyChargeMul === "number" ? d.enemyChargeMul : 1,
      enemyAffix: Array.isArray(d.enemyAffix) ? d.enemyAffix : [],
      affixSwiftDone: !!d.affixSwiftDone,
      affixRevived: !!d.affixRevived,
      bossVars: d.bossVars && typeof d.bossVars === "object" ? d.bossVars : {},
      qTimeLimit: typeof d.qTimeLimit === "number" ? d.qTimeLimit : 15000,
      chapterDamaged: !!d.chapterDamaged,
      currentQ: d.currentQ || null,
      questionAnswered: !!d.questionAnswered,
      cardPlayedThisTurn: !!d.cardPlayedThisTurn,
      turnPhase: d.turnPhase === "card" ? "card" : "question",
      turnCorrect: d.turnCorrect || 0,

      leaderId: typeof d.leaderId === "number" ? d.leaderId : null,
      awakened: d.awakened && typeof d.awakened === "object" ? d.awakened : {},
      ultGauge: d.ultGauge ?? 0,
      ultMax: d.ultMax ?? 9,
    };

    // 必杀卡不入任何牌堆(防旧档/异常状态污染)
    for (const key of ["hand", "deck", "drawPile", "discardPile"] as const) {
      run[key] = run[key].filter((id) => !id.startsWith("ult_"));
    }

    // 老存档的 deck 是完整卡对象数组 → 只取 id
    recomputeReachability(run.mapNodes, run.currentNodeIdx);

    // 净化队伍:旧版(16 角色)存档可能残留非法角色 id
    const team = sanitizeTeam(run.team, run.teamHp, run.teamMaxHp);
    run.team = team.team;
    run.teamHp = team.teamHp;
    run.teamMaxHp = team.teamMaxHp;
    if (run.team.length === 0) {
      // 全非法兜底:赤红单骑
      run.team = [1];
      run.teamHp = [80];
      run.teamMaxHp = [80];
    }
    if (run.activeIdx >= run.team.length) run.activeIdx = 0;
    if (run.enemyPkm && !getValkById(run.enemyPkm.id)) run.enemyPkm = null;

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
    localStorage.removeItem(PVP_NAME_KEY);
  } catch {
    /* ignore */
  }
}

/* ============ 存档导出 / 导入 ============ */

const SAVE_VERSION = 2;

export type SaveBundle = {
  v: number;
  meta: MetaState;
  run: RunState | null;
  imported: unknown[] | null;
  exportedAt: string;
};

/** 导出存档:base64 文本码(含 meta + run + 导入题库) */
export function exportSave(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const bundle: SaveBundle = {
      v: SAVE_VERSION,
      meta: loadMeta(),
      run: loadRun(),
      imported: loadImportedQuestions<unknown>(),
      exportedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(bundle);
    // 压缩体积:纯 ASCII base64(兼容 btoa)
    return btoa(unescape(encodeURIComponent(json)));
  } catch {
    return null;
  }
}

/** 导入存档码:校验并写入 localStorage;返回错误信息或 null(成功) */
export function importSave(code: string): string | null {
  if (typeof window === "undefined") return "当前环境不可用";
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const d = JSON.parse(json) as Partial<SaveBundle>;
    if (!d || typeof d !== "object") return "存档码格式错误";
    if (typeof d.v !== "number" || d.v < 1 || d.v > SAVE_VERSION) {
      return `不支持的存档版本(v${String(d.v)})`;
    }
    if (!d.meta || typeof d.meta !== "object") return "存档缺少 meta 数据";
    localStorage.setItem(META_KEY, JSON.stringify(d.meta));
    if (d.run && typeof d.run === "object") {
      localStorage.setItem(RUN_KEY, JSON.stringify(d.run));
    } else {
      localStorage.removeItem(RUN_KEY);
    }
    if (Array.isArray(d.imported) && d.imported.length > 0) {
      localStorage.setItem(IMPORTED_KEY, JSON.stringify(d.imported));
    } else {
      localStorage.removeItem(IMPORTED_KEY);
    }
    return null;
  } catch {
    return "存档码解析失败(可能已损坏)";
  }
}
