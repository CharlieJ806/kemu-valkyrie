"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store";
import { ALL_CARDS, CARD_CAT_NAMES } from "@/lib/cards";
import { DECK_MAX, RARITY_NAMES } from "@/data/constants";
import { AudioEngine } from "@/lib/audio";

type DeckFilter = "all" | "collected" | "locked";

export default function DeckBuildScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const toggleDeckCard = useGameStore((s) => s.toggleDeckCard);
  const resetBuiltDeck = useGameStore((s) => s.resetBuiltDeck);
  const [filter, setFilter] = useState<DeckFilter>("all");

  const built = meta.builtDeckIds || [];
  const owned = new Set(
    Object.keys(meta.ownedCards || {}).filter((id) => meta.ownedCards?.[id]),
  );

  const pool = ALL_CARDS.filter((c) => {
    if (filter === "collected" && !owned.has(c.id)) return false;
    if (filter === "locked" && owned.has(c.id)) return false;
    return true;
  });

  return (
    <section className="screen active" id="scr-deckbuild">
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
          <div style={{ fontWeight: 800 }}>
            构建牌组 {built.length}/{DECK_MAX}
          </div>
          <button
            className="btn-mini"
            onClick={() => {
              AudioEngine.sfx("click");
              resetBuiltDeck();
            }}
          >
            清空
          </button>
        </div>

        {/* 已选卡牌 */}
        <div className="deck-active">
          {built.length === 0 ? (
            <div style={{ color: "var(--dim)", fontSize: 12 }}>牌组为空</div>
          ) : (
            built.map((id, idx) => {
              const c = ALL_CARDS.find((x) => x.id === id);
              if (!c) return null;
              return (
                <div
                  key={`${id}-${idx}`}
                  className="deck-chip"
                  onClick={() => {
                    AudioEngine.sfx("click");
                    toggleDeckCard(id);
                  }}
                >
                  {c.icon} {c.name}
                </div>
              );
            })
          )}
        </div>

        <div className="dex-filter">
          {(["all", "collected", "locked"] as DeckFilter[]).map((f) => (
            <button
              key={f}
              className={`chip ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "全部" : f === "collected" ? "已收集" : "未解锁"}
            </button>
          ))}
        </div>

        <div className="deck-pool">
          {pool.map((c) => {
            const inDeck = built.includes(c.id);
            const has = owned.has(c.id);
            return (
              <div
                key={c.id}
                className={`deck-pick-card ${inDeck ? "in-deck" : ""} ${
                  !has ? "locked" : ""
                }`}
                onClick={() => {
                  if (!has) return;
                  AudioEngine.sfx("click");
                  toggleDeckCard(c.id);
                }}
              >
                <div style={{ fontSize: 22 }}>{c.icon}</div>
                <div className="dp-name">{c.name}</div>
                <div className="dp-meta">
                  {CARD_CAT_NAMES[c.cat] || c.type} · 费{c.cost} ·{" "}
                  {RARITY_NAMES[c.rarity]}
                  {!has ? " · 未拥有" : inDeck ? " · 已在牌组" : ""}
                </div>
                <div className="dp-meta" style={{ marginTop: 4 }}>
                  {c.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
