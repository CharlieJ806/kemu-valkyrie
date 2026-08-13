import { getValkById } from "@/data";
import portraits from "@/data/portraits.json";
import { ATTR_COLORS } from "./attr";

/* ============ 立绘来源 ============
 * 1. data/portraits.json 记录了已有正式立绘的角色 id(由 scripts/process-portraits.mjs 处理 resource_nobg/ 时生成)
 *    格式: { "<id>": true } 或 { "<id>": { "poses": ["attack","hurt","skill","ult"] } }
 *    → 优先使用 /art/valkyrie/{id}.webp
 * 2. 未收录/文件缺失 → 程序化占位立绘(内联 SVG,日漫画风)
 * 用户可随时将自制立绘放到 public/art/valkyrie/{id}.webp 并更新 portraits.json 即可生效。
 */

const HAS_PORTRAIT: Record<string, boolean | { poses?: string[] }> =
  portraits as Record<string, boolean | { poses?: string[] }>;

const svgCache = new Map<number, string>();

/** 立绘 URL:正式立绘优先,缺失回退占位 SVG dataURL */
export function portraitUrl(id: number): string {
  if (HAS_PORTRAIT[String(id)]) return `/art/valkyrie/${id}.webp`;
  let url = svgCache.get(id);
  if (!url) {
    url = buildPlaceholderSvg(id);
    svgCache.set(id, url);
  }
  return url;
}

/** 动作立绘 URL(attack/hurt/skill/ult);无该动作时回退主立绘 */
export function poseUrl(id: number, pose: string): string {
  const entry = HAS_PORTRAIT[String(id)];
  if (entry && typeof entry === "object" && entry.poses?.includes(pose)) {
    return `/art/valkyrie/${id}_${pose}.webp`;
  }
  return portraitUrl(id);
}

/** 占位立绘(SVG 生成,320×400 竖版日漫风) */
export function buildPlaceholderSvg(id: number): string {
  const v = getValkById(id);
  const name = v?.c ?? "???";
  const dark = !!v?.look.dark;
  const attr = v?.attr ?? "safety";
  const ac = ATTR_COLORS[attr];
  const L = v?.look ?? {
    hair: "bob",
    hairColor: "#5a4632",
    eyeColor: "#4a9e6f",
    skin: "#ffe8dc",
    outfit: "#3fa97f",
  };
  const eye = dark ? "#ff3b5f" : L.eyeColor;
  const skin = dark ? "#d8c8e8" : L.skin;
  const nameSize = name.length > 4 ? 20 : 26;

  const backHair = (() => {
    switch (L.hair) {
      case "long":
        return `<path d="M100 162 C100 96 220 96 220 162 L233 302 C233 324 87 324 87 302 Z" fill="${L.hairColor}"/>`;
      case "bob":
        return `<path d="M108 142 C104 100 216 100 212 142 L214 218 C214 248 106 248 106 218 Z" fill="${L.hairColor}"/>`;
      case "twin":
        return `<path d="M108 132 C98 192 94 258 94 300 C94 318 128 318 128 300 C128 236 130 178 134 140 Z" fill="${L.hairColor}"/>
          <path d="M212 132 C222 192 226 258 226 300 C226 318 192 318 192 300 C192 236 190 178 186 140 Z" fill="${L.hairColor}"/>
          <circle cx="111" cy="296" r="9" fill="${ac}"/><circle cx="209" cy="296" r="9" fill="${ac}"/>`;
      case "ponytail":
        return `<path d="M204 158 C242 190 254 252 250 302 C249 320 219 320 221 302 C224 244 216 190 198 150 Z" fill="${L.hairColor}"/>
          <circle cx="224" cy="238" r="8" fill="${ac}"/>`;
      default: // short: 无后发,仅前发
        return "";
    }
  })();

  const frontHair = (() => {
    switch (L.hair) {
      case "short":
        return `<path d="M110 162 C106 102 214 102 210 162 C206 130 194 118 160 118 C126 118 114 130 110 162 Z" fill="${L.hairColor}"/>`;
      case "bob":
        return `<path d="M114 154 C112 108 208 108 206 154 C204 120 172 112 160 112 C148 112 116 120 114 154 Z" fill="${L.hairColor}"/>`;
      case "twin":
        return `<path d="M114 152 C118 108 202 108 206 152 C190 130 170 124 160 124 C150 124 130 130 114 152 Z" fill="${L.hairColor}"/>`;
      default: // long / ponytail: 中分刘海
        return `<path d="M113 150 C128 106 192 106 207 150 C207 124 160 116 160 116 C160 116 113 124 113 150 Z" fill="${L.hairColor}"/>`;
    }
  })();

  const darkOverlay = dark
    ? `<rect x="0" y="0" width="320" height="356" fill="#1a102a" opacity="0.55"/>`
    : "";

  const svg = `<svg width="320" height="400" viewBox="0 0 320 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ac}" stop-opacity="0.34"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${ac}" stop-opacity="0.22"/>
    </linearGradient>
  </defs>
  <rect width="320" height="400" rx="22" fill="url(#bg)"/>
  <circle cx="160" cy="180" r="112" fill="${ac}" opacity="0.16"/>
  ${backHair}
  <path d="M118 400 L123 298 Q160 268 197 298 L202 400 Z" fill="${L.outfit}"/>
  <path d="M123 298 Q160 270 197 298 L184 316 Q160 298 136 316 Z" fill="#ffffff" opacity="0.85"/>
  <rect x="151" y="226" width="18" height="36" rx="6" fill="${skin}"/>
  <ellipse cx="160" cy="178" rx="46" ry="50" fill="${skin}"/>
  ${frontHair}
  ${darkOverlay}
  <ellipse cx="138" cy="180" rx="7.5" ry="9.5" fill="#fff"/>
  <ellipse cx="182" cy="180" rx="7.5" ry="9.5" fill="#fff"/>
  <circle cx="139" cy="181" r="4.6" fill="${eye}"/>
  <circle cx="183" cy="181" r="4.6" fill="${eye}"/>
  <circle cx="140.6" cy="179.4" r="1.5" fill="#fff"/>
  <circle cx="184.6" cy="179.4" r="1.5" fill="#fff"/>
  <ellipse cx="127" cy="198" rx="7" ry="4" fill="#ff9fb8" opacity="0.4"/>
  <ellipse cx="193" cy="198" rx="7" ry="4" fill="#ff9fb8" opacity="0.4"/>
  <path d="M152 204 Q160 210 168 204" stroke="#c98a7a" stroke-width="3" fill="none" stroke-linecap="round"/>
  <rect x="0" y="354" width="320" height="46" fill="${ac}" opacity="0.92"/>
  <text x="160" y="386" text-anchor="middle" font-size="${nameSize}" font-weight="600" fill="#fff" font-family="'PingFang SC','Microsoft YaHei',sans-serif">${name}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
