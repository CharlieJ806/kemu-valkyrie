"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { VALKYRIES } from "@/data";
import { getValkName } from "@/lib/formulas";
import { hydrateCard } from "@/lib/cards";
import { sanitizePvpDeck } from "@/lib/pvp";
import { usePvpStore, pvpHostTick, pvpGuestTick } from "@/lib/pvp-store";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import type { PvpState } from "@/lib/pvp";

const Q_TIME_MS = 15000;

/** 血条(对战双方共用) */
function HpBar({ f, label, me }: { f: PvpState["host"]; label: string; me: boolean }) {
  return (
    <div className="pvp-fighter">
      <div className="pvp-f-name" style={me ? { color: "var(--green)" } : undefined}>
        {label} · {f.name}
      </div>
      <div className="pvp-hp-bar">
        <i
          style={{
            width: `${Math.max(0, (f.hp / Math.max(1, f.maxHp)) * 100)}%`,
            background: me ? "var(--green)" : "var(--red)",
          }}
        />
      </div>
      <div className="pvp-f-stat">
        ❤️{Math.ceil(f.hp)}/{f.maxHp}
        {f.block > 0 ? ` 🛡️${f.block}` : ""}
        {f.combo > 0 ? ` 🔥${f.combo}` : ""}
      </div>
    </div>
  );
}

export default function PvpScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);

  const mode = usePvpStore((s) => s.mode);
  const side = usePvpStore((s) => s.side);
  const room = usePvpStore((s) => s.room);
  const peer = usePvpStore((s) => s.peer);
  const st = usePvpStore((s) => s.st);
  const info = usePvpStore((s) => s.info);
  const remainMs = usePvpStore((s) => s.remainMs);
  const requestJoin = usePvpStore((s) => s.requestJoin);
  const hostStart = usePvpStore((s) => s.hostStart);
  const act = usePvpStore((s) => s.act);
  const leave = usePvpStore((s) => s.leave);

  // 本地 UI 态:昵称/学员/房码输入
  const [name, setName] = useState("");
  const [valkId, setValkId] = useState(1);
  const [roomIn, setRoomIn] = useState("");

  const myName = name.trim() || getValkName(valkId);
  const myCfg = {
    name: myName,
    valkId,
    deck: (meta.builtDeckIds || []).filter((id) => meta.ownedCards?.[id]),
  };

  // 250ms tick:宿主超时判定 / 客机倒计时递减
  useEffect(() => {
    if (mode !== "battle") return;
    const host = side === "host";
    const t = setInterval(() => (host ? pvpHostTick() : pvpGuestTick()), 250);
    return () => clearInterval(t);
  }, [mode, side]);

  // 答错/超时展示 900ms 后自动进入出牌阶段
  useEffect(() => {
    if (mode !== "battle" || !st || st.turn !== side || st.phase !== "question") return;
    if (!st.answered || st.answered.correct) return;
    const t = setTimeout(() => act({ act: "enterCard" }), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.answered, st?.phase, st?.round, mode, side]);

  useEffect(() => {
    return () => {
      usePvpStore.getState().leave("已离开对战");
    };
  }, []);

  const joinRoom = (code: string) => {
    requestJoin(code, myName, myCfg);
  };

  /* ================= 大厅/房间 ================= */
  if (mode !== "battle" || !st) {
    return (
      <section className="screen active" id="scr-pvp">
        <div className="title-inner" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
          <div className="set-row">
            <button
              className="btn btn-ghost"
              onClick={() => {
                AudioEngine.sfx("click");
                leave("已离开对战");
                setScreen("title");
              }}
            >
              ← 返回
            </button>
            <div style={{ fontWeight: 800, flex: 1, textAlign: "center" }}>⚔️ 对战大厅</div>
            <span style={{ width: 60 }} />
          </div>

          {mode === "idle" ? (
            <>
              <div className="set-row">
                <span>昵称</span>
                <input
                  className="search-input"
                  style={{ maxWidth: 160 }}
                  placeholder={getValkName(valkId)}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 8))}
                />
              </div>
              <div className="pvp-valk-grid">
                {VALKYRIES.map((v) => (
                  <div
                    key={v.id}
                    className={`pvp-valk-cell ${valkId === v.id ? "active" : ""}`}
                    onClick={() => {
                      AudioEngine.sfx("click");
                      setValkId(v.id);
                    }}
                  >
                    <img src={ICON(v.id)} alt={v.c} />
                    <div>{v.c}</div>
                  </div>
                ))}
              </div>
              <div className="pvp-note">
                出战学员任选 · 牌组使用当前构建({sanitizePvpDeck(myCfg.deck).length}张)
              </div>
              <div className="set-row">
                <span>房间码</span>
                <input
                  className="search-input"
                  style={{ maxWidth: 120, textTransform: "uppercase" }}
                  placeholder="4位房码"
                  value={roomIn}
                  onChange={(e) => setRoomIn(e.target.value.toUpperCase().slice(0, 4))}
                />
              </div>
              <div className="pvp-btns">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    AudioEngine.sfx("click");
                    const code =
                      roomIn ||
                      Array.from({ length: 4 }, () =>
                        "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)],
                      ).join("");
                    setRoomIn(code);
                    joinRoom(code);
                  }}
                >
                  🌐 创建房间
                </button>
                <button
                  className="btn"
                  disabled={roomIn.length !== 4}
                  onClick={() => {
                    AudioEngine.sfx("click");
                    joinRoom(roomIn);
                  }}
                >
                  🔑 加入房间
                </button>
              </div>
            </>
          ) : (
            <div className="pvp-room">
              <div className="pvp-room-code">{room}</div>
              <div className="pvp-note">
                {peer
                  ? `对手:${peer.name}(${getValkName(peer.valkId)})`
                  : "把房码告诉对手,等待加入…"}
              </div>
              {side === "host" ? (
                <button
                  className="btn btn-primary"
                  disabled={!peer}
                  onClick={() => {
                    if (!peer) return;
                    hostStart(
                      { name: myName, valkId, deck: myCfg.deck },
                      { name: peer.name, valkId: peer.valkId, deck: peer.deck },
                    );
                  }}
                >
                  {peer ? "⚔️ 开始对战" : "等待对手…"}
                </button>
              ) : (
                <div className="pvp-note">等待房主开始对战…</div>
              )}
              <button className="btn-mini" onClick={() => leave("已离开房间")}>
                离开房间
              </button>
            </div>
          )}

          {info ? <div className="pvp-info">{info}</div> : null}
        </div>
      </section>
    );
  }

  /* ================= 对战中 ================= */
  const me = side === "host" ? st.host : st.guest;
  const opp = side === "host" ? st.guest : st.host;
  const myTurn = st.turn === side && !st.winner;
  const handCards = me.hand.map((id) => hydrateCard(id));

  return (
    <section className="screen active" id="scr-pvp">
      <div className="battle-topbar">
        <HpBar f={me} label="我方" me />
        <div className="pvp-round">第 {st.round} 回合</div>
        <HpBar f={opp} label="对方" me={false} />
      </div>

      <div className="pvp-stage">
        <img className="pvp-opp-sprite" src={ICON(opp.valkId)} alt={opp.name} />
        <img className="pvp-me-sprite" src={ICON(me.valkId)} alt={me.name} />
        {st.lastFx.length > 0 && (
          <div className="pvp-fx-list">
            {st.lastFx.slice(-4).map((fx, i) => (
              <div key={i} style={{ color: fx.color }}>
                {fx.side === side ? "我方" : "对方"} {fx.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {st.winner ? (
        <div className="modal-wrap">
          <div className="modal">
            <div className="capture-title">
              {st.winner === side ? "🏆 对战胜利！" : "💀 惜败…"}
            </div>
            <div style={{ fontSize: 12, color: "var(--dim)", margin: "8px 0" }}>
              {st.round} 回合 · 我方最大连击 {me.maxCombo}
            </div>
            <button className="btn btn-primary" onClick={() => leave("对战结束")}>
              返回大厅
            </button>
          </div>
        </div>
      ) : myTurn ? (
        <>
          <div className="battle-q-area" style={{ opacity: st.phase === "card" ? 0.4 : 1 }}>
            {st.phase === "question" ? (
              <>
                <div
                  className={`battle-timer ${remainMs <= Math.min(5000, Q_TIME_MS * 0.3) ? "low" : ""}`}
                >
                  <div
                    className="battle-timer-fill"
                    style={{ width: `${(remainMs / Q_TIME_MS) * 100}%` }}
                  />
                  <span className="battle-timer-text">
                    ⏱ {Math.ceil(remainMs / 1000)}s · ⚡{st.turnCorrect}
                  </span>
                </div>
                <div className="battle-q-scroll">
                  <div className="battle-q-text">{st.currentQ?.q ?? "准备答题..."}</div>
                  <div className="battle-options">
                    {st.currentQ?.opts.map((opt, i) => (
                      <button
                        key={i}
                        className={
                          "battle-opt-btn" +
                          (st.answered && st.answered.pick === i ? " wrong" : "") +
                          (st.qLocked && i === st.currentQ?.ans ? " reveal" : "") +
                          (st.qLocked ? " disabled" : "")
                        }
                        disabled={st.qLocked}
                        onClick={() => {
                          AudioEngine.sfx("click");
                          act({ act: "answer", pick: i });
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="battle-q-text">📝 出牌阶段 — 点击手牌使用技能</div>
            )}
          </div>

          <div
            className="hand-area"
            style={{ display: st.phase === "question" ? "none" : undefined }}
          >
            {handCards.length === 0 ? (
              <div
                style={{ color: "var(--dim)", fontSize: 10, textAlign: "center", width: "100%", padding: 12 }}
              >
                手牌已空 — 结束回合
              </div>
            ) : (
              handCards.map((card, i) =>
                card ? (
                  <div
                    key={`${card.id}-${i}`}
                    className={
                      "hand-card type-" + card.type + (me.energy < card.cost ? " unaffordable" : "")
                    }
                    onClick={() => {
                      AudioEngine.sfx("click");
                      act({ act: "play", handIdx: i });
                    }}
                  >
                    <div className="card-cost">{card.cost}</div>
                    <div className="card-icon">{card.icon}</div>
                    <div className="card-name">{card.name}</div>
                    <div className="card-desc">{card.desc}</div>
                  </div>
                ) : null,
              )
            )}
          </div>

          <div className="battle-actions">
            <div className="energy-display">⚡ {me.energy}</div>
            {st.phase === "question" ? (
              <button
                className="end-turn-btn"
                disabled={!st.qLocked && st.turnCorrect === 0}
                onClick={() => {
                  AudioEngine.sfx("click");
                  act({ act: "enterCard" });
                }}
              >
                ⏹ 停止答题
              </button>
            ) : (
              <button
                className="end-turn-btn"
                onClick={() => {
                  AudioEngine.sfx("click");
                  act({ act: "endTurn" });
                }}
              >
                ▶ 结束回合
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="pvp-wait">
          {st.skipNote && st.turn === side ? st.skipNote : `⏳ 对方行动中(${
            st.phase === "question" ? "答题阶段" : "出牌阶段"
          })…`}
        </div>
      )}
    </section>
  );
}
