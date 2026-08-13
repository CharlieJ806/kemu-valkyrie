"use client";

import { useGameStore } from "@/lib/store";
import {
  getValkName,
  getValkById,
  getBST,
} from "@/lib/formulas";
import {
  MAX_TEAM_SIZE,
  RARITY_COLORS,
  RARITY_NAMES,
} from "@/data/constants";
import { ALL_CARDS, findCard } from "@/lib/cards";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import { GAME_EVENTS, resolveChoiceText } from "@/lib/events";
import { ATTR_NAMES, ATTR_SHORT, attrBadgeStyle } from "@/lib/attr";

export default function Modal() {
  const modal = useGameStore((s) => s.modal);
  const run = useGameStore((s) => s.run);
  const meta = useGameStore((s) => s.meta);
  const closeModal = useGameStore((s) => s.closeModal);
  const chooseRewardCard = useGameStore((s) => s.chooseRewardCard);
  const skipReward = useGameStore((s) => s.skipReward);
  const doEventChoice = useGameStore((s) => s.doEventChoice);
  const activeEventId = useGameStore((s) => s.activeEventId);
  const addToTeam = useGameStore((s) => s.addToTeam);
  const removeFromTeam = useGameStore((s) => s.removeFromTeam);
  const setActiveTeam = useGameStore((s) => s.setActiveTeam);

  if (!modal) return null;

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
          {evt.cg && (
            <img
              className="event-cg"
              src={`/cg/${evt.cg}.webp`}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          )}
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
                {run ? resolveChoiceText(c, run) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── 学员详情 ── */
  if (modal.kind === "pkmDetail") {
    const pkm = getValkById(modal.id);
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
              style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}
            >
              <span className="attr-badge" style={attrBadgeStyle(pkm.attr)}>
                {ATTR_NAMES[pkm.attr]}
              </span>
              <span
                className="attr-badge"
                style={{
                  ...attrBadgeStyle(pkm.attr2),
                  opacity: 0.75,
                  textDecoration: "none",
                }}
                title="点火觉醒后获得"
              >
                🔑 {ATTR_SHORT[pkm.attr2]}
              </span>
            </div>
          <div
            style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, lineHeight: 1.7 }}
          >
            稀有度: {RARITY_NAMES[pkm.r]}<br />
            综合面板: {bst}<br />
            必杀: {pkm.ult.name || "—"}
            {pkm.flavor ? <><br />{pkm.flavor}</> : null}
            {inTeam ? (isActive ? "<br/>📍 出战学员" : "<br/>📍 已在队伍中") : ""}
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
                队伍已满({MAX_TEAM_SIZE}名) — 先在名册中移出其他学员
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
