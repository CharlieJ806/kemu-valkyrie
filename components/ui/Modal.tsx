"use client";

import { useGameStore } from "@/lib/store";
import {
  getPkmName,
  getPkmById,
  getBST,
  isTier1Legend,
  isTier2Legend,
  isMythical,
} from "@/lib/formulas";
import {
  MAX_TEAM_SIZE,
  RARITY_COLORS,
  RARITY_NAMES,
  POKE_BALLS,
} from "@/data/constants";
import { ALL_CARDS, findCard } from "@/lib/cards";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import { spawnFxText, domBurst } from "@/lib/dom-fx";
import { BattleFX } from "@/lib/fx3d";
import { GAME_EVENTS } from "@/lib/events";
import type { BallKey } from "@/lib/types";

/** 捕获动画进行中标志(防止连点/StrictMode 双触发) */
let captureInFlight = false;

export default function Modal() {
  const modal = useGameStore((s) => s.modal);
  const run = useGameStore((s) => s.run);
  const meta = useGameStore((s) => s.meta);
  const closeModal = useGameStore((s) => s.closeModal);
  const attemptCapture = useGameStore((s) => s.attemptCapture);
  const finishCapture = useGameStore((s) => s.finishCapture);
  const skipCapture = useGameStore((s) => s.skipCapture);
  const chooseRewardCard = useGameStore((s) => s.chooseRewardCard);
  const skipReward = useGameStore((s) => s.skipReward);
  const doEventChoice = useGameStore((s) => s.doEventChoice);
  const activeEventId = useGameStore((s) => s.activeEventId);
  const addToTeam = useGameStore((s) => s.addToTeam);
  const removeFromTeam = useGameStore((s) => s.removeFromTeam);
  const setActiveTeam = useGameStore((s) => s.setActiveTeam);

  if (!modal) return null;

  /* ── 捕获 ── */
  if (modal.kind === "capture") {
    if (!run) return null;
    const pkm = run.enemyPkm;
    if (!pkm) return null;
    return (
      <div className="modal-wrap" onClick={closeModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="capture-title">🎯 捕获机会！</div>
          <div className="capture-pkmn">
            {ICON(pkm.id) ? (
              <img src={ICON(pkm.id)} alt="" />
            ) : (
              <div className="pkm-img-fallback">👾</div>
            )}
          </div>
          <div
            className="capture-info"
            style={{ color: RARITY_COLORS[pkm.r] }}
          >
            {getPkmName(pkm.id)} ({RARITY_NAMES[pkm.r] || "?"})
          </div>
          <div className="ball-row-wrap">
            {(Object.keys(POKE_BALLS) as BallKey[]).map((key) => {
              const ball = POKE_BALLS[key]!;
              const count = run.pokeBalls[key] || 0;
              const rate = Math.floor((ball.rates[pkm.r] || ball.rates.c) * 100);
              return (
                <button
                  key={key}
                  className={`ball-row ${key === "master" ? "ball-master" : ""} ${
                    key === "great" ? "ball-great" : ""
                  } ${key === "ultra" ? "ball-ultra" : ""} ${
                    count <= 0 ? "empty" : ""
                  }`}
                  onClick={() => {
                    if (count <= 0 || captureInFlight) return;
                    captureInFlight = true;
                    // 同步结算结果(数据落档)
                    const res = attemptCapture(key);
                    if (!res) {
                      captureInFlight = false;
                      return;
                    }
                    // 关闭弹窗露出 3D 舞台 → 播放投球动画
                    // (captureAnimating 让 BattleScreen 保持渲染,canvas 不卸载)
                    useGameStore.getState().beginCaptureAnim();
                    AudioEngine.sfx("throwBall");
                    const layer = document.getElementById("battle-stage");
                    const finish = () => {
                      if (res.success) {
                        AudioEngine.sfx("caught");
                        if (BattleFX.ok) setTimeout(() => BattleFX.endCapture(), 400);
                        if (layer) {
                          spawnFxText(layer, 50, 38, `成功捕获 ${getPkmName(res.pkmId)}！`, "#ffd700");
                          domBurst(layer, 50, 40, "#ffd700", 26);
                        }
                      } else {
                        AudioEngine.sfx("escape");
                        if (layer) {
                          spawnFxText(layer, 50, 38, `${getPkmName(res.pkmId)} 挣脱了精灵球，逃走了…`, "#ff8800");
                        }
                      }
                      setTimeout(() => {
                        captureInFlight = false;
                        finishCapture();
                      }, res.success ? 900 : 1200);
                    };
                    if (BattleFX.ok) {
                      BattleFX.capture({
                        result: res.success,
                        onShake: () => AudioEngine.sfx("ballShake"),
                        onAbsorbed: () => AudioEngine.sfx("ballHit"),
                        onResult: finish,
                      });
                    } else {
                      setTimeout(finish, 1200);
                    }
                  }}
                >
                  <span className="b-icon">{ball.icon}</span>
                  <span className="b-name">
                    {ball.name}
                    <span className="b-cnt">×{count}</span>
                  </span>
                  <span className="b-rate">{rate}%</span>
                </button>
              );
            })}
          </div>
          <button className="btn btn-ghost" onClick={skipCapture}>
            跳过捕获
          </button>
        </div>
      </div>
    );
  }

  /* ── 奖励选卡 ── */
  if (modal.kind === "reward") {
    if (!run) return null;
    const nodeType = modal.nodeType;
    const choices = rollRewardCards(nodeType);
    const gold = run.currentNodeIdx >= 0
      ? run.mapNodes[run.currentNodeIdx]?.find((n) => n.visited)?.rewards.gold
      : null;
    return (
      <div className="modal-wrap">
        <div className="modal">
          <div className="capture-title">
            {nodeType === "boss"
              ? "👑 BOSS战利品！"
              : nodeType === "elite"
                ? "💀 精英战利品！"
                : "🎁 战利品！"}
          </div>
          {gold != null && <div className="reward-gold">+{gold} 🪙</div>}
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 10 }}>
            选择一张卡片加入牌组:
          </div>
          <div className="reward-cards">
            {choices.map((card) => (
              <div
                key={card.id}
                className={`reward-card type-${card.type}`}
                onClick={() => {
                  chooseRewardCard(card.id);
                  AudioEngine.sfx("coin");
                }}
              >
                <div style={{ fontSize: 7, color: "var(--text2)" }}>
                  {RARITY_NAMES[card.rarity]}
                </div>
                <div style={{ fontSize: 22 }}>{card.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 10 }}>
                  {card.name}
                </div>
                <div style={{ fontSize: 7, color: "var(--text2)" }}>
                  {card.cost}⚡
                </div>
                <div style={{ fontSize: 7, lineHeight: 1.2 }}>{card.desc}</div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              skipReward();
              AudioEngine.sfx("coin");
            }}
          >
            跳过 (获得25金币)
          </button>
        </div>
      </div>
    );
  }

  /* ── 事件 ── */
  if (modal.kind === "event") {
    const evt = GAME_EVENTS.find((e) => e.id === activeEventId);
    if (!evt) return null;
    return (
      <div className="modal-wrap">
        <div className="modal">
          <div className="capture-title">❓ {evt.title}</div>
          <div
            style={{
              fontSize: 13,
              color: "var(--txt)",
              textAlign: "center",
              padding: "0 8px",
              lineHeight: 1.6,
              marginBottom: 12,
            }}
          >
            {evt.text}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {evt.choices.map((c, i) => (
              <button
                key={c.id}
                className="btn"
                onClick={() => {
                  doEventChoice(i);
                  AudioEngine.sfx("click");
                }}
              >
                {c.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── 图鉴详情 ── */
  if (modal.kind === "pkmDetail") {
    const pkm = getPkmById(modal.id);
    if (!pkm) return null;
    const inTeam = meta.team.includes(pkm.id);
    const isActive = meta.team.length > 0 && meta.team[0] === pkm.id;
    const teamFull = meta.team.length >= MAX_TEAM_SIZE;
    const bst = getBST(pkm.id);
    return (
      <div className="modal-wrap" onClick={closeModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className={`dex-detail-card r-${pkm.r}`}>
            <div className="capture-pkmn">
              {ICON(pkm.id) ? (
                <img src={ICON(pkm.id)} alt="" />
              ) : (
                <div className="pkm-img-fallback">👾</div>
              )}
            </div>
            <div
              style={{ fontWeight: 800, color: RARITY_COLORS[pkm.r] }}
            >
              #{pkm.id} {pkm.c}
            </div>
          <div
            style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, lineHeight: 1.7 }}
          >
            稀有度: {RARITY_NAMES[pkm.r]}<br />
            种族值(BST): {bst}<br />
            英文名: {pkm.n}
            {isTier1Legend(pkm.id)
              ? "<br/>👑 一级传说"
              : isTier2Legend(pkm.id)
                ? "<br/>👑 二级传说"
                : isMythical(pkm.id)
                  ? "<br/>✨ 幻之宝可梦"
                  : ""}
            {inTeam ? (isActive ? "<br/>📍 出战宝可梦" : "<br/>📍 已在队伍中") : ""}
          </div>
          <div className="m-actions">
            {inTeam ? (
              isActive ? null : (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setActiveTeam(pkm.id);
                    AudioEngine.sfx("click");
                  }}
                >
                  ⭐ 设为出战
                </button>
              )
            ) : teamFull ? (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--gold)",
                  padding: "6px 0",
                }}
              >
                队伍已满({MAX_TEAM_SIZE}只) — 先在图鉴中移出其他宝可梦
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  addToTeam(pkm.id);
                  AudioEngine.sfx("click");
                }}
              >
                ➕ 加入队伍
              </button>
            )}
            {inTeam ? (
              <button
                className="btn btn-danger"
                onClick={() => {
                  removeFromTeam(pkm.id);
                  AudioEngine.sfx("click");
                }}
              >
                ➖ 移出队伍
              </button>
            ) : null}
          </div>
          </div>
          <button className="btn btn-ghost" onClick={closeModal}>
            关闭
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/** 战利品 3 选 1(迁移自 standalone offerReward) */
function rollRewardCards(nodeType: string) {
  const pool = ALL_CARDS.filter((c) => c.rarity !== "l" || nodeType === "boss");
  const choices = [];
  for (let i = 0; i < 3; i++) {
    const weights: Record<string, number> = {
      c: 40,
      u: 35,
      r: 20,
      l: nodeType === "boss" ? 5 : 0,
    };
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let rarity = "c";
    for (const [k, w] of Object.entries(weights)) {
      r -= w;
      if (r <= 0) {
        rarity = k;
        break;
      }
    }
    const rPool = pool.filter((c) => c.rarity === rarity);
    const card =
      rPool.length > 0
        ? rPool[Math.floor(Math.random() * rPool.length)]!
        : pool[Math.floor(Math.random() * pool.length)]!;
    choices.push(card);
  }
  return choices;
}

export { findCard };
