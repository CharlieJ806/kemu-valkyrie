"use client";

import { useState } from "react";
import { VALKYRIES, MONSTERS } from "@/data";
import { useGameStore } from "@/lib/store";
import { MAX_TEAM_SIZE } from "@/data/constants";
import { getValkName } from "@/lib/formulas";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";

type DexTab = "valk" | "monster";
type ValkFilter = "all" | "collected" | "locked";
type MonsterFilter = "all" | "seen" | "unseen";

export default function DexScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const openModal = useGameStore((s) => s.openModal);
  const [tab, setTab] = useState<DexTab>("valk");
  const [valkFilter, setValkFilter] = useState<ValkFilter>("all");
  const [monsterFilter, setMonsterFilter] = useState<MonsterFilter>("all");

  let valkList = VALKYRIES.filter((p) => p.i === 1);
  if (valkFilter === "collected") valkList = valkList.filter((p) => meta.collected[String(p.id)]);
  else if (valkFilter === "locked") valkList = valkList.filter((p) => !meta.collected[String(p.id)]);

  const seen = (id: number) => !!meta.seenMonsters?.[String(id)];
  const caught = (id: number) => !!meta.caughtMonsters?.[String(id)];
  let monsterList = MONSTERS;
  if (monsterFilter === "seen") monsterList = monsterList.filter((m) => seen(m.id));
  else if (monsterFilter === "unseen") monsterList = monsterList.filter((m) => !seen(m.id));

  const collectedCount = Object.keys(meta.collected).length;
  const seenCount = Object.keys(meta.seenMonsters || {}).length;
  const caughtCount = Object.keys(meta.caughtMonsters || {}).length;

  return (
    <section className="screen active" id="scr-dex">
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
          <div style={{ fontWeight: 800, flex: 1, textAlign: "center" }}>📖 学员名册</div>
        </div>
        <div className="dex-tabs">
          <button className={`chip ${tab === "valk" ? "active" : ""}`} onClick={() => setTab("valk")}>
            学员 {VALKYRIES.length}
          </button>
          <button className={`chip ${tab === "monster" ? "active" : ""}`} onClick={() => setTab("monster")}>
            魔物 {MONSTERS.length}
          </button>
        </div>

        {tab === "valk" ? (
          <>
            <div className="dex-progress">
              已结识: {collectedCount} / {VALKYRIES.length}
              <span style={{ fontSize: 11, display: "block", marginTop: 2 }}>
                通关章节解锁新学员 · 出战队伍最多 {MAX_TEAM_SIZE} 名
              </span>
            </div>
            {/* 出战队伍:点击已出战的学员可调整 */}
            <div className="dex-team-bar">
              <span className="dex-team-label">出战队伍</span>
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
                        <img src={ICON(id)} alt="" />
                        <span className="dts-name">{getValkName(id)}</span>
                      </>
                    ) : (
                      <span className="dts-plus">＋</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="dex-filter">
              {(["all", "collected", "locked"] as ValkFilter[]).map((f) => (
                <button
                  key={f}
                  className={`chip ${valkFilter === f ? "active" : ""}`}
                  onClick={() => setValkFilter(f)}
                >
                  {f === "all" ? "全部" : f === "collected" ? "已结识" : "未结识"}
                </button>
              ))}
            </div>
            <div className="dex-grid">
              {valkList.map((p) => {
                const collected = !!meta.collected[String(p.id)];
                const inTeam = meta.team.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className={`dex-cell ${collected ? "collected" : "locked"}`}
                    onClick={() => {
                      if (collected) {
                        AudioEngine.sfx("click");
                        openModal({ kind: "pkmDetail", id: p.id });
                      }
                    }}
                  >
                    <div className="dc-id">#{p.id}</div>
                    <img className="dc-img" src={ICON(p.id)} alt="" />
                    {!collected && <span className="dc-lock">🔒</span>}
                    <div className="dc-name">
                      {collected ? p.c : "???"}
                      {inTeam ? " ⭐" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="dex-progress">
              已遭遇: {seenCount} / {MONSTERS.length} · 已收服: {caughtCount} /{" "}
              {MONSTERS.filter((m) => !m.boss).length}
              <span style={{ fontSize: 11, display: "block", marginTop: 2 }}>
                击败普通魔物自动判定收服 · Boss 不可收服
              </span>
            </div>
            <div className="dex-filter">
              {(["all", "seen", "unseen"] as MonsterFilter[]).map((f) => (
                <button
                  key={f}
                  className={`chip ${monsterFilter === f ? "active" : ""}`}
                  onClick={() => setMonsterFilter(f)}
                >
                  {f === "all" ? "全部" : f === "seen" ? "已遭遇" : "未遭遇"}
                </button>
              ))}
            </div>
            <div className="dex-grid">
              {monsterList.map((m) => {
                const isSeen = seen(m.id);
                return (
                  <div
                    key={m.id}
                    className={`dex-cell ${isSeen ? "collected" : "locked"}`}
                    onClick={() => {
                      if (isSeen) {
                        AudioEngine.sfx("click");
                        openModal({ kind: "pkmDetail", id: m.id });
                      }
                    }}
                  >
                    <div className="dc-id">#{m.id}</div>
                    <img className="dc-img" src={ICON(m.id)} alt="" />
                    {!isSeen && <span className="dc-lock">🔒</span>}
                    <div className="dc-name">
                      {isSeen ? m.c : "???"}
                      {caught(m.id) ? " ✨" : ""}
                    </div>
                    {m.boss ? <div className="dc-boss">BOSS</div> : null}
                    {caught(m.id) ? <div className="dc-caught">已收服</div> : null}
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </section>
  );
}
