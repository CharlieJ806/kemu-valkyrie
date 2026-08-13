/**
 * 立绘处理:resource/ 原始 AI 素材 → public/art/valkyrie/{id}.webp(480×640,webp)。
 * 映射表在 scripts/portrait-map.json(文件名 → 角色 id,可自行修改后重跑)。
 * 运行: node scripts/process-portraits.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT_DIR = path.join(ROOT, "public", "art", "valkyrie");
const W = 480;
const H = 640;

const MAP = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "portrait-map.json"), "utf8"),
);

// 收集任务: { src, id }
const jobs = [];
for (const group of ["characters", "enemies"]) {
  for (const [folder, fileMap] of Object.entries(MAP[group] || {})) {
    for (const [file, id] of Object.entries(fileMap)) {
      jobs.push({ src: path.join(ROOT, "resource", group, folder, file), id });
    }
  }
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
        // cover 居中裁剪(源 3:4 → 目标 3:4,等比缩放)
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
    const outPath = path.join(OUT_DIR, `${job.id}.webp`);
    fs.writeFileSync(outPath, Buffer.from(dataUrl.split(",")[1], "base64"));
    portraits[String(job.id)] = true;
    ok++;
    console.log(
      `  #${job.id} ← ${path.relative(ROOT, job.src)} (${(fs.statSync(outPath).size / 1024).toFixed(0)}KB)`,
    );
  } catch (e) {
    console.warn(`  ! 处理失败 ${job.src}: ${e.message}`);
  }
}

await browser.close();
fs.writeFileSync(
  path.join(ROOT, "data", "portraits.json"),
  JSON.stringify(portraits, null, 2) + "\n",
);
console.log(`\n完成: ${ok} 张立绘 → public/art/valkyrie/`);
