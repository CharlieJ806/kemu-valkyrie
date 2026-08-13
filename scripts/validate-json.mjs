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
assert(Array.isArray(vd.valkyries) && vd.valkyries.length === 16, `学员应为 16 名(实际 ${vd.valkyries?.length})`);
assert(Array.isArray(vd.monsters) && vd.monsters.length === 20, `魔物应为 20 只(实际 ${vd.monsters?.length})`);

const all = [...(vd.valkyries || []), ...(vd.monsters || [])];
const ids = new Set(all.map((x) => x.id));
assert(ids.size === all.length, `id 不唯一(总数 ${all.length},去重 ${ids.size})`);
assert(all.every((x) => ATTRS.includes(x.attr)), "存在非法 attr");
assert(all.every((x) => ATTRS.includes(x.attr2)), "存在非法 attr2");
assert(all.every((x) => RARITIES.includes(x.r)), "存在非法稀有度");
assert(all.every((x) => typeof x.hp === "number" && typeof x.atk === "number" && typeof x.bst === "number"), "存在缺失 hp/atk/bst");
assert(all.every((x) => x.look && ["long", "short", "twin", "bob", "ponytail"].includes(x.look.hair)), "存在非法发型");
assert(all.every((x) => x.ult && typeof x.ult.name === "string"), "存在缺失必杀技");

const attrCount = {};
for (const v of vd.valkyries || []) attrCount[v.attr] = (attrCount[v.attr] || 0) + 1;
for (const a of ATTRS) assert(attrCount[a] === 4, `板块 ${a} 学员数 ${attrCount[a]} ≠ 4`);

const monsterIds = new Set((vd.monsters || []).map((x) => x.id));
assert([...monsterIds].every((id) => id >= 101 && id < 200), "魔物 id 应在 101-199");

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

/* 3. portraits.json 与 valkyries 一致性 */
check("portraits.json");
const portraits = JSON.parse(fs.readFileSync(path.join(DATA, "portraits.json"), "utf8"));
const portraitIds = Object.keys(portraits);
assert(portraitIds.every((id) => ids.has(Number(id))), `portraits.json 存在无效 id`);
for (const id of portraitIds) {
  const f = path.join(ROOT, "public", "art", "valkyrie", `${id}.webp`);
  assert(fs.existsSync(f), `portraits.json 声明了 ${id} 但缺少 public/art/valkyrie/${id}.webp`);
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
