"use client";

import { useState } from "react";
import { POKEMON } from "@/data";
import { useGameStore } from "@/lib/store";
import { MAX_TEAM_SIZE, RARITY_NAMES } from "@/data/constants";
import { getPkmName } from "@/lib/formulas";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import type { Rarity } from "@/lib/types";

type DexFilter = "all" | "collected" | "locked" | Rarity;

export default function DexScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const openModal = useGameStore((s) => s.openModal);
  const [filter, setFilter] = useState<DexFilter>("all");

  let list = POKEMON.filter((p) => p.i === 1);
  if (filter === "collected") list = list.filter((p) => meta.collected[String(p.id)]);
  else if (filter === "locked") list = list.filter((p) => !meta.collected[String(p.id)]);
  else if (["c", "u", "r", "l"].includes(filter)) list = list.filter((p) => p.r === filter);

  const collectedCount = Object.keys(meta.collected).length;

  return (
    <section className="screen active" id="scr-dex">
      <div className="title-inner" style={{ justifyContent: "flex-start", paddingTop: 24 }}>
        <div className="dex-progress">
          已收集: {collectedCount} / {POKEMON.length}
        </div>
        {/* 上阵队伍:点击已上阵的宝可梦可调整 */}
        <div className="dex-team-bar">
          <span className="dex-team-label">上阵队伍</span>
          {Array.from({ length: MAX_TEAM_SIZE }).map((_, i) => {
            const id = meta.team[i];
            const active = i === 0 && meta.team.length > 0;
            return (
              <div
                key={i}
                className={`dex-team-slot ${id ? "" : "empty"} ${active ? "active" : ""}`}
                onClick={() => {
                  if (id) {
                    AudioEngine.sfx("click");
                    openModal({ kind: "pkmDetail", id });
                  }
                }}
              >
                {id ? (
                  <>
                    {ICON(id) ? (
                      <img src={ICON(id)} alt="" />
                    ) : (
                      <div className="pkm-img-fallback">👾</div>
                    )}
                    <span className="dts-name">{getPkmName(id)}</span>
                  </>
                ) : (
                  <span className="dts-plus">＋</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="dex-filter">
          {(["all", "collected", "locked", "c", "u", "r", "l"] as DexFilter[]).map((f) => (
            <button
              key={f}
              className={`chip ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "全部" : f === "collected" ? "已收集" : f === "locked" ? "未解锁" : RARITY_NAMES[f]}
            </button>
          ))}
        </div>
        <div className="dex-grid">
          {list.map((p) => {
            const collected = !!meta.collected[String(p.id)];
            const inTeam = meta.team.includes(p.id);
            return (
              <div
                key={p.id}
                className={`dex-cell rarity-${p.r} ${collected ? "collected" : "locked"}`}
                onClick={() => {
                  if (collected) {
                    AudioEngine.sfx("click");
                    openModal({ kind: "pkmDetail", id: p.id });
                  }
                }}
              >
                <div className="dc-id">#{p.id}</div>
                {ICON(p.id) ? (
                  <img className="dc-img" src={ICON(p.id)} alt="" />
                ) : (
                  <div className="pkm-img-fallback">👾</div>
                )}
                <div className="dc-name">
                  {collected ? p.c : "???"}
                  {inTeam ? " ⭐" : ""}
                </div>
                <div className="dc-rarity">{RARITY_NAMES[p.r]}</div>
              </div>
            );
          })}
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            AudioEngine.sfx("click");
            setScreen("title");
          }}
        >
          ← 返回
        </button>
      </div>
    </section>
  );
}
