import { portraitUrl } from "./portrait";

/** 立绘 URL for a valkyrie/monster id(正式立绘优先,占位 SVG 兜底)。 */
export function ICON(id: number): string {
  return portraitUrl(id);
}
