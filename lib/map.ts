import { NODE_ICONS } from "./formulas";
import {
  enemyPoolForNode,
  generateRewardsFor,
  getRandomPokemon,
} from "./formulas";
import type { MapNode, NodeType } from "./types";

/** 生成一层的列节点地图(迁移自 standalone game.js generateMapNodes) */
export function generateMapNodes(floor: number): MapNode[][] {
  const nodes: MapNode[][] = [];
  const cols = Math.min(4 + floor, 7);
  const rows = 3;

  for (let col = 0; col < cols; col++) {
    const colNodes: MapNode[] = [];
    const numInCol = col === 0 || col === cols - 1 ? 1 : rand(2, rows);
    const availableRows = [...Array(rows).keys()];

    for (let i = 0; i < numInCol; i++) {
      const rowIdx = Math.floor(Math.random() * availableRows.length);
      const row = availableRows.splice(rowIdx, 1)[0]!;

      let type: NodeType;
      if (col === 0) type = "battle";
      else if (col === cols - 1) type = "boss";
      else {
        const weights = { battle: 40, elite: 10, shop: 15, rest: 15, event: 10, treasure: 10 };
        type = weightedPick(weights);
      }

      colNodes.push({
        id: `n_${floor}_${col}_${row}`,
        type,
        col,
        row,
        enemyPkm: getRandomPokemon(enemyPoolForNode(type)),
        visited: false,
        reachable: col === 0,
        rewards: generateRewardsFor(type),
      });
    }
    nodes.push(colNodes);
  }
  return nodes;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick(weights: Record<string, number>): NodeType {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [t, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return t as NodeType;
  }
  return "battle";
}

/* ============ Canvas 布局与绘制(迁移自 standalone renderDungeonMap) ============ */

const NODE_R = 18;
const PAD_EXTRA = 16;
const TOP_CHROME = 36;
const BOTTOM_CHROME = 18;

export type MapLayout = {
  nodeX: (col: number) => number;
  nodeY: (row: number) => number;
  nodeR: number;
  topPad: number;
};

export function computeLayout(
  W: number,
  H: number,
  dpr: number,
  colCount: number,
): MapLayout {
  const nodeR = NODE_R * dpr;
  const padExtra = PAD_EXTRA * dpr;
  const topChrome = TOP_CHROME * dpr;
  const bottomChrome = BOTTOM_CHROME * dpr;
  const marginX = Math.max(50 * dpr, nodeR + padExtra + 8 * dpr);
  const marginY = Math.max(72 * dpr, nodeR + padExtra + topChrome * 0.5);
  const topPad = marginY + topChrome * 0.25;
  const botPad = marginY + bottomChrome * 0.25;
  const usableH = Math.max(1, H - topPad - botPad);
  const usableW = Math.max(1, W - marginX * 2);
  const colW = usableW / (colCount - 1 || 1);
  const rowSpan = 2;
  return {
    nodeR,
    topPad,
    nodeX: (col) => marginX + col * colW,
    nodeY: (row) => topPad + (row / rowSpan) * usableH,
  };
}

/* 地图节点像素图标缓存(/art/ui/item-*.webp,迁移自参考工程 NODE_ICON) */
const NODE_IMG_CACHE = new Map<string, HTMLImageElement>();

function nodeImage(path: string): HTMLImageElement | null {
  let img = NODE_IMG_CACHE.get(path);
  if (!img) {
    img = new Image();
    img.src = path;
    NODE_IMG_CACHE.set(path, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** 绘制地图(迁移自 standalone renderDungeonMap;返回布局供命中检测) */
export function renderMap(
  canvas: HTMLCanvasElement,
  mapNodes: MapNode[][],
  currentNodeIdx: number,
  floor: number,
): MapLayout | null {
  if (!mapNodes || mapNodes.length === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;
  const layout = computeLayout(canvas.width, canvas.height, dpr, mapNodes.length);
  const { nodeX, nodeY, nodeR, topPad } = layout;

  // 透明背景(背景图由 .screen::before 提供,canvas 只画节点连线)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 连线
  ctx.lineWidth = 2 * dpr;
  for (let c = 0; c < mapNodes.length - 1; c++) {
    for (const nodeA of mapNodes[c]!) {
      for (const nodeB of mapNodes[c + 1]!) {
        const x1 = nodeX(nodeA.col);
        const y1 = nodeY(nodeA.row);
        const x2 = nodeX(nodeB.col);
        const y2 = nodeY(nodeB.row);
        const bothVisited = nodeA.visited && nodeB.visited;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (bothVisited) ctx.strokeStyle = "#a8c0da";
        else if (nodeA.visited && nodeB.reachable) ctx.strokeStyle = "#00b4d8";
        else ctx.strokeStyle = "#bcd8ef";
        ctx.stroke();
      }
    }
  }

  // 节点
  for (const col of mapNodes) {
    for (const node of col) {
      const x = nodeX(node.col);
      const y = nodeY(node.row);

      ctx.beginPath();
      ctx.arc(x, y, nodeR, 0, Math.PI * 2);
      if (node.visited) {
        ctx.fillStyle = "#dcebfa";
        ctx.strokeStyle = "#8fc4a0";
      } else if (node.reachable) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#00b4d8";
        ctx.shadowColor = "#00b4d8";
        ctx.shadowBlur = 12 * dpr;
      } else {
        ctx.fillStyle = "#f4f9ff";
        ctx.strokeStyle = "#bcd8ef";
      }
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      // 节点图标:像素素材(canvas 绘制);未加载完成前画占位点
      const icon = nodeImage(NODE_ICONS[node.type] || "");
      if (icon) {
        const s = nodeR * 1.2;
        ctx.drawImage(icon, x - s / 2, y - s / 2, s, s);
      } else {
        ctx.fillStyle = node.visited ? "#9db6d2" : node.reachable ? "#17314f" : "#b8cbe0";
        ctx.beginPath();
        ctx.arc(x, y, nodeR * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      if (node.visited && node.col === currentNodeIdx) {
        ctx.beginPath();
        ctx.arc(x, y, nodeR + 4 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = "#00c48c";
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();
      }
    }
  }

  // 楼层标签
  ctx.fillStyle = "#6b87a8";
  ctx.font = `${11 * dpr}px "Noto Sans SC","Microsoft YaHei",sans-serif`;
  ctx.fillText(
    `第 ${floor} 层 - 选择路径前进`,
    canvas.width / 2,
    Math.max(14 * dpr, topPad * 0.35),
  );

  return layout;
}

/** 命中检测:返回可达且未访问的节点下标 [col, node] */
export function hitTest(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  mapNodes: MapNode[][],
  layout: MapLayout,
): { col: number; node: MapNode } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (clientX - rect.left) * scaleX;
  const my = (clientY - rect.top) * scaleY;

  for (let c = 0; c < mapNodes.length; c++) {
    for (const node of mapNodes[c]!) {
      if (!node.reachable || node.visited) continue;
      const x = layout.nodeX(node.col);
      const y = layout.nodeY(node.row);
      const dist = Math.hypot(mx - x, my - y);
      if (dist <= layout.nodeR + 8) {
        return { col: c, node };
      }
    }
  }
  return null;
}

/** 选中节点:标记访问/可达性更新(迁移自 standalone selectMapNode 前半段) */
export function applyNodeSelection(
  mapNodes: MapNode[][],
  col: number,
  node: MapNode,
): void {
  node.visited = true;

  for (const sameColNode of mapNodes[col]!) {
    if (sameColNode !== node) {
      sameColNode.reachable = false;
      sameColNode.visited = true;
    }
  }

  for (let c = 0; c < col; c++) {
    for (const prevNode of mapNodes[c]!) {
      prevNode.reachable = false;
      if (!prevNode.visited) prevNode.visited = true;
    }
  }

  if (col + 1 < mapNodes.length) {
    for (const nextNode of mapNodes[col + 1]!) {
      nextNode.reachable = true;
    }
  }
}
