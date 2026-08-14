/**
 * 生成站点图标(浏览器标签页/收藏夹/手机桌面):
 *   app/icon.png       256x256
 *   app/apple-icon.png 180x180
 *   app/favicon.ico    16+32 双帧(PNG-in-ICO)
 * 素材:resource/icon.png(方形源图,居中裁切缩放)。
 * 运行: node scripts/gen-icons.mjs [源图路径(默认 resource/icon.png)]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const srcPath = process.argv[2] || "resource/icon.png";
if (!fs.existsSync(srcPath)) {
  console.error(`源图不存在: ${srcPath}`);
  process.exit(1);
}

async function renderPng(S) {
  return sharp(srcPath)
    .resize(S, S, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

function icoFromPngs(frames) {
  const count = frames.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const f of frames) {
    const e = Buffer.alloc(16);
    e[0] = f.size >= 256 ? 0 : f.size;
    e[1] = f.size >= 256 ? 0 : f.size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(f.png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += f.png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
}

const root = path.resolve(".");
const png256 = await renderPng(256);
const png180 = await renderPng(180);
const png32 = await renderPng(32);
const png16 = await renderPng(16);

fs.writeFileSync(path.join(root, "app", "icon.png"), png256);
fs.writeFileSync(path.join(root, "app", "apple-icon.png"), png180);
fs.writeFileSync(path.join(root, "app", "favicon.ico"), icoFromPngs([
  { size: 16, png: png16 },
  { size: 32, png: png32 },
]));

console.log(`source: ${srcPath}`);
console.log("written: app/icon.png(256), app/apple-icon.png(180), app/favicon.ico(16+32)");
