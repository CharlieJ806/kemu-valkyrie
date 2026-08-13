/**
 * 从 Pokemon Showdown gen5 CDN 抓取 722-1010 宝可梦图标(40x30,与现有图标同风格)。
 * 用法: node scripts/fetch-icons.mjs [输出目录]
 * 输出: 每只宝可梦一个 PNG,文件名为 {id}.png;失败列表写入 fetch-icons-miss.txt
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] || join(import.meta.dirname, "..", "icons-fetch");
mkdirSync(outDir, { recursive: true });

// 读宝可梦数据(722-1010)
const pokedata = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "data", "pokemon.json"), "utf8"),
);
const targets = pokedata.filter((p) => p.id > 721);

// PS 命名特殊映射(404 时尝试)
const nameFix = {
  "oricorio-baile": "oricorio",
  "lycanroc-midday": "lycanroc",
  "wishiwashi-solo": "wishiwashi",
  "minior-red-meteor": "minior",
  "mimikyu-disguised": "mimikyu",
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

const miss = [];
let ok = 0;

async function fetchOne(p) {
  const outFile = join(outDir, `${p.id}.png`);
  if (existsSync(outFile)) {
    ok++;
    return;
  }
  const name = p.n;
  const tryNames = [
    name,
    nameFix[name],
    name.replace(/-/g, ""), // PS 悖谬宝可梦无连字符(greattusk)
  ].filter(Boolean);
  for (const n of tryNames) {
    const url = `https://play.pokemonshowdown.com/sprites/gen5/${encodeURIComponent(n)}.png`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100 || buf.slice(0, 4).toString("hex") !== "89504e47") continue;
      writeFileSync(join(outDir, `${p.id}.png`), buf);
      ok++;
      return;
    } catch {
      /* 网络错误重试下一个名字 */
    }
  }
  miss.push(p);
  console.error(`  ❌ ${p.id} ${p.n}`);
}

const CONC = 6;
const queue = [...targets];
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    if (p) await fetchOne(p);
    await new Promise((r) => setTimeout(r, 60)); // 轻微限速
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

writeFileSync(join(outDir, "fetch-icons-miss.txt"), miss.map((m) => `${m.id} ${m.n}`).join("\n"));
console.log(`完成: 成功 ${ok}/${targets.length}, 失败 ${miss.length}`);
if (miss.length) console.log("失败列表见 icons-fetch/fetch-icons-miss.txt");
