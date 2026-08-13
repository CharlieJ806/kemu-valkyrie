/**
 * 立绘处理:resource_nobg/(rembg 去背景产物) → public/art/valkyrie/。
 * 映射表 scripts/portrait-map.json:文件夹=角色/Boss,portrait 主图 + poses 动作图。
 * 输出:
 *   - {id}.webp(480×640 主立绘)
 *   - {id}_{pose}.webp(动作立绘,attack/hurt/skill/ult)
 *   - data/portraits.json  { "<id>": { "poses": ["attack","hurt",...] } }
 * 运行: node scripts/process-portraits.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT_DIR = path.join(ROOT, "public", "art", "valkyrie");
const SRC_ROOT = path.join(ROOT, "resource_nobg"); // 去背景产物(scripts/remove-bg.py 生成)

const MAP = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "portrait-map.json"), "utf8"),
);

// 收集任务: { src, outName }
// boss 素材可能放在 enemies/{name} 或 enemies/boss/{name}(新旧两种目录结构都兼容)
// minions 组:值直接是文件名(平铺在 enemies/小怪/,无 poses)
const jobs = [];
for (const [group, folders] of [
  ["characters", ["characters"]],
  ["bosses", ["enemies", "enemies/boss"]],
]) {
  for (const [name, def] of Object.entries(MAP[group] || {})) {
    const dir =
      folders
        .map((f) => path.join(SRC_ROOT, f, name))
        .find((d) => fs.existsSync(d)) || path.join(SRC_ROOT, folders[0], name);
    jobs.push({ src: path.join(dir, def.portrait), outName: `${def.id}.webp` });
    for (const [pose, file] of Object.entries(def.poses || {})) {
      jobs.push({ src: path.join(dir, file), outName: `${def.id}_${pose}.webp` });
    }
  }
}
for (const [id, file] of Object.entries(MAP.minions || {})) {
  jobs.push({
    src: path.join(SRC_ROOT, "enemies", "小怪", file),
    outName: `${id}.webp`,
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

const portraits = {};
let ok = 0;
for (const job of jobs) {
  if (!fs.existsSync(job.src)) {
    console.warn(`  ! 素材缺失: ${path.relative(ROOT, job.src)}`);
    continue;
  }
  const b64 = fs.readFileSync(job.src).toString("base64");
  try {
    const dataUrl = await page.evaluate(
      async (u) => {
        const img = new Image();
        img.src = u;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error("img load failed"));
        });
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 640;
        const ctx = canvas.getContext("2d");
        // cover 居中裁剪到 3:4
        const scale = Math.max(480 / img.width, 640 / img.height);
        const sw = 480 / scale;
        const sh = 640 / scale;
        ctx.drawImage(
          img,
          (img.width - sw) / 2,
          (img.height - sh) / 2,
          sw,
          sh,
          0,
          0,
          480,
          640,
        );
        return canvas.toDataURL("image/webp", 0.85);
      },
      `data:image/png;base64,${b64}`,
    );
    const outPath = path.join(OUT_DIR, job.outName);
    fs.writeFileSync(outPath, Buffer.from(dataUrl.split(",")[1], "base64"));
    ok++;
    console.log(
      `  ${job.outName} ← ${path.relative(ROOT, job.src)} (${(fs.statSync(outPath).size / 1024).toFixed(0)}KB)`,
    );
  } catch (e) {
    console.warn(`  ! 处理失败 ${job.src}: ${e.message}`);
  }
}

await browser.close();

// portraits.json:仅记录有主立绘的角色 + 可用动作
for (const [group] of [
  ["characters", "characters"],
  ["bosses", "enemies"],
]) {
  for (const [name, def] of Object.entries(MAP[group] || {})) {
    const id = String(def.id);
    const portraitFile = path.join(OUT_DIR, `${id}.webp`);
    if (!fs.existsSync(portraitFile)) continue;
    const poses = Object.keys(def.poses || {}).filter((p) =>
      fs.existsSync(path.join(OUT_DIR, `${id}_${p}.webp`)),
    );
    portraits[id] = poses.length > 0 ? { poses } : true;
  }
}
for (const id of Object.keys(MAP.minions || {})) {
  if (fs.existsSync(path.join(OUT_DIR, `${id}.webp`))) portraits[id] = true;
}
fs.writeFileSync(
  path.join(ROOT, "data", "portraits.json"),
  JSON.stringify(portraits, null, 2) + "\n",
);
console.log(`\n完成: ${ok} 张立绘 → public/art/valkyrie/`);
