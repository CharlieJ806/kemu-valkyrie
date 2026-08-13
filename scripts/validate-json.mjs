/**
 * 数据一致性校验(纯 node,无依赖)。
 * 运行: node scripts/validate-json.mjs
 * 校验: valkyries.json 结构 / question_cats.json 覆盖率 / portraits.json 有效性
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const ATTRS = ["law", "signal", "safety", "civility"];
const RARITIES = ["c", "u", "r", "l"];
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function check(name) {
  console.log(`── ${name} ──`);
}

/* 1. valkyries.json */
check("valkyries.json");
const vd = JSON.parse(fs.readFileSync(path.join(DATA, "valkyries.json"), "utf8"));
assert(Array.isArray(vd.valkyries) && vd.valkyries.length === 8, `学员应为 8 名(实际 ${vd.valkyries?.length})`);
assert(Array.isArray(vd.monsters) && vd.monsters.length === 29, `魔物应为 29 只(实际 ${vd.monsters?.length})`);

const all = [...(vd.valkyries || []), ...(vd.monsters || [])];
const ids = new Set(all.map((x) => x.id));
assert(ids.size === all.length, `id 不唯一(总数 ${all.length},去重 ${ids.size})`);
assert(all.every((x) => ATTRS.includes(x.attr)), "存在非法 attr");
assert(all.every((x) => ATTRS.includes(x.attr2)), "存在非法 attr2");
assert(all.every((x) => RARITIES.includes(x.r)), "存在非法稀有度");
assert(all.every((x) => typeof x.hp === "number" && typeof x.atk === "number" && typeof x.bst === "number"), "存在缺失 hp/atk/bst");
assert(all.every((x) => x.look && ["long", "short", "twin", "bob", "ponytail"].includes(x.look.hair)), "存在非法发型");
assert(all.every((x) => x.ult && typeof x.ult.name === "string"), "存在缺失必杀技");

// 8 名学员每板块 2 名
const attrCount = {};
for (const v of vd.valkyries || []) attrCount[v.attr] = (attrCount[v.attr] || 0) + 1;
for (const a of ATTRS) assert(attrCount[a] === 2, `板块 ${a} 学员数 ${attrCount[a]} ≠ 2`);

// 9 个 Boss(boss:true,id 117-125,对应 9 章)
const bosses = (vd.monsters || []).filter((m) => m.boss);
assert(bosses.length === 9, `Boss 应为 9 只(实际 ${bosses.length})`);
assert(bosses.every((m) => m.id >= 117 && m.id <= 125), "Boss id 应在 117-125");
assert(new Set(bosses.map((m) => m.id)).size === 9, "Boss id 不唯一");

/* 1b. story.json */
check("story.json");
const story = JSON.parse(fs.readFileSync(path.join(DATA, "story.json"), "utf8"));
assert(Array.isArray(story.prologue) && story.prologue.length > 0, "缺序章对白");
assert(Array.isArray(story.chapters) && story.chapters.length === 9, `章节应为 9(实际 ${story.chapters?.length})`);
// 9 章 bossId 与 Boss 池一一对应(每章一个,不重复)
const chapterBossIds = new Set(story.chapters?.map((c) => c.bossId) || []);
assert(chapterBossIds.size === 9, `9 章 bossId 应不重复(实际 ${chapterBossIds.size})`);
// 解锁顺序:第 1-7 章各解锁一名学员(2-8),第 8/9 章无解锁
const unlockIds = (story.chapters || []).map((c) => c.unlockId).filter((x) => x != null);
assert(unlockIds.length === 7, `解锁学员应为 7 名(实际 ${unlockIds.length})`);
assert(JSON.stringify(unlockIds) === JSON.stringify([2, 3, 4, 5, 6, 7, 8]), `解锁顺序应为 2-8(实际 ${JSON.stringify(unlockIds)})`);
for (const ch of story.chapters || []) {
  const boss = all.find((x) => x.id === ch.bossId);
  assert(!!boss && !!boss.boss, `第 ${ch.id} 章 bossId ${ch.bossId} 不是 Boss`);
  if (ch.unlockId != null) {
    assert((vd.valkyries || []).some((v) => v.id === ch.unlockId), `第 ${ch.id} 章 unlockId ${ch.unlockId} 不是学员`);
  }
  for (const line of [...(ch.intro || []), ...(ch.outro || [])]) {
    const okSpeaker =
      line.speaker === "narrator" || (vd.valkyries || []).some((v) => v.id === line.speaker);
    assert(okSpeaker, `第 ${ch.id} 章存在非法 speaker`);
    assert(typeof line.text === "string" && line.text.length > 0, `第 ${ch.id} 章存在空对白`);
  }
}

/* 2. question_cats.json 覆盖率 */
check("question_cats.json");
const qs = JSON.parse(fs.readFileSync(path.join(DATA, "questions.json"), "utf8"));
const cats = JSON.parse(fs.readFileSync(path.join(DATA, "question_cats.json"), "utf8"));
const missing = qs.filter((q) => !cats[q.id]);
const orphans = Object.keys(cats).filter((id) => !qs.some((q) => q.id === id));
assert(missing.length === 0, `${missing.length} 题无分类索引(如 ${missing.slice(0, 3).map((q) => q.id).join(",")})`);
assert(orphans.length === 0, `${orphans.length} 个孤儿分类 id`);
const badCat = Object.values(cats).filter((c) => !ATTRS.includes(c?.cat));
assert(badCat.length === 0, `${badCat.length} 条非法分类值`);

/* 3. portraits.json 与 valkyries 一致性(主立绘 + 动作 pose) */
check("portraits.json");
const portraits = JSON.parse(fs.readFileSync(path.join(DATA, "portraits.json"), "utf8"));
const portraitIds = Object.keys(portraits);
assert(portraitIds.every((id) => ids.has(Number(id))), `portraits.json 存在无效 id`);
for (const id of portraitIds) {
  const f = path.join(ROOT, "public", "art", "valkyrie", `${id}.webp`);
  assert(fs.existsSync(f), `portraits.json 声明了 ${id} 但缺少 public/art/valkyrie/${id}.webp`);
  const entry = portraits[id];
  if (entry && typeof entry === "object" && Array.isArray(entry.poses)) {
    for (const pose of entry.poses) {
      const pf = path.join(ROOT, "public", "art", "valkyrie", `${id}_${pose}.webp`);
      assert(fs.existsSync(pf), `${id} 声明了 ${pose} 动作但缺少 ${id}_${pose}.webp`);
    }
  }
}
const unclaimed = all.filter((x) => !portraits[String(x.id)]);
if (unclaimed.length > 0) {
  console.log(`  提示: ${unclaimed.length} 个角色未配置立绘(将使用占位 SVG)`);
}

/* 4. 卡牌定义静态检查(轻量:从 cards.ts 源码提取 attr 出现次数) */
check("cards.ts");
const cardsSrc = fs.readFileSync(path.join(ROOT, "lib", "cards.ts"), "utf8");
const cardCount = (cardsSrc.match(/attr: "(law|signal|safety|civility)"/g) || []).length;
assert(cardCount === 64, `卡牌总数 ${cardCount} ≠ 64`);

console.log(failed === 0 ? "\n✅ 全部校验通过" : `\n❌ ${failed} 项校验失败`);
process.exit(failed === 0 ? 0 : 1);
