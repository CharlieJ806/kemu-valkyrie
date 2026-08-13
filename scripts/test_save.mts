/**
 * 存档兼容迁移测试(纯逻辑,无浏览器):
 * 用旧版(standalone)格式的 localStorage 数据验证 loadMeta/loadRun 迁移正确。
 * 运行: node --experimental-strip-types scripts/test_save.mts
 */
import { loadMeta, loadRun, defaultPokeBalls } from "../lib/save";

// ── mock 浏览器环境 ──
(globalThis as any).window = {};
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
};

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

// ── 测试 1:旧版 meta 迁移 ──
console.log("【测试1】旧版 meta(dungeonDrive_meta)迁移");
store.set(
  "dungeonDrive_meta",
  JSON.stringify({
    bestScore: 1234,
    bestFloor: 7,
    totalRuns: 12,
    collected: { "25": true, "6": true },
    team: [25],
    pokeBalls: { normal: 3, great: 1, ultra: 0, beast: 0, master: 0 },
    soundEnabled: false,
    metaGold: 88,
    metaHpLv: 2,
    metaAtkLv: 3,
    ownedCards: { tackle: true, ember: true },
    builtDeckIds: ["tackle", "ember"],
    // 缺 wrongQ/totalCorrect/totalAnswered/maxComboEver(新字段)
  }),
);
const meta = loadMeta();
assert("bestScore 保留", meta.bestScore === 1234, `got ${meta.bestScore}`);
assert("collected 保留", meta.collected["25"] === true);
assert("soundEnabled 保留", meta.soundEnabled === false);
assert("wrongQ 缺省 {} ", Object.keys(meta.wrongQ).length === 0);
assert("totalCorrect 缺省 0", meta.totalCorrect === 0);
assert("totalAnswered 缺省 0", meta.totalAnswered === 0);
assert("maxComboEver 缺省 0", meta.maxComboEver === 0);
assert("pokeBalls 归一化", meta.pokeBalls.normal === 3 && meta.pokeBalls.beast === 0);
// 迁移后应回写补全字段
const written = JSON.parse(store.get("dungeonDrive_meta")!);
assert("迁移后回写新字段", typeof written.wrongQ === "object" && written.wrongQ !== null);

// ── 测试 2:旧版 run 迁移(卡对象数组 deck + 战斗中存档) ──
console.log("【测试2】旧版 run(dungeonDrive_save)迁移");
const oldDeck = [
  { id: "tackle", name: "撞击", type: "atk", cost: 1, icon: "👊", desc: "x", rarity: "c", fx: { dmg: 6 } },
  { id: "harden", name: "变硬", type: "def", cost: 1, icon: "🪨", desc: "x", rarity: "c", fx: { block: 8 } },
];
const mapNodes = [
  [{ id: "n_1_0_0", type: "battle", col: 0, row: 0, enemyPkm: null, visited: false, reachable: true, rewards: { gold: 20, cardChoices: 1 } }],
  [
    { id: "n_1_1_0", type: "battle", col: 1, row: 0, enemyPkm: null, visited: true, reachable: false, rewards: { gold: 20, cardChoices: 1 } },
    { id: "n_1_1_1", type: "battle", col: 1, row: 1, enemyPkm: null, visited: false, reachable: true, rewards: { gold: 20, cardChoices: 1 } },
  ],
  [
    { id: "n_1_2_0", type: "boss", col: 2, row: 0, enemyPkm: null, visited: false, reachable: true, rewards: { gold: 60, cardChoices: 3 } },
  ],
];
store.set(
  "dungeonDrive_save",
  JSON.stringify({
    hp: 55,
    maxHp: 86,
    gold: 40,
    score: 120,
    floor: 1,
    deck: oldDeck, // 完整卡对象数组
    totalCorrect: 5,
    totalAnswered: 8,
    maxCombo: 4,
    combo: 2,
    collected: { "25": true },
    currentNodeIdx: 1,
    mapNodes,
    enemyHp: 30,
    enemyMaxHp: 60,
    enemyPkm: { id: 16, n: "pidgey", c: "波波", r: "c", i: 1 },
    inBattle: true,
    enemyCaptureRate: 0.7,
    gameOver: false,
    runWon: false,
    turnPhase: "card",
    turnCorrect: 3,
    energy: 3,
    enemyBaseDamage: 8,
    block: 5,
    team: [25],
    pokeBalls: { normal: 2, great: 0, ultra: 0, beast: 0, master: 0 },
  }),
);
const run = loadRun();
assert("run 非空", !!run);
if (run) {
  assert("deck 提取为 id 数组", run.deck.length === 2 && run.deck[0] === "tackle", JSON.stringify(run.deck));
  assert("hp/maxHp 保留", run.hp === 55 && run.maxHp === 86);
  assert("turnPhase 保留 card", run.turnPhase === "card");
  assert("inBattle 保留", run.inBattle === true);
  assert("enemyBlock 缺省 0", run.enemyBlock === 0);
  assert("enemyStatus 缺省 null", run.enemyStatus === null);
  assert("playerDmgMult 缺省 1", run.playerDmgMult === 1);
  assert("questionHistory 缺省 []", Array.isArray(run.questionHistory) && run.questionHistory.length === 0);
  assert("enemyPkm 保留", run.enemyPkm?.id === 16);
  // 可达性重算:currentNodeIdx=1 → 列0全 visited,列1的 visited 节点保留,列2 全 reachable
  assert("列0 visited+不可达", run.mapNodes[0][0]!.visited === true && run.mapNodes[0][0]!.reachable === false);
  const col1Visited = run.mapNodes[1]!.find((n) => n.id === "n_1_1_0")!;
  const col1Other = run.mapNodes[1]!.find((n) => n.id === "n_1_1_1")!;
  assert("当前列已选节点 visited", col1Visited.visited === true);
  assert("当前列其他节点 visited+不可达", col1Other.visited === true && col1Other.reachable === false);
  assert("下一列全部 reachable", run.mapNodes[2]!.every((n) => n.reachable));
  // 抽牌堆预置
  assert("drawPile 预置洗牌", run.drawPile.length === 2);
}

// ── 测试 3:gameOver 存档视为无档 ──
console.log("【测试3】gameOver:true 视为无存档");
store.set("dungeonDrive_save", JSON.stringify({ gameOver: true, deck: [] }));
assert("loadRun 返回 null", loadRun() === null);

// ── 测试 4:损坏存档容错 ──
console.log("【测试4】损坏 JSON 容错");
store.set("dungeonDrive_meta", "{{{bad json");
assert("损坏 meta 返回默认", loadMeta().bestScore === 0);
store.set("dungeonDrive_save", "not json");
assert("损坏 run 返回 null", loadRun() === null);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
