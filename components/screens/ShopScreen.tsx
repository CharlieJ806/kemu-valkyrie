"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store";
import { rollShopCards } from "@/lib/shop";
import { AudioEngine } from "@/lib/audio";

export default function ShopScreen() {
  const run = useGameStore((s) => s.run);
  const leaveShop = useGameStore((s) => s.leaveShop);
  const buyShopCard = useGameStore((s) => s.buyShopCard);
  const removeDeckCard = useGameStore((s) => s.removeDeckCard);
  const [stock] = useState(() => rollShopCards(4));

  if (!run) return null;

  return (
    <section className="screen active" id="scr-shop">
      <div className="shop-list">
        <div className="shop-title">🏪 补给点</div>
        <div className="shop-gold">
          当前金币: <b style={{ color: "var(--gold)" }}>{run.gold}</b> 🪙
        </div>

        <div className="shop-section">🃏 驾驶技能卡</div>
        {stock.map(({ card, price }, i) => (
          <div
            key={i}
            className={`shop-item type-${card.type} ${
              run.gold < price ? "empty" : ""
            }`}
            onClick={() => {
              AudioEngine.sfx("click");
              buyShopCard(card.id, price);
            }}
          >
            <div className="card-icon">{card.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{card.name}</div>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>{card.desc}</div>
            </div>
            <div className="shop-price">{price}🪙</div>
          </div>
        ))}
      </div>

      {/* 底部固定操作区 */}
      <div className="shop-foot">
        <button
          className="btn"
          onClick={() => {
            AudioEngine.sfx("click");
            removeDeckCard();
          }}
        >
          🗑️ 移除一张牌 (75🪙)
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            AudioEngine.sfx("click");
            leaveShop();
          }}
        >
          离开补给点
        </button>
      </div>
    </section>
  );
}
