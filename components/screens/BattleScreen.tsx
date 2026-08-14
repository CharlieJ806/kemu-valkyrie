"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { getValkName, getPlayerAtk } from "@/lib/formulas";
import { hydrateCard, buildUltCard, ULT_PREFIX } from "@/lib/cards";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import { spawnDmg, spawnFxText, domBurst } from "@/lib/dom-fx";
import { BattleFX } from "@/lib/fx3d";
import { getQuestionCat, getValkById } from "@/data";
import { ATTR_SHORT, attrBadgeStyle } from "@/lib/attr";
import { getBossMechanic } from "@/lib/bossMechanics";
import { AFFIX_NAMES, BATTLE_Q_TIME_MS } from "@/data/constants";
import type { Card } from "@/lib/types";

function enemyStatusText(status: { type: string; turns: number } | null): string {
  if (!status) return "";
  const names: Record<string, string> = {
    burn: "违章曝光",
    para: "限速减速",
    poison: "扣分侵蚀",
    sleep: "禁行拘留",
    freeze: "冻结车流",
    confuse: "远光眩目",
  };
  return `${names[status.type] || status.type}(${status.turns})`;
}

/** 手牌 id → 卡对象(必杀卡按当前领队现场构建) */
function cardOf(id: string, leaderId: number | null): Card | null {
  if (id.startsWith(ULT_PREFIX)) {
    if (leaderId == null) return null;
    const v = getValkById(leaderId);
    return v ? buildUltCard(v) : null;
  }
  return hydrateCard(id);
}

/** 答题倒计时条:按题目 key 重挂载,初始剩余时间来自 limit 参数 */
function QuestionTimer({
  qKey,
  limit,
  onExpire,
}: {
  qKey: string | null;
  limit: number;
  onExpire: () => void;
}) {
  const [remain, setRemain] = useState(limit);
  const expireRef = useRef(onExpire);

  // 同步最新到期回调(不在渲染期写 ref)
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemain((v) => {
        if (v <= 250) {
          clearInterval(timer);
          expireRef.current();
          return 0;
        }
        return v - 250;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [qKey]);

  if (!qKey) return null;
  const low = remain <= Math.min(5000, limit * 0.3);
  return (
    <div className={`battle-timer ${low ? "low" : ""}`}>
      <div
        className="battle-timer-fill"
        style={{
          width: `${Math.max(0, (remain / Math.max(1, limit)) * 100)}%`,
        }}
      />
      <span className="battle-timer-text">
        ⏱ {Math.max(0, Math.ceil(remain / 1000))}s
      </span>
    </div>
  );
}

export default function BattleScreen() {
  const run = useGameStore((s) => s.run);
  const meta = useGameStore((s) => s.meta);
  const answer = useGameStore((s) => s.answer);
  const enterCardPhase = useGameStore((s) => s.enterCardPhase);
  const playCard = useGameStore((s) => s.playCard);
  const endTurnAction = useGameStore((s) => s.endTurnAction);
  const switchPoke = useGameStore((s) => s.switchPoke);
  const lastAnswer = useGameStore((s) => s.lastAnswer);
  const lastPlay = useGameStore((s) => s.lastPlay);

  const [answerState, setAnswerState] = useState<{
    picked: number;
    correct: boolean;
  } | null>(null);
  const qCat = run?.currentQ ? getQuestionCat(run.currentQ.id) : null;
  const lastProcessedRef = useRef(0);
  const lastPlayRef = useRef(0);
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
    const stage = document.getElementById("battle-stage");

    if (res.correct) {
      AudioEngine.sfx("correct");
      // 玩家攻击动画:学员前冲 + 光弹 + 命中粒子 + 受击抖动
      const crit = res.combo > 0 && res.combo % 5 === 0;
      if (BattleFX.ok) {
        BattleFX.attack("player", { crit });
        BattleFX.comboAura(res.combo);
      }
      if (res.dmg > 0) {
        spawnDmg(stage, 66, 34, `-${res.dmg}`, crit ? "#ffd700" : "#ff6688", crit);
      }
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
      if (res.timedOut) {
        AudioEngine.sfx("timeout");
        spawnFxText(stage, 50, 30, "⏰ 超时!", "#ff8800");
      } else {
        AudioEngine.sfx("wrong");
      }
      // 答错/超时反伤 → 敌方攻击动画(仅在真实掉血时播放)
      if (res.counterDmg > 0) {
        if (BattleFX.ok) {
          BattleFX.attack("enemy", {});
        }
        spawnDmg(stage, 28, 55, `-${res.counterDmg}`, "#ff0044");
      }
      // 答错:先展示正确答案(绿框高亮),再进入出牌阶段
      if (!res.playerDead) {
        nextTimerRef.current = setTimeout(() => {
          nextTimerRef.current = null;
          const st = useGameStore.getState();
          if (st.run && st.run.inBattle && st.run.turnPhase === "question") {
            st.enterCardPhase();
          }
          setAnswerState(null);
        }, 900);
      }
    }
  }, [lastAnswer]);

  // 出牌反馈:板块联动飘字/必杀技演出(id 去重防 StrictMode 双调用)
  useEffect(() => {
    if (!lastPlay || lastPlay.id <= lastPlayRef.current) return;
    lastPlayRef.current = lastPlay.id;
    const stage = document.getElementById("battle-stage");
    const link = lastPlay.events.find((e) => e.type === "link");
    if (link && link.type === "link") {
      const bonusText =
        link.bonus === "dmg"
          ? `制裁 ${link.amount} 伤害`
          : link.bonus === "energy"
            ? "调度 +1 指令"
            : link.bonus === "block"
              ? "守护 +4 格挡"
              : link.amount > 0
                ? "远光眩目！敌方混乱"
                : "眩目未中…";
      spawnFxText(stage, 60, 28, `联动！${link.valkName} ${bonusText}`, "#ffd700");
      if (link.bonus === "dmg") {
        spawnDmg(stage, 66, 34, `-${link.amount}`, "#ffb300");
        if (BattleFX.ok) BattleFX.attack("player", {});
      }
      AudioEngine.sfx("crit");
    }
    if (lastPlay.cardId.startsWith(ULT_PREFIX)) {
      spawnFxText(stage, 50, 42, "🔥 必杀技发动！", "#ffe14d");
      domBurst(stage, 16, 10, "#ffd700", 16);
      if (BattleFX.ok) BattleFX.attack("player", { crit: true });
      AudioEngine.sfx("crit");
    }
    if (lastPlay.events.some((e) => e.type === "dodge")) {
      spawnFxText(stage, 60, 34, "💨 雾隐·闪避!", "#9db6d2");
      AudioEngine.sfx("flee");
    }
  }, [lastPlay]);

  // 卸载/切屏时清理计时器
  useEffect(() => {
    return () => {
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    };
  }, []);

  // 3D 战斗场景初始化(学员入场/攻击/受击/倒下动画;街景:道路/红绿灯/路锥)
  // 生命周期 = 组件挂载/卸载(每场战斗重新挂载)。
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
        BattleFX.setPlayer(r.team[r.activeIdx] ?? 1);
        // Boss 放大立绘;最终 Boss 二阶段切「二阶段」形态图
        BattleFX.setEnemy(
          r.enemyPkm.id,
          r.enemyPkm.r,
          !!r.enemyPkm.boss,
          r.bossPhase === 2 ? "ult" : undefined,
        );
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

  // 出战学员变化 → 换人入场动画
  useEffect(() => {
    if (!fxOk || !run || !run.inBattle) return;
    BattleFX.setPlayer(run.team[run.activeIdx] ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.activeIdx, run?.inBattle, fxOk]);

  // 最终 Boss 二阶段 → 敌方切「二阶段」形态图
  useEffect(() => {
    if (!fxOk || !run || !run.inBattle) return;
    if (run.bossPhase === 2) BattleFX.setEnemyPose("ult");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.bossPhase, fxOk]);

  // 全灭 → 玩家倒下动画 → 切结算页
  useEffect(() => {
    if (!run) return;
    if (!run.gameOver) return;
    if (!fxOk) {
      // 3D 不可用:直接切结算页
      useGameStore.getState().showOverScreen();
      return;
    }
    const t = setTimeout(() => {
      BattleFX.ko("player", () => {
        useGameStore.getState().showOverScreen();
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.gameOver, fxOk]);

  if (!run || !run.enemyPkm) return null;
  if (!run.inBattle) return null;

  const qTimerKey =
    run.turnPhase === "question" && !run.questionAnswered ? run.currentQ?.id ?? null : null;
  const enemy = run.enemyPkm;
  const enemySprite = ICON(enemy.id);
  const handCards: Card[] = run.hand
    .map((id) => cardOf(id, run.leaderId))
    .filter(Boolean) as Card[];
  const atk = getPlayerAtk(meta.metaAtkLv);

  const handleAnswer = (idx: number) => {
    if (run.gameOver) return;
    if (!run.currentQ || run.turnPhase !== "question" || run.questionAnswered) return;
    answer(idx);
  };

  const handlePlayCard = (idx: number) => {
    if (run.gameOver) return;
    const st = useGameStore.getState();
    const r = st.run;
    if (!r || r.turnPhase !== "card") return;
    const card = cardOf(r.hand[idx]!, r.leaderId);
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
    if (run.gameOver) return;
    if (run.turnPhase === "question") {
      // 停止答题 → 进入出牌阶段
      enterCardPhase();
      return;
    }
    const res = endTurnAction();
    // 回合结束 → 敌方攻击动画(仅真实造成伤害时播放)
    if (res && res.enemyDmg > 0 && !res.playerDead) {
      const stage = document.getElementById("battle-stage");
      spawnDmg(stage, 28, 55, `-${res.enemyDmg}`, "#ff0044");
      if (BattleFX.ok) {
        setTimeout(() => BattleFX.attack("enemy", {}), 500);
      }
    }
  };

  // 敌方意图文案(明牌;迷雾 Boss 隐藏伤害数字)
  const mech = run.enemyPkm ? getBossMechanic(run.enemyPkm.id) : null;
  const intentText = (() => {
    if (!run.enemyIntent) return "准备攻击...";
    const hidden = !!mech?.hideIntent;
    const dmg = run.enemyIntent.damage;
    switch (run.enemyIntent.type) {
      case "attack":
        return `攻击 ${hidden ? "???" : dmg} 伤害`;
      case "guard":
        return `防御(+${run.enemyIntent.block ?? 15}🛡️) ${hidden ? "?" : dmg} 伤害`;
      case "multi":
        return `连环攻击 ${hidden ? "?" : dmg}×2`;
      case "charge":
        return `蓄力中 — 下回合爆发`;
    }
  })();
  const intentExtras: string[] = [];
  if (run.bossVars?.red) intentExtras.push("🔴红灯暴怒");
  if (mech?.dodgeActive?.(run)) intentExtras.push("💨雾隐中");
  if (run.enemyWeakTurns > 0)
    intentExtras.push(`⚖️削弱中(${run.enemyWeakTurns}回合)`);

  return (
    <section className="screen active" id="scr-battle">
      <div className="battle-topbar">
        <div>⚔️ 战斗 · {getValkName(enemy.id)}</div>
        <div className="battle-combo">
          {run.combo > 1 ? `🔥 x${run.combo}` : ""}
        </div>
      </div>

      <div className={`battle-stage${fxOk ? " fx-3d" : ""}`} id="battle-stage">
        {/* 3D 战斗场景(学员入场/攻击/受击/倒下动画) */}
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
              {getValkName(enemy.id)}
              <span style={{ fontSize: 10, color: "var(--dim)" }}>
                {" "}
                {enemyStatusText(run.enemyStatus)}
              </span>
            </div>
            {/* 精英词缀 / Boss 机制标签 */}
            <div className="enemy-tags">
              {run.enemyAffix.map((a) => (
                <span key={a} className="affix-badge" title={`精英词缀:${AFFIX_NAMES[a] ?? a}`}>
                  {AFFIX_NAMES[a] ?? a}
                </span>
              ))}
              {mech && (
                <span className="boss-mech-tag" title={mech.desc}>
                  {mech.name}
                </span>
              )}
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
                ? `敌方意图: ${intentText}${
                    intentExtras.length > 0 ? ` [${intentExtras.join(" · ")}]` : ""
                  }`
                : `⚡ ${run.energy} 能量 — 打出卡牌后结束回合`}
            </div>
          </div>
        </div>

        {/* 队伍槽:点击切换出战 */}
        <div className="team-bar">
          {run.team.map((id, i) => (
            <div
              key={id}
              title={getValkName(id) + (run.leaderId === id ? "（领队）" : "")}
              className={`team-slot ${
                i === run.activeIdx ? "active" : ""
              } ${(run.teamHp[i] || 0) <= 0 ? "fainted" : ""}`}
              onClick={() => { if (!run.gameOver) switchPoke(i); }}
            >
              {run.leaderId === id && <span className="leader-star">👑</span>}
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
            {ICON(run.team[run.activeIdx] ?? 1) ? (
              <img
                id="player-pkm-sprite"
                src={ICON(run.team[run.activeIdx] ?? 1)}
                alt=""
              />
            ) : (
              <div className="player-sprite-fallback">👾</div>
            )}
          </div>
          <div className="player-info">
            <div className="player-name">
              {getValkName(run.team[run.activeIdx] ?? 1)}
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

      {/* 答题区(战斗结算期间隐藏,露出 3D 舞台) */}
      <div
        className="battle-q-area"
        style={{
          opacity: run.turnPhase === "card" ? 0.4 : 1,
          
        }}
      >
        {run.turnPhase === "question" ? (
          <>
            {/* 答题倒计时条(迷雾 Boss 可缩短时限) */}
            <QuestionTimer
              key={qTimerKey ?? "idle"}
              qKey={qTimerKey}
              limit={run.qTimeLimit ?? BATTLE_Q_TIME_MS}
              onExpire={() => useGameStore.getState().timeoutQuestion()}
            />
            <div className="battle-q-text">
              {run.currentQ ? (
                <>
                  {qCat && (
                    <span className="attr-badge" style={attrBadgeStyle(qCat)}>
                      {ATTR_SHORT[qCat]}
                    </span>
                  )}{" "}
                  [⚡已获得{run.turnCorrect}能量] {run.currentQ.q}
                </>
              ) : (
                "准备答题..."
              )}
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
                    (answerState && i === run.currentQ?.ans && !answerState.correct
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
          <div className="battle-q-text">
            📝 出牌阶段 — 点击手牌使用技能
            {run.bossVars?.tax ? (
              <span style={{ color: "var(--gold)", marginLeft: 8 }}>
                📡 信号干扰:下一张牌费用 +1
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* 手牌(战斗结算期间隐藏) */}
      <div
        className="hand-area"
        id="hand-area"
        
      >
        {handCards.length === 0 && run.turnPhase === "card" ? (
          <div
            style={{
              color: "var(--dim)",
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
            const isUlt = card.id.startsWith(ULT_PREFIX);
            return (
              <div
                key={`${card.id}-${i}`}
                className={
                  "hand-card type-" +
                  card.type +
                  (isUlt ? " ult-card" : "") +
                  (unaffordable ? " unaffordable" : "")
                }
                onClick={() => handlePlayCard(i)}
              >
                <div className="card-cost">{card.cost}</div>
                {isUlt && <div className="ult-tag">必杀</div>}
                <div className="card-icon">{card.icon}</div>
                <div className="card-name">{card.name}</div>
                <div className="card-desc">{card.desc}</div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部控制(战斗结算期间隐藏) */}
      <div
        className="battle-actions"
        
      >
        <div className="energy-display">
          ⚡ {run.energy}
          <span className="energy-orbs">
            {Array.from({ length: Math.min(run.energy, 12) }).map((_, i) => (
              <span key={i} className="energy-orb" />
            ))}
          </span>
        </div>
        {run.leaderId != null && (
          <div
            className="ult-gauge"
            title={`领队必杀槽 ${run.ultGauge}/${run.ultMax}(每出一张牌+1)`}
          >
            <span className="ult-gauge-label">🔥 领队必杀</span>
            <div className="ult-gauge-bar">
              <i
                style={{
                  width: `${Math.min(100, (run.ultGauge / Math.max(1, run.ultMax)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
        <button className="end-turn-btn" onClick={handleEndTurn}>
          {run.turnPhase === "question" ? "⏹ 停止答题" : "▶ 结束回合"}
        </button>
      </div>
    </section>
  );
}
