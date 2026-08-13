"use client";

import { STARTERS, useGameStore } from "@/lib/store";
import { getBST, getPkmById, getPkmMaxHp, RARITY_CSS, RARITY_LABEL } from "@/lib/formulas";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";

export default function StarterScreen() {
  const newRun = useGameStore((s) => s.newRun);
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <section className="screen active" id="scr-starter">
      <div className="page-head">
        <h2>选择你的初始伙伴</h2>
        <p className="dim">它将陪你踏入交规地牢</p>
      </div>

      <div className="starter-row" id="starter-row">
        {STARTERS.map((s) => {
          const pkm = getPkmById(s.id);
          if (!pkm) return null;
          return (
            <div
              key={s.id}
              className="starter-card"
              onClick={() => {
                AudioEngine.sfx("caught");
                newRun(s.id);
              }}
            >
              <div className="sc-icon-wrap">
                {ICON(s.id) ? (
                  <img src={ICON(s.id)} alt="" />
                ) : (
                  <span className="sc-fallback">👾</span>
                )}
              </div>
              <div className="sc-body">
                <div className="sc-name">
                  {pkm.c}{" "}
                  <span className={`tag ${RARITY_CSS[pkm.r]}`}>
                    {RARITY_LABEL[pkm.r]}
                  </span>
                </div>
                <div className="sc-desc">{s.desc}</div>
                <div className="sc-stats">
                  初始HP {getPkmMaxHp(pkm.id, 0)} · 种族值 {getBST(pkm.id)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="btn btn-ghost"
        style={{ margin: "0 auto 18px", display: "block" }}
        onClick={() => {
          AudioEngine.sfx("click");
          setScreen("title");
        }}
      >
        ← 返回
      </button>
    </section>
  );
}
