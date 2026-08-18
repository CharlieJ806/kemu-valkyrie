"use client";

import { useGameStore } from "@/lib/store";
import {
  getValkById,
  getBST,
  getValkAtk,
  getValkMaxHp,
  getValkRole,
  VALKYRIE_ROLE_NAMES,
} from "@/lib/formulas";
import { PVP_BALANCE } from "@/lib/pvp";
import {
  MAX_TEAM_SIZE,
  RARITY_COLORS,
  RARITY_NAMES,
} from "@/data/constants";
import { ALL_CARDS, findCard, hydrateCard } from "@/lib/cards";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import { GAME_EVENTS, resolveChoiceText } from "@/lib/events";
import { ATTR_NAMES, ATTR_SHORT, attrBadgeStyle } from "@/lib/attr";
import { getPassive } from "@/lib/valkskills";

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
  const confirmRemoveCard = useGameStore((s) => s.confirmRemoveCard);

  if (!modal) return null;

  /* ── 商店移除卡牌(自选) ── */
  if (modal.kind === "removeCard") {
    if (!run) return null;
    const counts = new Map<string, number>();
    for (const id of run.deck) counts.set(id, (counts.get(id) || 0) + 1);
    const unique = [...counts.entries()].map(([id, n]) => ({
      card: hydrateCard(id),
      n,
    }));
    return (
      <div className="modal-wrap">
        <div className="modal">
          <div className="capture-title">🗑️ 移除一张牌 (75🪙)</div>
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 10 }}>
            选择要移除的卡牌(至少保留 5 张):
          </div>
          <div className="remove-card-list">
            {unique.map(({ card, n }) =>
              card ? (
                <div
                  key={card.id}
                  className={`reward-card type-${card.type}`}
                  onClick={() => {
                    confirmRemoveCard(card.id);
                    AudioEngine.sfx("click");
                  }}
                >
                  <div style={{ fontSize: 22 }}>{card.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 10 }}>
                    {card.name}
                    {n > 1 ? ` ×${n}` : ""}
                  </div>
                  <div style={{ fontSize: 7, color: "var(--dim)" }}>
                    {card.cost}⚡ {card.desc}
                  </div>
                </div>
              ) : null,
            )}
          </div>
          <button className="btn btn-ghost" onClick={closeModal}>
            取消
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
                <div style={{ fontSize: 7, color: "var(--dim)" }}>
                  {RARITY_NAMES[card.rarity]}
                </div>
                <div style={{ fontSize: 22 }}>{card.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 10 }}>
                  {card.name}
                </div>
                <div style={{ fontSize: 7, color: "var(--dim)" }}>
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
    const isMonster = pkm.id >= 100;
    const inTeam = meta.team.includes(pkm.id);
    const isActive = meta.team.length > 0 && meta.team[0] === pkm.id;
    const teamFull = meta.team.length >= MAX_TEAM_SIZE;
    const bst = getBST(pkm.id);
    return (
      <div className="modal-wrap" onClick={closeModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className={`dex-detail-card r-${pkm.r}`}>
            <div className="capture-pkmn">
              <img src={ICON(pkm.id)} alt="" />
            </div>
            <div
              style={{ fontWeight: 800, color: isMonster ? "var(--txt)" : RARITY_COLORS[pkm.r] }}
            >
              #{pkm.id} {pkm.c}
              {pkm.boss ? " · BOSS" : ""}
            </div>
            <div
              style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}
            >
              <span className="attr-badge" style={attrBadgeStyle(pkm.attr)}>
                {ATTR_NAMES[pkm.attr]}
              </span>
              {!isMonster && (
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
              )}
            </div>
            <div
              style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, lineHeight: 1.7 }}
            >
              {isMonster ? (
                <>
                  HP: {pkm.hp} · 攻击: {pkm.atk} · 面板: {bst}
                </>
              ) : (
                <>
                  综合面板: {bst} · 定位:{" "}
                  <span style={{ color: "var(--gold)" }}>
                    {VALKYRIE_ROLE_NAMES[getValkRole(pkm.id)]}
                  </span>
                  <br />
                  <span style={{ color: "var(--gold)" }}>
                    ⚔️ 剧情属性: HP {getValkMaxHp(pkm.id, meta.metaHpLv)} · 攻击{" "}
                    {getValkAtk(pkm.id, meta.metaAtkLv)}（含养成）
                  </span>
                  <br />
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    ⚖️ 对战属性: HP {PVP_BALANCE[pkm.id]?.hp ?? 80} · 攻击{" "}
                    {PVP_BALANCE[pkm.id]?.atk ?? 2}（按定位·不受养成影响）
                  </span>
                  <br />
                  <span style={{ color: "var(--gold)" }}>
                    ⚡必杀: {pkm.ult.name || "—"}
                  </span>
                  {pkm.ult.desc ? (
                    <>
                      <br />
                      <span style={{ fontSize: 11, opacity: 0.85 }}>{pkm.ult.desc}</span>
                    </>
                  ) : null}
                  {getPassive(pkm) ? (
                    <>
                      <br />
                      <span style={{ color: "var(--cyan)" }}>
                        🛡被动: {getPassive(pkm)!.name}
                      </span>
                      <br />
                      <span style={{ fontSize: 11, opacity: 0.85 }}>
                        {getPassive(pkm)!.desc}
                      </span>
                    </>
                  ) : null}
                </>
              )}
              {pkm.flavor ? <><br />{pkm.flavor}</> : null}
              {!isMonster && inTeam ? (isActive ? "<br/>📍 出战学员" : "<br/>📍 已在队伍中") : ""}
            </div>
            {!isMonster && (
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
            )}
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
