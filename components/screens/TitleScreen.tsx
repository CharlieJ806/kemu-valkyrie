"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { getValkName } from "@/lib/formulas";
import { ICON } from "@/lib/icon";
import { VALKYRIES } from "@/data";
import { AudioEngine } from "@/lib/audio";

export default function TitleScreen() {
  const meta = useGameStore((s) => s.meta);
  const hasSave = useGameStore((s) => s.hasSave);
  const setScreen = useGameStore((s) => s.setScreen);
  const continueRun = useGameStore((s) => s.continueRun);

  // 封面飘动学员:每 5s 从已结识名册随机换一位(名册为空时兜底展示全体学员)
  const [titlePkmId, setTitlePkmId] = useState(1);
  useEffect(() => {
    const ids = Object.keys(meta.collected).map(Number);
    const pool = ids.length > 0 ? ids : VALKYRIES.map((v) => v.id);
    const pick = () => {
      setTitlePkmId((prev) => {
        let next = pool[Math.floor(Math.random() * pool.length)]!;
        if (pool.length > 1) {
          let guard = 0;
          while (next === prev && guard++ < 8) {
            next = pool[Math.floor(Math.random() * pool.length)]!;
          }
        }
        return next;
      });
    };
    pick();
    const t = setInterval(pick, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(meta.collected).length]);

  const go = (id: string) => {
    AudioEngine.sfx("click");
    setScreen(id as never);
  };

  const startNew = () => {
    AudioEngine.sfx("click");
    // 首次游玩:进初始选择;之后直接使用名册配置的队伍开局
    const firstTime =
      Object.keys(meta.collected).length === 0 && meta.team.length === 0;
    if (firstTime) {
      setScreen("starter");
    } else {
      useGameStore.getState().newRun();
    }
  };

  return (
    <section className="screen active" id="scr-title">
      <div className="title-bg">
        <div className="title-grid" />
        <div className="title-glow" />
      </div>
      <div className="title-inner">
        <div className="title-logo">
          <div className="logo-top">驾考女武神</div>
          <div className="logo-sub">交规里世界净化战</div>
          <div className="logo-tag">答题 · 组牌 · 点火觉醒</div>
        </div>
        <div className="title-pkmn">
          {ICON(titlePkmId) ? (
            <img key={titlePkmId} src={ICON(titlePkmId)} alt={getValkName(titlePkmId)} />
          ) : null}
        </div>

        <div className="title-stats">
          <div>🏆 最佳记录: {meta.bestScore > 0 ? `${meta.bestScore} 分 (第${meta.bestFloor}街区)` : "暂无"}</div>
          <div>📖 名册: {Object.keys(meta.collected).length} / {VALKYRIES.length}</div>
          <div>💰 金币: {meta.metaGold}</div>
        </div>

        <div className="title-team">
          当前队伍:
          {meta.team.length > 0 ? (
            meta.team.map((id) => (
              <span key={id} className="title-team-poke">
                {ICON(id) ? (
                  <img src={ICON(id)} alt="" />
                ) : (
                  <span>👾</span>
                )}
                <em>{getValkName(id)}</em>
              </span>
            ))
          ) : (
            <span className="title-team-empty">尚未配置 — 在学员名册中选择</span>
          )}
        </div>

        <div className="title-menu">
          <button className="btn btn-primary" onClick={startNew}>
            🚗 新的冒险
          </button>
          <button
            className="btn"
            disabled={!hasSave()}
            onClick={() => {
              AudioEngine.sfx("click");
              continueRun();
            }}
          >
            📂 继续冒险
          </button>
        </div>

        <div className="title-menu-extra">
          <button className="btn-mini" onClick={() => go("train")}>🔧 特训</button>
          <button className="btn-mini" onClick={() => go("gacha")}>🎴 技能补给箱</button>
          <button className="btn-mini" onClick={() => go("deckbuild")}>🃏 构建牌组</button>
          <button className="btn-mini" onClick={() => go("dex")}>📖 学员名册</button>
          <button className="btn-mini" onClick={() => go("bank")}>📚 题库复习</button>
          <button className="btn-mini" onClick={() => go("study")}>🏫 学习中心</button>
          <button className="btn-mini" onClick={() => go("settings")}>⚙️ 设置</button>
        </div>

        <div className="title-foot">
          驾考之城被「违章之暗」侵蚀——作为驾校学员，与女武神并肩作战，<br />
          用科目一知识净化里世界！拔剑点火 · 净化魔物 · 组牌通关
        </div>
      </div>
    </section>
  );
}
