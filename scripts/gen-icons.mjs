/**
 * 生成站点图标(浏览器标签页/收藏夹/手机桌面):
 *   app/icon.png       256x256
 *   app/apple-icon.png 180x180
 *   app/favicon.ico    16+32 双帧(PNG-in-ICO)
 * 设计:蓝天渐变底 + 明黄圆徽章(白描边) + 中央深蓝四芒星(黄蓝配色)。
 * 运行: node scripts/gen-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BLUE = "#1d5bc4";   // 中央四芒星(深蓝)
const YELLOW = "#ffd23f"; // 圆徽盘(明黄)
const WHITE = "#ffffff";  // 徽盘描边(白)

// 16x16 像素网格:圆徽盘 + 中央 8x8 四芒星(偶数尺寸,精确对齐网格中心 7.5)
const G = 16;
const grid = Array.from({ length: G }, () => Array(G).fill(null));
// 圆形徽章:半径 6、中心 7.5;边缘一圈白描边,内部明黄。
// 只计算左上象限(r,c ≤ 7),再镜像到其余三个象限,保证在偶数网格上严格对称。
const inside = (r, c) => Math.hypot(r + 0.5 - 7.5, c + 0.5 - 7.5) <= 6;
for (let r = 0; r <= 7; r++) {
  for (let c = 0; c <= 7; c++) {
    if (!inside(r, c)) continue;
    const edge =
      !inside(r - 1, c) || !inside(r + 1, c) || !inside(r, c - 1) || !inside(r, c + 1);
    const col = edge ? WHITE : YELLOW;
    grid[r][c] = col;
    grid[r][15 - c] = col;
    grid[15 - r][c] = col;
    grid[15 - r][15 - c] = col;
  }
}
// 四芒星(8x8, 网格行 4-11, 列 4-11, 中心恰为 7.5):竖臂尖→展→细,中两行横贯
const STAR = [
  "...##...",
  "..####..",
  "...##...",
  "########",
  "########",
  "...##...",
  "..####..",
  "...##...",
];
for (let i = 0; i < 8; i++) {
  for (let j = 0; j < 8; j++) {
    if (STAR[i][j] === "#") grid[4 + i][4 + j] = BLUE;
  }
}

function svg(S) {
  const cell = S / G;
  const rx = Math.round(S * 0.2);
  let rects = "";
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const col = grid[r][c];
      if (!col) continue;
      rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${col}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fcbff"/>
      <stop offset="0.52" stop-color="#3f8df0"/>
      <stop offset="1" stop-color="#1d5bc4"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.95">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.25"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="${rx}" fill="url(#bg)"/>
  <rect width="${S}" height="${S}" rx="${rx}" fill="url(#glow)"/>
  ${rects}
</svg>`;
}

async function renderPng(S) {
  return sharp(Buffer.from(svg(S))).png().toBuffer();
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

// 验证:深蓝星 / 明黄盘 / 白描边是否都存在
const { data } = await sharp(png256).raw().toBuffer({ resolveWithObject: true });
const near = (px, t) => (px[0] - t[0]) ** 2 + (px[1] - t[1]) ** 2 + (px[2] - t[2]) ** 2 < 30 ** 2;
const targets = { blue: [29, 91, 196], yellow: [255, 210, 63], white: [255, 255, 255] };
const counts = { blue: 0, yellow: 0, white: 0 };
for (let i = 0; i < data.length; i += 4) {
  const px = [data[i], data[i + 1], data[i + 2]];
  for (const [k, t] of Object.entries(targets)) if (near(px, t)) counts[k]++;
}
console.log("color check:", JSON.stringify(counts));
console.log("written: app/icon.png(256), app/apple-icon.png(180), app/favicon.ico(16+32)");
