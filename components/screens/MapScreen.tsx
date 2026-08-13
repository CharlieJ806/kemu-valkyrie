"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { hitTest, renderMap, type MapLayout } from "@/lib/map";
import { NODE_ICONS } from "@/lib/formulas";
import { hydrateCardList } from "@/lib/cards";
import { AudioEngine } from "@/lib/audio";

export default function MapScreen() {
  const run = useGameStore((s) => s.run);
  const selectNode = useGameStore((s) => s.selectNode);
  const quitToTitle = useGameStore((s) => s.quitToTitle);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<MapLayout | null>(null);
  const [deckOpen, setDeckOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container || !run) return;

    const draw = () => {
      // 用 clientWidth/clientHeight(布局尺寸),不受 screen 入场动画 transform:scale 影响
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, cw * dpr);
      canvas.height = Math.max(1, ch * dpr);
      canvas.style.width = cw + "px";
      canvas.style.height = ch + "px";
      layoutRef.current = renderMap(
        canvas,
        run.mapNodes,
        run.currentNodeIdx,
        run.floor,
      );
    };

    draw();
    // 预加载节点像素图标:素材就绪后重绘(未就绪先画占位点)
    const imgs = Object.values(NODE_ICONS).map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    let pending = imgs.length;
    const onReady = () => {
      if (--pending === 0) draw();
    };
    imgs.forEach((img) => {
      img.onload = onReady;
      img.onerror = onReady;
    });
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [run]);

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !run || !layoutRef.current) return;
    const hit = hitTest(
      canvas,
      e.clientX,
      e.clientY,
      run.mapNodes,
      layoutRef.current,
    );
    if (hit) {
      AudioEngine.sfx("click");
      selectNode(hit.col, hit.node);
    }
  };

  const handleTouch = (e: React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !run || !layoutRef.current) return;
    const t = e.changedTouches[0]!;
    const hit = hitTest(canvas, t.clientX, t.clientY, run.mapNodes, layoutRef.current);
    if (hit) {
      AudioEngine.sfx("click");
      selectNode(hit.col, hit.node);
    }
  };

  if (!run) return null;
  const deckCards = hydrateCardList(run.deck);

  return (
    <section className="screen active" id="scr-map">
      <div className="map-inner">
        <div className="map-topbar">
          <div className="map-floor">第 {run.floor} 层</div>
          <div className="map-hud">
            <span className="ball-hud-item">
              <img className="px-icon" src="/art/ui/item-ball-red.webp" alt="球" />
              {run.pokeBalls.normal || 0}
            </span>
            {(run.pokeBalls.great || 0) > 0 && (
              <span className="ball-hud-item">
                <img className="px-icon" src="/art/ui/item-ball-blue.webp" alt="球" />
                {run.pokeBalls.great}
              </span>
            )}
            {(run.pokeBalls.ultra || 0) > 0 && (
              <span className="ball-hud-item">
                <img className="px-icon" src="/art/ui/item-ball-yellow.webp" alt="球" />
                {run.pokeBalls.ultra}
              </span>
            )}
            {(run.pokeBalls.master || 0) > 0 && (
              <span className="ball-hud-item">
                <img className="px-icon" src="/art/ui/item-ball-master.webp" alt="球" />
                {run.pokeBalls.master}
              </span>
            )}
            <span>❤️{Math.ceil(run.hp)}</span>
            <span>🪙{run.gold}</span>
            <span>🏆{run.score}</span>
          </div>
          <button className="btn-mini" onClick={() => setDeckOpen((v) => !v)}>
            🃏 牌组({run.deck.length})
          </button>
        </div>

        <div className="map-canvas-wrap">
          <canvas
            ref={canvasRef}
            id="map-canvas"
            onClick={handleClick}
            onTouchEnd={handleTouch}
          />
        </div>

        {deckOpen && (
          <div className="deck-panel">
            <h3>📋 当前牌组 ({run.deck.length}张)</h3>
            <div className="deck-card-list">
              {deckCards
                .slice()
                .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
                .map((card, i) => (
                  <div key={`${card.id}-${i}`} className={`deck-mini-card type-${card.type}`}>
                    <div>{card.icon}</div>
                    <div>{card.name}</div>
                  </div>
                ))}
            </div>
            <button className="btn-mini" onClick={() => setDeckOpen(false)}>
              关闭
            </button>
          </div>
        )}

        <div className="map-legend">
          <button className="btn-ghost" onClick={() => quitToTitle()}>
            💾 保存并返回标题
          </button>
        </div>
      </div>
    </section>
  );
}
