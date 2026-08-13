"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { getPkmName, getPlayerAtk } from "@/lib/formulas";
import { hydrateCardList } from "@/lib/cards";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import { spawnDmg, spawnFxText, domBurst } from "@/lib/dom-fx";
import { BattleFX } from "@/lib/fx3d";
import type { Card } from "@/lib/types";

function enemyStatusText(status: { type: string; turns: number } | null): string {
  if (!status) return "";
  const names: Record<string, string> = {
    burn: "灼烧",
    para: "麻痹",
    poison: "中毒",
    sleep: "催眠",
    freeze: "冰冻",
    confuse: "混乱",
  };
  return `${names[status.type] || status.type}(${status.turns})`;
}

export default function BattleScreen() {
  const run = useGameStore((s) => s.run);
  const meta = useGameStore((s) => s.meta);
  const modal = useGameStore((s) => s.modal);
  const captureAnimating = useGameStore((s) => s.captureAnimating);
  const answer = useGameStore((s) => s.answer);
  const enterCardPhase = useGameStore((s) => s.enterCardPhase);
  const playCard = useGameStore((s) => s.playCard);
  const endTurnAction = useGameStore((s) => s.endTurnAction);
  const switchPoke = useGameStore((s) => s.switchPoke);
  const lastAnswer = useGameStore((s) => s.lastAnswer);

  const [answerState, setAnswerState] = useState<{
    picked: number;
    correct: boolean;
  } | null>(null);
  const lastProcessedRef = useRef(0);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const [fxOk, setFxOk] = useState(false);

  // 答题反馈统一走 lastAnswer(键盘 1-4 与鼠标点击同路径,id 去重)
  // ⚠️ hooks 必须在条件 return 之前,否则 React 报 hooks 数量不一致
  useEffect(() => {
    if (!lastAnswer || lastAnswer.id <= lastProcessedRef.current) return;
    if (nextTimerRef.current) return; // 等下一题期间忽略连键
    lastProcessedRef.current = lastAnswer.id;
    const res = lastAnswer;
    setAnswerState({ picked: res.pickedIdx, correct: res.correct });

    if (res.correct) {
      AudioEngine.sfx("correct");
      const stage = document.getElementById("battle-stage");
      // 玩家攻击动画:精灵前冲 + 光弹 + 命中粒子 + 受击抖动
      const crit = res.combo > 0 && res.combo % 5 === 0;
      if (BattleFX.ok) {
        BattleFX.attack("player", { crit });
        BattleFX.comboAura(res.combo);
      }
      spawnDmg(stage, 66, 34, `-${res.dmg}`, crit ? "#ffd700" : "#ff6688", crit);
      if (crit) {
        AudioEngine.sfx("crit");
        spawnFxText(stage, 66, 20, "暴击！", "#ffd700");
        if (stage) domBurst(stage, 66, 34, "#ffd700", 20);
      }
      // 答对且战斗未结束:400ms 后出下一题(守卫:仍在答题阶段)
      if (!res.enemyDead && !res.playerDead) {
        nextTimerRef.current = setTimeout(() => {
          nextTimerRef.current = null; // 执行完必须清空,否则后续作答被防抖误挡
          const st = useGameStore.getState();
          if (st.run && st.run.inBattle && st.run.turnPhase === "question") {
            st.nextBattleQuestion();
          }
          setAnswerState(null);
        }, 400);
      }
      // 击杀 → 敌方倒下动画
      if (res.enemyDead && BattleFX.ok) {
        setTimeout(() => BattleFX.ko("enemy"), 350);
      }
    } else {
      AudioEngine.sfx("wrong");
      // 答错反伤 → 敌方攻击动画
      if (BattleFX.ok) {
        BattleFX.attack("enemy", {});
      }
      spawnDmg(document.getElementById("battle-stage"), 28, 55, `-${res.counterDmg}`, "#ff0044");
      // 答错:立即进入出牌阶段(answerBattle 已调 enterCardPhase),清除高亮
      setAnswerState(null);
    }
  }, [lastAnswer]);

  // 卸载/切屏时清理计时器
  useEffect(() => {
    return () => {
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    };
  }, []);

  // 3D 战斗场景初始化(精灵入场/攻击/受击/倒下/投球捕获动画)
  // 生命周期 = 组件挂载/卸载(每场战斗重新挂载);捕获弹窗期间组件保持渲染,
  // 投球动画播完(screen 切回 map)组件卸载才 dispose。
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const ok = BattleFX.init(canvas);
    setFxOk(ok);
    if (ok) {
      BattleFX.setRunning(true);
      const st = useGameStore.getState();
      const r = st.run;
      if (r?.enemyPkm) {
        BattleFX.setPlayer(r.team[r.activeIdx] ?? 25);
        BattleFX.setEnemy(r.enemyPkm.id, r.enemyPkm.r);
      }
    }
    // 舞台尺寸变化(答题区隐藏/显示)时同步 3D 渲染尺寸,画面保持固定
    const stage = canvas.parentElement;
    const ro =
      stage instanceof Element
        ? new ResizeObserver(() => {
            if (BattleFX.ok) BattleFX.resize();
          })
        : null;
    if (ro && stage instanceof Element) ro.observe(stage);
    return () => {
      ro?.disconnect();
      BattleFX.setRunning(false);
      BattleFX.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 出战宝可梦变化 → 换人入场动画
  useEffect(() => {
    if (!fxOk || !run || !run.inBattle) return;
    BattleFX.setPlayer(run.team[run.activeIdx] ?? 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.activeIdx, run?.inBattle, fxOk]);

  // 全灭 → 玩家倒下动画
  useEffect(() => {
    if (!fxOk || !run) return;
    if (run.gameOver) {
      const t = setTimeout(() => BattleFX.ko("player"), 500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.gameOver, fxOk]);

  // 捕获弹窗/投球动画期间保持战斗场景存活(3D canvas 不卸载)
  const captureOpen = modal?.kind === "capture" || captureAnimating;
  if (!run || !run.enemyPkm) return null;
  if (!run.inBattle && !captureOpen) return null;

  const enemy = run.enemyPkm;
  const enemySprite = ICON(enemy.id);
  const handCards: Card[] = hydrateCardList(run.hand);
  const atk = getPlayerAtk(meta.metaAtkLv);

  const handleAnswer = (idx: number) => {
    if (!run.currentQ || run.turnPhase !== "question") return;
    answer(idx);
  };

  const handlePlayCard = (idx: number) => {
    const st = useGameStore.getState();
    const r = st.run;
    if (!r || r.turnPhase !== "card") return;
    const card = hydrateCardList([r.hand[idx]])[0];
    if (!card) return;
    if (r.energy < card.cost) {
      st.showToast("能量不足", 1200);
      return;
    }
    playCard(idx);
    AudioEngine.sfx("click");
    const stage = document.getElementById("battle-stage");
    // 出牌动画:攻击卡 → 玩家攻击;治疗卡 → 治愈粒子;防御卡 → 护盾光
    if (BattleFX.ok) {
      if (card.type === "atk") BattleFX.attack("player", {});
      else if (card.type === "heal") BattleFX.heal("player");
      else if (card.type === "def") BattleFX.burstAt("player", 0x66ccff, 18);
    }
    if (card.type === "atk" && stage) {
      domBurst(stage, 12, 8, "#ff5252", 12);
    }
  };

  const handleEndTurn = () => {
    if (run.turnPhase === "question") {
      // 停止答题 → 进入出牌阶段
      enterCardPhase();
      return;
    }
    endTurnAction();
    // 回合结束 → 敌方攻击动画(泄能/异常结算后)
    if (BattleFX.ok) {
      setTimeout(() => BattleFX.attack("enemy", {}), 500);
    }
  };

  return (
    <section className="screen active" id="scr-battle">
      <div className="battle-topbar">
        <div>⚔️ 战斗 · {getPkmName(enemy.id)}</div>
        <div className="battle-combo">
          {run.combo > 1 ? `🔥 x${run.combo}` : ""}
        </div>
      </div>

      <div className={`battle-stage${fxOk ? " fx-3d" : ""}`} id="battle-stage">
        {/* 3D 战斗场景(精灵入场/攻击/受击/倒下动画) */}
        <canvas ref={fxCanvasRef} id="battle-fx-canvas" />

        {/* 敌方 */}
        <div className="battle-enemy">
          <div className="enemy-sprite-wrap" style={fxOk ? { display: "none" } : {}}>
            {enemySprite ? (
              <img className="enemy-sprite" src={enemySprite} alt="" />
            ) : (
              <div className="enemy-sprite-fallback">👾</div>
            )}
          </div>
          <div className="enemy-info">
            <div className="enemy-name-inline">
              {getPkmName(enemy.id)}
              <span style={{ fontSize: 10, color: "var(--dim)" }}>
                {" "}
                {enemyStatusText(run.enemyStatus)}
              </span>
            </div>
            <div className="enemy-hp-bar">
              <div
                className="enemy-hp-fill"
                style={{
                  width: `${Math.max(
                    0,
                    (run.enemyHp / run.enemyMaxHp) * 100,
                  )}%`,
                }}
              />
            </div>
            <div className="enemy-hp-text">
              HP: {Math.max(0, Math.ceil(run.enemyHp))}/{run.enemyMaxHp}
              {run.enemyBlock > 0 ? ` 🛡️${run.enemyBlock}` : ""}
            </div>
            <div className="enemy-intent">
              {run.turnPhase === "question"
                ? run.enemyIntent
                  ? `敌方意图: 攻击 ${run.enemyIntent.damage} 伤害`
                  : "准备攻击..."
                : `⚡ ${run.energy} 能量 — 打出卡牌后结束回合`}
            </div>
          </div>
        </div>

        {/* 队伍槽:点击切换出战 */}
        <div className="team-bar">
          {run.team.map((id, i) => (
            <div
              key={id}
              title={getPkmName(id)}
              className={`team-slot ${
                i === run.activeIdx ? "active" : ""
              } ${(run.teamHp[i] || 0) <= 0 ? "fainted" : ""}`}
              onClick={() => switchPoke(i)}
            >
              {ICON(id) ? (
                <img src={ICON(id)} alt="" />
              ) : (
                <div
                  className="pkm-img-fallback"
                  style={{ width: 40, height: 34, fontSize: 18 }}
                >
                  👾
                </div>
              )}
              <div className="ts-hp">
                <i
                  style={{
                    width: `${Math.max(
                      0,
                      ((run.teamHp[i] || 0) / (run.teamMaxHp[i] || 1)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 玩家 */}
        <div className="battle-player">
          <div className="player-sprite-wrap" style={fxOk ? { display: "none" } : {}}>
            {ICON(run.team[run.activeIdx] ?? 25) ? (
              <img
                id="player-pkm-sprite"
                src={ICON(run.team[run.activeIdx] ?? 25)}
                alt=""
              />
            ) : (
              <div className="player-sprite-fallback">👾</div>
            )}
          </div>
          <div className="player-info">
            <div className="player-name">
              {getPkmName(run.team[run.activeIdx] ?? 25)}
              {run.team.length > 1 ? ` (${run.activeIdx + 1}/${run.team.length})` : ""}
            </div>
            <div className="battle-player-info">
              ❤️ {Math.ceil(run.hp)}
              {run.block > 0 ? ` · 🛡️ ${run.block}` : ""} · ⚡ {run.energy} ·
              ⚔️ {atk}
            </div>
          </div>
        </div>
      </div>

      {/* 答题区(捕获动画期间隐藏,露出 3D 舞台) */}
      <div
        className="battle-q-area"
        style={{
          opacity: run.turnPhase === "card" ? 0.4 : 1,
          display: captureOpen ? "none" : undefined,
        }}
      >
        {run.turnPhase === "question" ? (
          <>
            <div className="battle-q-text">
              {run.currentQ
                ? `[⚡已获得${run.turnCorrect}能量] ${run.currentQ.q}`
                : "准备答题..."}
            </div>
            <div className="battle-options">
              {run.currentQ?.opts.map((opt, i) => (
                <button
                  key={i}
                  className={
                    "battle-opt-btn" +
                    (answerState?.picked === i
                      ? answerState.correct
                        ? " correct"
                        : " wrong"
                      : "") +
                    (answerState && answerState.picked === run.currentQ?.ans && !answerState.correct
                      ? " reveal"
                      : "") +
                    (answerState ? " disabled" : "")
                  }
                  disabled={!!answerState}
                  onClick={() => handleAnswer(i)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="battle-q-text">📝 出牌阶段 — 点击手牌使用技能</div>
        )}
      </div>

      {/* 手牌(捕获动画期间隐藏) */}
      <div
        className="hand-area"
        id="hand-area"
        style={{ display: captureOpen ? "none" : undefined }}
      >
        {handCards.length === 0 && run.turnPhase === "card" ? (
          <div
            style={{
              color: "var(--text2)",
              fontSize: 10,
              textAlign: "center",
              width: "100%",
              padding: 12,
            }}
          >
            手牌已空 — 结束回合
          </div>
        ) : (
          handCards.map((card, i) => {
            const unaffordable = run.turnPhase === "card" && run.energy < card.cost;
            return (
              <div
                key={`${card.id}-${i}`}
                className={
                  "hand-card type-" +
                  card.type +
                  (unaffordable ? " unaffordable" : "")
                }
                onClick={() => handlePlayCard(i)}
              >
                <div className="card-cost">{card.cost}</div>
                <div className="card-icon">{card.icon}</div>
                <div className="card-name">{card.name}</div>
                <div className="card-desc">{card.desc}</div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部控制(捕获动画期间隐藏) */}
      <div
        className="battle-actions"
        style={{ display: captureOpen ? "none" : undefined }}
      >
        <div className="energy-display">
          ⚡ {run.energy}
          <span className="energy-orbs">
            {Array.from({ length: Math.min(run.energy, 12) }).map((_, i) => (
              <span key={i} className="energy-orb" />
            ))}
          </span>
        </div>
        <button className="end-turn-btn" onClick={handleEndTurn}>
          {run.turnPhase === "question" ? "⏹ 停止答题" : "▶ 结束回合"}
        </button>
      </div>
    </section>
  );
}
