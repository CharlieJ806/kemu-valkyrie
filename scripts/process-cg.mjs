/**
 * 剧情 CG 处理:resource/CG/*.png → public/cg/*.webp(1920×1080, webp 压缩)。
 * 运行: node scripts/process-cg.mjs
 * 映射: 序章→cg-prologue, Ch1-9→cg-ch1..9, 觉醒→cg-awaken
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "resource", "CG");
const DST = path.join(ROOT, "public", "cg");

const MAP = {
  "序章.png": "cg-prologue.webp",
  "Ch1.png": "cg-ch1.webp",
  "Ch2.png": "cg-ch2.webp",
  "Ch3.png": "cg-ch3.webp",
  "Ch4.png": "cg-ch4.webp",
  "Ch5.png": "cg-ch5.webp",
  "Ch6.png": "cg-ch6.webp",
  "Ch7.png": "cg-ch7.webp",
  "Ch8.png": "cg-ch8.webp",
  "Ch9.png": "cg-ch9.webp",
  "觉醒.png": "cg-awaken.webp",
};

fs.mkdirSync(DST, { recursive: true });

for (const [src, dst] of Object.entries(MAP)) {
  const inPath = path.join(SRC, src);
  if (!fs.existsSync(inPath)) {
    console.warn(`跳过(缺失): ${src}`);
    continue;
  }
  const outPath = path.join(DST, dst);
  await sharp(inPath)
    .resize(1920, 1080, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toFile(outPath);
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`✓ ${dst}  ${kb}KB`);
}

console.log("完成。");
