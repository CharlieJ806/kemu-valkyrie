"use client";

import { useGameStore } from "@/lib/store";
import { ALL_CARDS, findCard } from "@/lib/cards";
import { GACHA_COST } from "@/data/constants";
import { RARITY_NAMES } from "@/data/constants";
import { AudioEngine } from "@/lib/audio";

export default function GachaScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const doGachaOnce = useGameStore((s) => s.doGachaOnce);
  const gachaLastId = useGameStore((s) => s.gachaLastId);

  const owned = Object.keys(meta.ownedCards || {}).filter(
    (id) => meta.ownedCards?.[id],
  ).length;
  const total = ALL_CARDS.length;
  const collectedAll = owned >= total;
  const lastCard = gachaLastId ? findCard(gachaLastId) : null;

  return (
    <section className="screen active" id="scr-gacha">
      <div className="title-inner" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
        <div className="set-row">
          <button
            className="btn btn-ghost"
            onClick={() => {
              AudioEngine.sfx("click");
              setScreen("title");
            }}
          >
            ← 返回
          </button>
          <div style={{ fontWeight: 800 }}>🎴 技能抽取</div>
        </div>

        <div className="set-row">
          <span>💰 养成金币</span>
          <b style={{ color: "var(--gold)" }}>{meta.metaGold}</b>
        </div>
        <div className="set-row">
          <span>已收集</span>
          <span>
            {owned}/{total}
          </span>
        </div>
        <div className="set-row">
          <span>单抽费用</span>
          <span style={{ color: "var(--gold)" }}>{GACHA_COST}</span>
        </div>

        <button
          className="btn btn-primary"
          disabled={collectedAll || meta.metaGold < GACHA_COST}
          onClick={() => {
            AudioEngine.sfx("coin");
            doGachaOnce();
          }}
        >
          {collectedAll ? "已集齐全部技能！" : `抽一张（${GACHA_COST}金）`}
        </button>

        {lastCard && (
          <div className="gacha-result">
            <div style={{ fontSize: 40 }}>{lastCard.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--cyan)" }}>
              {lastCard.name}
            </div>
            <div style={{ color: "var(--dim)", fontSize: 12 }}>
              {RARITY_NAMES[lastCard.rarity]} · {lastCard.desc}
            </div>
          </div>
        )}

        <div className="set-note">
          不会抽到重复技能。稀有度越高权重越低。
        </div>
      </div>
    </section>
  );
}
