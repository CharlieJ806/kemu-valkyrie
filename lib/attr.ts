import type { CSSProperties } from "react";
import type { AttrKey } from "@/data";

/** 科目一四大板块的展示常量(徽章/立绘/文案共用) */
export const ATTR_NAMES: Record<AttrKey, string> = {
  law: "法律法规",
  signal: "交通信号",
  safety: "安全驾驶",
  civility: "文明驾驶",
};

export const ATTR_SHORT: Record<AttrKey, string> = {
  law: "法规",
  signal: "信号",
  safety: "安全",
  civility: "文明",
};

export const ATTR_COLORS: Record<AttrKey, string> = {
  law: "#b0483f",
  signal: "#e0a13c",
  safety: "#3fa97f",
  civility: "#e86f8f",
};

/** 板块徽章行内样式(Phase 5 会补 .attr-badge-* CSS 类) */
export function attrBadgeStyle(attr: AttrKey): CSSProperties {
  const c = ATTR_COLORS[attr];
  return {
    background: `${c}22`,
    color: c,
    border: `1px solid ${c}88`,
    borderRadius: 999,
    padding: "1px 8px",
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}
