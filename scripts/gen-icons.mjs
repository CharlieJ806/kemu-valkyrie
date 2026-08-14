/**
 * 生成站点图标(浏览器标签页/收藏夹/手机桌面):
 *   app/icon.png       256x256
 *   app/apple-icon.png 180x180
 *   app/favicon.ico    16+32 双帧(PNG-in-ICO)
 * 设计:薄荷青渐变底 + 像素女武神徽章(奶油白盾徽 + 深青描边 + 樱粉四芒星)。
 * 运行: node scripts/gen-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const TEAL = "#1c7a63";   // 盾徽描边(深薄荷青)
const CREAM = "#fffdf5";  // 盾徽底(奶油白)
const PINK = "#ff6b81";   // 中央四芒星(樱粉)

// 16x16 像素网格:徽章盾形 + 中央 8x8 四芒星(偶数尺寸,精确对齐网格中心 7.5)
const G = 16;
const grid = Array.from({ length: G }, () => Array(G).fill(null));
function rect(r0, r1, c0, c1, col) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r][c] = col;
}
// 盾形描边(顶部宽肩 → 底部收尖)
rect(1, 1, 3, 12, TEAL);
rect(2, 8, 2, 2, TEAL); rect(2, 8, 13, 13, TEAL);
rect(9, 9, 3, 12, TEAL);
rect(10, 10, 4, 11, TEAL);
rect(11, 11, 5, 10, TEAL);
rect(12, 12, 6, 9, TEAL);
rect(13, 14, 7, 8, TEAL);
// 盾面(奶油白)
rect(2, 8, 3, 12, CREAM);
rect(9, 9, 4, 11, CREAM);
rect(10, 10, 5, 10, CREAM);
rect(11, 11, 6, 9, CREAM);
rect(12, 12, 7, 8, CREAM);
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
    if (STAR[i][j] === "#") grid[4 + i][4 + j] = PINK;
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
      <stop offset="0" stop-color="#96e8d2"/>
      <stop offset="0.52" stop-color="#57c7a7"/>
      <stop offset="1" stop-color="#2f9d80"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.95">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/>
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

// 验证:樱粉星 / 奶油盾 / 深青描边是否都存在
const { data } = await sharp(png256).raw().toBuffer({ resolveWithObject: true });
const near = (px, t) => (px[0] - t[0]) ** 2 + (px[1] - t[1]) ** 2 + (px[2] - t[2]) ** 2 < 30 ** 2;
const targets = { pink: [255, 107, 129], cream: [255, 253, 245], teal: [28, 122, 99] };
const counts = { pink: 0, cream: 0, teal: 0 };
for (let i = 0; i < data.length; i += 4) {
  const px = [data[i], data[i + 1], data[i + 2]];
  for (const [k, t] of Object.entries(targets)) if (near(px, t)) counts[k]++;
}
console.log("color check:", JSON.stringify(counts));
console.log("written: app/icon.png(256), app/apple-icon.png(180), app/favicon.ico(16+32)");
