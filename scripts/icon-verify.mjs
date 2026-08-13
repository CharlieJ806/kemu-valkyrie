/**
 * 图标内容校验:本地图标 vs Pokemon Showdown gen5 同名图标的平均色差检测。
 * 色差大的条目 = 名字/图标错位候选。
 * 运行: node scripts/icon-verify.mjs [startId] [endId]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pokemon = JSON.parse(readFileSync(join(root, "data/pokemon.json"), "utf8"));
const icons = JSON.parse(readFileSync(join(root, "data/pokemon-icons.json"), "utf8"));

const nameFix = {
  "toxtricity-amped": "toxtricity",
  "eiscue-ice": "eiscue",
  "indeedee-male": "indeedee",
  "morpeko-full-belly": "morpeko",
  "urshifu-single-strike": "urshifu",
  "basculegion-male": "basculegion",
  "enamorus-incarnate": "enamorus",
  "oinkologne-male": "oinkologne",
  "squawkabilly-green-plumage": "squawkabilly",
  "tatsugiri-curly": "tatsugiri",
  "dudunsparce-two-segment": "dudunsparce",
  "poltchageist-counterfeit": "poltchageist",
  "sinistcha-masterpiece": "sinistcha",
  "ogerpon-1": "ogerpon",
  "gimmighoul-chest": "gimmighoul",
  "terapagos-terastal": "terapagos",
  "dipplin-straight": "dipplin",
};

async function avgColor(buf) {
  const { data } = await sharp(buf).resize(16, 16).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 40) continue; // 跳过透明像素
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (n === 0) return null;
  return [r / n, g / n, b / n];
}

function dist(a, b) {
  if (!a || !b) return 999;
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

const [start = 722, end = 1010] = process.argv.slice(2).map(Number);
const targets = pokemon.filter((p) => p.id >= start && p.id <= end);
console.log(`检测 ${targets.length} 只 (${start}-${end})...`);

let idx = 0;
const queue = targets.map((p) => p);
const results = [];
const BATCH = 6;

async function worker() {
  while (queue.length > 0) {
    const p = queue.shift();
    if (!p) break;
    const localB64 = icons[String(p.id)]?.replace(/^data:image\/png;base64,/, "");
    const tryNames = [p.n, nameFix[p.n], p.n.replace(/-/g, "")].filter(Boolean);
    let remoteBuf = null;
    for (const n of tryNames) {
      try {
        const res = await fetch(`https://play.pokemonshowdown.com/sprites/gen5/${encodeURIComponent(n)}.png`);
        if (res.ok) { remoteBuf = Buffer.from(await res.arrayBuffer()); break; }
      } catch { /* next */ }
    }
    let localC = null, remoteC = null;
    try { localC = await avgColor(Buffer.from(localB64, "base64")); } catch { /* bad */ }
    if (remoteBuf) { try { remoteC = await avgColor(remoteBuf); } catch { /* bad */ } }
    const d = dist(localC, remoteC);
    results.push({ id: p.id, n: p.n, c: p.c, d: Math.round(d) });
    idx++;
    if (idx % 40 === 0) console.log(`  ${idx}/${targets.length}`);
  }
}

await Promise.all(Array.from({ length: BATCH }, worker));

results.sort((a, b) => b.d - a.d);
console.log("\n=== 色差最大的 15 条(候选错位) ===");
results.slice(0, 15).forEach((r) => console.log(`  #${r.id} ${r.n} ${r.c} 色差 ${r.d}`));
console.log("\n=== 色差 < 30(正常) ===", results.filter((r) => r.d < 30).length, "只");
console.log("色差 30-60:", results.filter((r) => r.d >= 30 && r.d < 60).length, "只");
console.log("色差 ≥60:", results.filter((r) => r.d >= 60).length, "只");
