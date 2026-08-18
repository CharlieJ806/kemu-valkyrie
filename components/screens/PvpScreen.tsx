"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { VALKYRIES, getValkById } from "@/data";
import { DECK_MAX } from "@/data/constants";
import { getValkName, getValkRole, VALKYRIE_ROLE_NAMES } from "@/lib/formulas";
import { ALL_CARDS, CARD_CAT_NAMES, hydrateCard, STARTER_CARD_IDS } from "@/lib/cards";
import { PVP_BALANCE, PVP_MAX_Q, type PvpState } from "@/lib/pvp";
import { usePvpStore, pvpHostTick, pvpGuestTick } from "@/lib/pvp-store";
import { getPassiveById } from "@/lib/valkskills";
import { loadPvpName, savePvpName } from "@/lib/save";
import { poseUrl, portraitUrl } from "@/lib/portrait";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";
import { spawnDmg, spawnFxText, domBurst } from "@/lib/dom-fx";

const Q_TIME_MS = 15000;
const CARD_TIME_MS = 60000;

/** 血条(对战双方共用;濒死闪烁 + 车轮剩余人数点 + 必杀槽/被动) */
function HpBar({
  f,
  label,
  me,
  teamIds,
  teamIdx,
}: {
  f: PvpState["host"];
  label: string;
  me: boolean;
  teamIds?: number[];
  teamIdx?: number;
}) {
  const low = f.hp / Math.max(1, f.maxHp) <= 0.25 && f.hp > 0;
  const passive = getPassiveById(f.valkId);
  const ultReady = !f.ultUsed && f.ultGauge >= f.ultMax;
  return (
    <div className="pvp-fighter">
      <div className="pvp-f-name" style={me ? { color: "var(--green)" } : undefined}>
        {label} · {f.name}
        {passive ? (
          <span className="pvp-skill-tag" title={`被动·${passive.name}: ${passive.desc}`}>
            被动·{passive.name}
          </span>
        ) : null}
      </div>
      {teamIds && teamIds.length > 1 && (
        <div className="pvp-team-dots">
          {teamIds.map((id, i) => (
            <span
              key={`${id}-${i}`}
              className={i >= (teamIdx ?? 0) ? "alive" : "dead"}
              title={getValkName(id)}
            >
              {i === (teamIdx ?? 0) ? "◉" : i > (teamIdx ?? 0) ? "●" : "○"}
            </span>
          ))}
        </div>
      )}
      <div className={`pvp-hp-bar ${low ? "low" : ""}`}>
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
        {f.ultGauge > 0 ? ` ✨${f.ultGauge}/${f.ultMax}${ultReady ? " 可放" : ""}` : ""}
      </div>
    </div>
  );
}

export default function PvpScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const setPvpDeck = useGameStore((s) => s.setPvpDeck);

  const mode = usePvpStore((s) => s.mode);
  const side = usePvpStore((s) => s.side);
  const room = usePvpStore((s) => s.room);
  const peer = usePvpStore((s) => s.peer);
  const peerPicks = usePvpStore((s) => s.peerPicks);
  const peerDeck = usePvpStore((s) => s.peerDeck);
  const peerReady = usePvpStore((s) => s.peerReady);
  const myReady = usePvpStore((s) => s.myReady);
  const teamSize = usePvpStore((s) => s.teamSize);
  const deckMode = usePvpStore((s) => s.deckMode);
  const againMe = usePvpStore((s) => s.againMe);
  const againPeer = usePvpStore((s) => s.againPeer);
  const st = usePvpStore((s) => s.st);
  const info = usePvpStore((s) => s.info);
  const remainMs = usePvpStore((s) => s.remainMs);
  const requestJoin = usePvpStore((s) => s.requestJoin);
  const sendPick = usePvpStore((s) => s.sendPick);
  const setTeamSize = usePvpStore((s) => s.setTeamSize);
  const setReady = usePvpStore((s) => s.setReady);
  const setDeckMode = usePvpStore((s) => s.setDeckMode);
  const act = usePvpStore((s) => s.act);
  const requestAgain = usePvpStore((s) => s.requestAgain);
  const surrender = usePvpStore((s) => s.surrender);
  const leave = usePvpStore((s) => s.leave);

  // 本地 UI 态:昵称(记忆)/队伍(出场顺序)/房码输入/出战牌组(备战编辑,持久化)
  const [name, setName] = useState(() => loadPvpName());
  const [myTeam, setMyTeam] = useState<number[]>([]);
  const [roomIn, setRoomIn] = useState("");
  const [pvpDeck, setPvpDeckLocal] = useState<string[]>(() => {
    const saved = meta.pvpDeckIds && meta.pvpDeckIds.length > 0
      ? meta.pvpDeckIds
      : meta.builtDeckIds && meta.builtDeckIds.length > 0
        ? meta.builtDeckIds
        : [...STARTER_CARD_IDS];
    return [...saved];
  });

  /** 已拥有的卡牌集合(初始五张基础技始终可用) */
  const ownedCards = new Set(
    Object.keys(meta.ownedCards || {}).filter((id) => meta.ownedCards?.[id]),
  );

  /** 备战牌组增删(5-12 张,改动即持久化;仅「各自牌组」模式生效) */
  const togglePvpCard = (id: string) => {
    AudioEngine.sfx("click");
    const next = pvpDeck.includes(id)
      ? pvpDeck.filter((x) => x !== id)
      : pvpDeck.length >= DECK_MAX
        ? pvpDeck
        : [...pvpDeck, id];
    setPvpDeckLocal(next);
    setPvpDeck(next);
  };
  const resetPvpDeck = () => {
    AudioEngine.sfx("click");
    setPvpDeckLocal([...STARTER_CARD_IDS]);
    setPvpDeck([...STARTER_CARD_IDS]);
  };

  const stageRef = useRef<HTMLDivElement>(null);
  const meImgRef = useRef<HTMLImageElement>(null);
  const oppImgRef = useRef<HTMLImageElement>(null);
  const lastFxSeqRef = useRef(0); // 飘字消费游标(按 seq 播放新增条目)
  const wrongPlayedRef = useRef(""); // 答错音效去重
  const pendingRef = useRef<{ idx: number; qId: string } | null>(null); // 待判定答对反馈
  const correctFlashRef = useRef(false); // 键盘侧同款守卫
  const [correctFlash, setCorrectFlash] = useState<{ idx: number } | null>(null);
  const confettiDoneRef = useRef(false);
  const preloadedRef = useRef(""); // 动作立绘预载去重(按队伍指纹)

  const myName = name.trim() || (myTeam[0] != null ? getValkName(myTeam[0]) : "学员");
  const myCfg = {
    name: myName,
    valkIds: myTeam,
    deck: pvpDeck,
  };

  /** 队伍编排:点击入队/再点移除(按点击顺序即出场顺序) */
  const toggleTeam = (id: number) => {
    AudioEngine.sfx("click");
    setMyTeam((t) => {
      const next = t.includes(id)
        ? t.filter((x) => x !== id)
        : t.length >= teamSize
          ? t
          : [...t, id];
      sendPick(next);
      return next;
    });
  };

  // 250ms tick:宿主超时判定 / 客机倒计时递减
  useEffect(() => {
    if (mode !== "battle") return;
    const host = side === "host";
    const t = setInterval(() => (host ? pvpHostTick() : pvpGuestTick()), 250);
    return () => clearInterval(t);
  }, [mode, side]);

  // 键盘:1-4 答题 / 空格·E 停止答题·结束回合(与 PvE 习惯一致)
  useEffect(() => {
    if (mode !== "battle") return;
    const onKey = (e: KeyboardEvent) => {
      const s = usePvpStore.getState();
      const cur = s.st;
      if (!cur || cur.over || cur.turn !== s.side) return;
      if (cur.phase === "question") {
        const idx = ["1", "2", "3", "4"].indexOf(e.key);
        if (
          idx >= 0 &&
          cur.currentQ &&
          idx < cur.currentQ.opts.length &&
          !cur.qLocked &&
          !cur.answered &&
          !correctFlashRef.current
        ) {
          AudioEngine.sfx("click");
          pendingRef.current = { idx, qId: cur.currentQ.id };
          s.act({ act: "answer", pick: idx });
          return;
        }
        if ((e.key === " " || e.key === "e" || e.key === "E") && (cur.qLocked || cur.turnCorrect > 0)) {
          e.preventDefault();
          s.act({ act: "enterCard" });
        }
      } else if (cur.phase === "card") {
        if (e.key === "q" || e.key === "Q") {
          const f = s.side === "host" ? cur.host : cur.guest;
          if (f && !f.ultUsed && f.ultGauge >= f.ultMax) {
            e.preventDefault();
            s.act({ act: "ult" });
            return;
          }
        }
        if (e.key === "e" || e.key === "E" || e.key === " ") {
          e.preventDefault();
          s.act({ act: "endTurn" });
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  // 回合切换横幅:轮到我方行动时划过(key 重挂载触发 CSS 动画,无需 state)
  const showBanner = mode === "battle" && !!st && !st.over && st.turn === side && st.turnNo > 0;

  // 动作立绘预载(换人后新角色也会触发)
  useEffect(() => {
    if (mode !== "battle" || !st) return;
    const fp = `${st.teams.host.join(",")}|${st.teams.guest.join(",")}`;
    if (preloadedRef.current === fp) return;
    preloadedRef.current = fp;
    for (const id of [...st.teams.host, ...st.teams.guest]) {
      for (const pose of ["attack", "hurt"] as const) {
        const img = new Image();
        img.src = poseUrl(id, pose);
      }
    }
  }, [mode, st]);

  /** 切换动作立绘(可选附加 class,如受击闪红),ms 后切回主立绘 */
  const swapPose = (
    img: HTMLImageElement | null,
    pose: "attack" | "hurt",
    cls?: string,
    ms = 420,
  ) => {
    if (!img) return;
    const vid = img.dataset.vid;
    if (!vid) return;
    img.src = poseUrl(Number(vid), pose);
    if (cls) img.classList.add(cls);
    setTimeout(() => {
      if (cls) img.classList.remove(cls);
      if (img.isConnected) img.src = portraitUrl(Number(vid));
    }, ms);
  };

  // 飘字/伤害数字/粒子/震动/攻受动作消费(双方各自播放新增 seq)
  useEffect(() => {
    if (!st || st.lastFx.length === 0) return;
    const fresh = st.lastFx.filter((f) => f.seq > lastFxSeqRef.current);
    if (fresh.length === 0) return;
    lastFxSeqRef.current = Math.max(...st.lastFx.map((f) => f.seq));
    const stage = stageRef.current;

    // 非伤害类(文本/状态)立即展示;伤害类延迟到冲刺命中瞬间,形成因果节奏
    const dmgEntries: typeof fresh = [];
    for (const f of fresh) {
      const mine = f.side === side;
      if (f.dmg != null && f.dmg > 0) {
        dmgEntries.push(f);
      } else if (stage) {
        spawnFxText(stage, mine ? 60 : 38, mine ? 22 : 56, f.text, f.color);
      }
      if (mine) {
        if (f.kind === "answer") AudioEngine.sfx(f.crit ? "crit" : "correct");
        else if (f.kind === "timeout") AudioEngine.sfx("timeout");
      }
    }

    if (dmgEntries.length > 0) {
      const last = dmgEntries[dmgEntries.length - 1]!;
      const attackerIsMe = last.side === side;
      const attImg = attackerIsMe ? meImgRef.current : oppImgRef.current;
      const defImg = attackerIsMe ? oppImgRef.current : meImgRef.current;

      // 实测攻→受距离,真实冲刺(分辨率无关);命中瞬间才结算受方表现
      const attVid = attImg?.dataset.vid;
      if (stage && attImg && defImg && attVid) {
        const attRect = attImg.getBoundingClientRect();
        const defRect = defImg.getBoundingClientRect();
        const dx =
          defRect.left + defRect.width * 0.35 - (attRect.left + attRect.width * 0.65);
        attImg.src = poseUrl(Number(attVid), "attack");
        attImg.style.zIndex = "5";
        const travel = attImg.animate(
          [{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }],
          { duration: 280, easing: "cubic-bezier(.45,0,.8,1)" },
        );
        travel.onfinish = () => {
          if (!attImg.isConnected) return;
          // 命中:伤害飘字/暴击粒子/受方闪红/音效/震动同时爆发
          for (const f of dmgEntries) {
            const mine = f.side === side;
            spawnDmg(
              stage,
              mine ? 72 : 26,
              mine ? 32 : 52,
              `-${f.dmg}`,
              f.crit ? "#ffd700" : "#ff6688",
              f.crit,
            );
            if (f.crit) domBurst(stage, 70, 34, "#ffd700", 20);
          }
          swapPose(defImg, "hurt", "hitflash");
          AudioEngine.sfx(attackerIsMe ? "hit" : "hurt");
          const incBig = Math.max(
            0,
            ...dmgEntries.filter((f) => f.side !== side).map((f) => f.dmg ?? 0),
          );
          if (incBig >= 12) {
            const wrap = document.getElementById("shake-wrap");
            wrap?.classList.add("shaking");
            setTimeout(() => wrap?.classList.remove("shaking"), 350);
          }
          const back = attImg.animate(
            [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
            { duration: 240, easing: "ease-out" },
          );
          back.onfinish = () => {
            attImg.style.zIndex = "";
            if (attImg.isConnected) attImg.src = portraitUrl(Number(attVid));
          };
        };
      } else {
        // 无立绘兜底:直接结算表现
        for (const f of dmgEntries) {
          if (!stage) break;
          const mine = f.side === side;
          spawnDmg(stage, mine ? 72 : 26, mine ? 32 : 52, `-${f.dmg}`, f.crit ? "#ffd700" : "#ff6688", f.crit);
        }
        AudioEngine.sfx(attackerIsMe ? "hit" : "hurt");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, side]);

  // 答对反馈:点击后若快照已换题且无答错标记 → 上题答对,对应选项闪绿 400ms
  useEffect(() => {
    const p = pendingRef.current;
    if (!p || !st) return;
    if (st.answered || st.qLocked) {
      pendingRef.current = null; // 答错/超时走既有红显路径
      return;
    }
    if ((st.currentQ?.id ?? "") !== p.qId) {
      pendingRef.current = null;
      correctFlashRef.current = true;
      setCorrectFlash({ idx: p.idx });
      setTimeout(() => {
        correctFlashRef.current = false;
        setCorrectFlash(null);
      }, 400);
    }
  }, [st]);

  // 答错/超时音效 + 展示 900ms 后自动进入出牌阶段
  useEffect(() => {
    if (mode !== "battle" || !st || st.turn !== side || st.phase !== "question") return;
    if (!st.answered || st.answered.correct) return;
    const key = `${st.turnNo}:${st.turnQIdx}`;
    if (wrongPlayedRef.current !== key) {
      wrongPlayedRef.current = key;
      // 超时(pick=-1)的音效已由 fx 消费播放,这里只处理答错
      if (st.answered.pick !== -1) AudioEngine.sfx("wrong");
    }
    const t = setTimeout(() => act({ act: "enterCard" }), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.answered, st?.phase, st?.turnNo, st?.turnQIdx, mode, side]);

  // 胜利彩带(一次性)
  useEffect(() => {
    if (!st?.over || st.winner !== side || confettiDoneRef.current) return;
    confettiDoneRef.current = true;
    const target = document.getElementById("pvp-stage") ?? document.body;
    domBurst(target, 50, 40, "#ffd700", 30);
    domBurst(target, 50, 40, "#57c7a7", 30);
  }, [st?.over, st?.winner, side]);

  useEffect(() => {
    return () => {
      usePvpStore.getState().leave("已离开对战");
    };
  }, []);

  const joinRoom = (code: string | null) => {
    // 加入时的初始信息(单角色占位,进房后队伍经 pick 信令实时互见)
    requestJoin(code, myName, {
      name: myName,
      valkId: myTeam[0] ?? 1,
      deck: myCfg.deck,
    });
  };

  const copyRoom = async () => {
    try {
      await navigator.clipboard.writeText(room);
      AudioEngine.sfx("click");
    } catch {
      window.prompt("复制房码:", room);
    }
  };

  /* ================= 大厅 ================= */
  if (mode === "idle") {
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

          <div className="set-row">
            <span>昵称</span>
            <input
              className="search-input"
              style={{ maxWidth: 160 }}
              placeholder="输入昵称"
              value={name}
              onChange={(e) => {
                setName(e.target.value.slice(0, 8));
                savePvpName(e.target.value.slice(0, 8));
              }}
            />
          </div>
          <div className="pvp-note">创建或加入房间后,在房间内选择学员对战</div>
          <div className="set-row">
            <span>房间码</span>
            <input
              className="search-input"
              style={{ maxWidth: 120, textTransform: "uppercase" }}
              placeholder="加入时填写"
              value={roomIn}
              onChange={(e) => setRoomIn(e.target.value.toUpperCase().slice(0, 4))}
            />
          </div>
          <div className="pvp-btns">
            <button
              className="btn btn-primary"
              onClick={() => {
                AudioEngine.sfx("click");
                joinRoom(null);
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

          {info ? <div className="pvp-info">{info}</div> : null}
        </div>
      </section>
    );
  }

  /* ================= 房间(备战区) ================= */
  if (mode === "room") {
    return (
      <section className="screen active" id="scr-pvp">
        <div className="title-inner" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
          <div className="set-row">
            <div style={{ fontWeight: 800, flex: 1, textAlign: "center" }}>⚔️ 对战房间</div>
            <button className="btn-mini" onClick={() => leave("已离开房间")}>
              离开
            </button>
          </div>

          <div className="pvp-room-code-row">
            <div className="pvp-room-code">{room}</div>
            <button className="btn-mini" onClick={copyRoom}>
              📋 复制
            </button>
          </div>
          <div className="pvp-note">
            {peer ? "选择学员并准备,双方就绪后自动开局" : "把房码告诉对手,等待加入…"}
          </div>

          {peer && (
            <>
              {side === "host" && (
                <div className="pvp-btns">
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      className={`btn-mini ${teamSize === n ? "active" : ""}`}
                      onClick={() => {
                        AudioEngine.sfx("click");
                        setTeamSize(n);
                        if (myTeam.length > n) {
                          setMyTeam((t) => t.slice(0, n));
                        }
                      }}
                    >
                      {n === 1 ? "⚔️ 单挑" : `🚗 ${n}人车轮`}
                    </button>
                  ))}
                </div>
              )}
              {side === "host" && (
                <div className="pvp-btns">
                  <button
                    className={`btn-mini ${deckMode === "fair" ? "active" : ""}`}
                    onClick={() => {
                      AudioEngine.sfx("click");
                      usePvpStore.getState().setDeckMode("fair");
                    }}
                  >
                    ⚖️ 公平模式(标准牌组)
                  </button>
                  <button
                    className={`btn-mini ${deckMode === "own" ? "active" : ""}`}
                    onClick={() => {
                      AudioEngine.sfx("click");
                      usePvpStore.getState().setDeckMode("own");
                    }}
                  >
                    🃏 各自牌组
                  </button>
                </div>
              )}

              <div className="pvp-prep">
                <div className="pvp-prep-side">
                  <div className="pvp-prep-title">
                    我方队伍({myTeam.length}/{teamSize}) {myReady ? "✅已准备" : ""}
                  </div>
                  {/* 出场顺序槽位(点击移除) */}
                  <div className="pvp-slots">
                    {Array.from({ length: teamSize }).map((_, i) =>
                      myTeam[i] != null ? (
                        <div key={i} className="pvp-slot filled" onClick={() => toggleTeam(myTeam[i]!)}>
                          <span className="pvp-slot-no">{i + 1}</span>
                          <img src={ICON(myTeam[i]!)} alt="" />
                        </div>
                      ) : (
                        <div key={i} className="pvp-slot">
                          <span className="pvp-slot-no">{i + 1}</span>
                        </div>
                      ),
                    )}
                  </div>
                  {/* 队伍属性/技能一览(体现角色差异化) */}
                  {myTeam.length > 0 && (
                    <div className="pvp-team-stats">
                      {myTeam.map((id) => {
                        const v = getValkById(id);
                        if (!v) return null;
                        const bal = PVP_BALANCE[id] ?? { hp: 80, atk: 2 };
                        const p = getPassiveById(id);
                        const role = getValkRole(id);
                        const roleName = VALKYRIE_ROLE_NAMES[role];
                        return (
                          <div
                            key={id}
                            className="pvp-stat-card"
                            title={`${v.c} · ${roleName}\nPvP: ❤️${bal.hp} ⚔️${bal.atk}(不受养成影响)\n被动·${p?.name ?? "—"}: ${p?.desc ?? ""}\n必杀·${v.ult.name || "—"}: ${v.ult.desc || ""}`}
                          >
                            <img src={ICON(id)} alt="" />
                            <div className="ps-name">{v.c}</div>
                            <div className={`ps-role role-${role}`}>{roleName}</div>
                            <div className="ps-stats">
                              ❤️{bal.hp} ⚔️{bal.atk}
                            </div>
                            <div className="ps-skill">被动·{p?.name ?? "—"}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="pvp-valk-grid">
                    {VALKYRIES.map((v) => (
                      <div
                        key={v.id}
                        className={`pvp-valk-cell ${myTeam.includes(v.id) ? "active" : ""}`}
                        title={v.c}
                        onClick={() => toggleTeam(v.id)}
                      >
                        <img src={ICON(v.id)} alt={v.c} />
                        <div>{v.c}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pvp-prep-side">
                  <div className="pvp-prep-title">
                    对方队伍({peerPicks.length}/{teamSize}) {peerReady ? "✅已准备" : "选择中…"}
                  </div>
                  <div className="pvp-slots">
                    {Array.from({ length: teamSize }).map((_, i) =>
                      peerPicks[i] != null ? (
                        <div key={i} className="pvp-slot filled">
                          <span className="pvp-slot-no">{i + 1}</span>
                          <img src={ICON(peerPicks[i]!)} alt="" />
                        </div>
                      ) : (
                        <div key={i} className="pvp-slot">
                          <span className="pvp-slot-no">{i + 1}</span>
                        </div>
                      ),
                    )}
                  </div>
                  {peerReady && (
                    <div className="pvp-peer-deck-note">
                      🃏 对方牌组已就绪({peerDeck.length}张) — 具体内容保密
                    </div>
                  )}
                </div>
              </div>

              {/* 出战牌组选择(备战编辑;「各自牌组」模式生效) */}
              <div className="pvp-deck-box">
                <div className="pvp-prep-title">
                  出战牌组({pvpDeck.length}/{DECK_MAX})
                  {deckMode === "fair" ? " · ⚖️公平模式使用标准牌组" : ""}
                  <button className="btn-mini" style={{ marginLeft: 8 }} onClick={resetPvpDeck}>
                    重置
                  </button>
                </div>
                <div className="deck-active compact">
                  {pvpDeck.length === 0 ? (
                    <div style={{ color: "var(--dim)", fontSize: 12 }}>牌组为空(开局自动补基础技)</div>
                  ) : (
                    pvpDeck.map((id, idx) => {
                      const c = ALL_CARDS.find((x) => x.id === id);
                      if (!c) return null;
                      return (
                        <span
                          key={`${id}-${idx}`}
                          className="deck-chip"
                          onClick={() => deckMode === "own" && togglePvpCard(id)}
                        >
                          {c.icon} {c.name}
                        </span>
                      );
                    })
                  )}
                </div>
                <div className="pvp-deck-pool">
                  {ALL_CARDS.map((c) => {
                    const has = ownedCards.has(c.id);
                    const inDeck = pvpDeck.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        className={`pvp-deck-card ${inDeck ? "in" : ""} ${!has ? "locked" : ""}`}
                        title={`${c.name} · 费${c.cost} · ${CARD_CAT_NAMES[c.cat] || c.type} · ${c.desc}${has ? "" : "(未拥有)"}`}
                        disabled={deckMode !== "own" || !has}
                        onClick={() => togglePvpCard(c.id)}
                      >
                        <span>{c.icon}</span>
                        <em>{c.name}</em>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                className={`btn ${myReady ? "" : "btn-primary"}`}
                disabled={myTeam.length !== teamSize}
                onClick={() => {
                  AudioEngine.sfx("click");
                  setReady(!myReady, { name: myName, valkIds: myTeam, deck: myCfg.deck });
                }}
              >
                {myTeam.length !== teamSize
                  ? `请选满 ${teamSize} 名学员`
                  : myReady
                    ? "取消准备"
                    : "✅ 准备对战"}
              </button>
            </>
          )}

          {info ? <div className="pvp-info">{info}</div> : null}
        </div>
      </section>
    );
  }

  /* ================= 对战中 ================= */
  if (!st) return null;
  const me = side === "host" ? st.host : st.guest;
  const opp = side === "host" ? st.guest : st.host;
  const myTurn = st.turn === side && !st.over;
  const handCards = me.hand.map((id) => hydrateCard(id));
  const iWin = st.winner === side;
  const iLost = st.winner != null && st.winner !== side;

  return (
    <section className="screen active" id="scr-pvp">
      <div className="battle-topbar">
        <HpBar
          f={me}
          label="我方"
          me
          teamIds={side === "host" ? st.teams.host : st.teams.guest}
          teamIdx={side === "host" ? st.teams.hostIdx : st.teams.guestIdx}
        />
        <div className="pvp-round">
          第 {st.round} 回合
          <button
            className="btn-mini pvp-surrender"
            onClick={() => {
              if (window.confirm("确定认输?本场将判负")) {
                AudioEngine.sfx("click");
                surrender();
              }
            }}
          >
            🏳️
          </button>
        </div>
        <HpBar
          f={opp}
          label="对方"
          me={false}
          teamIds={side === "host" ? st.teams.guest : st.teams.host}
          teamIdx={side === "host" ? st.teams.guestIdx : st.teams.hostIdx}
        />
      </div>

      {showBanner && <div key={st.turnNo} className="pvp-turn-banner">⚔️ 你的回合</div>}

      <div className="pvp-stage" id="pvp-stage" ref={stageRef}>
        <img
          ref={meImgRef}
          data-vid={me.valkId}
          className={`pvp-me-sprite ${st.over && iLost ? "ko" : ""}`}
          src={ICON(me.valkId)}
          alt={me.name}
        />
        <img
          ref={oppImgRef}
          data-vid={opp.valkId}
          className={`pvp-opp-sprite ${st.over && iWin ? "ko" : ""}`}
          src={ICON(opp.valkId)}
          alt={opp.name}
        />
        {st.lastFx.length > 0 && (
          <div className="pvp-fx-list">
            {st.lastFx.slice(-4).map((fx, i) => (
              <div key={i} style={{ color: fx.color }}>
                {fx.side === side ? "我方" : "对方"} {fx.text}
                {fx.dmg ? ` -${fx.dmg}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>

      {st.over ? (
        <div className="modal-wrap">
          <div className="modal">
            <div className="capture-title">
              {st.winner == null ? "⚖️ 平局" : iWin ? "🏆 对战胜利！" : "💀 惜败…"}
            </div>
            <div style={{ fontSize: 12, color: "var(--dim)", margin: "8px 0" }}>
              {st.round} 回合 · 我方最大连击 {me.maxCombo}
            </div>
            <div className="pvp-btns">
              <button
                className="btn btn-primary"
                disabled={againMe && !againPeer}
                onClick={() => {
                  AudioEngine.sfx("click");
                  requestAgain();
                }}
              >
                {againMe && !againPeer ? "等待对方…" : againMe && againPeer ? "开战中…" : "🔁 再来一局"}
              </button>
              <button className="btn" onClick={() => leave("已离开对战")}>
                🚪 离开房间
              </button>
            </div>
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
                    ⏱ {Math.ceil(remainMs / 1000)}s · 第 {Math.min(st.turnQIdx + 1, PVP_MAX_Q)}/
                    {PVP_MAX_Q} 题 · ⚡{st.turnCorrect}
                  </span>
                </div>
                <div className="battle-q-scroll">
                  <div className="battle-q-text">{st.currentQ?.q ?? "准备答题..."}</div>
                  <div className="battle-options">
                    {st.currentQ?.opts.map((opt, i) => (
                      <button
                        key={`${st.currentQ?.id ?? "q"}-${i}`}
                        className={
                          "battle-opt-btn" +
                          (st.answered && st.answered.pick === i ? " wrong" : "") +
                          (correctFlash?.idx === i ? " correct" : "") +
                          (st.qLocked && i === st.currentQ?.ans ? " reveal" : "") +
                          (st.qLocked || correctFlash ? " disabled" : "")
                        }
                        disabled={st.qLocked || !!correctFlash}
                        onClick={() => {
                          if (correctFlash) return;
                          AudioEngine.sfx("click");
                          pendingRef.current = { idx: i, qId: st.currentQ?.id ?? "" };
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
              <>
                <div
                  className={`battle-timer ${remainMs <= 10000 ? "low" : ""}`}
                >
                  <div
                    className="battle-timer-fill"
                    style={{ width: `${(remainMs / CARD_TIME_MS) * 100}%`, background: "var(--purple)" }}
                  />
                  <span className="battle-timer-text">
                    🃏 出牌 ⏱ {Math.ceil(remainMs / 1000)}s
                  </span>
                </div>
                <div className="battle-q-text">📝 出牌阶段 — 点击手牌使用技能</div>
              </>
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
            {st.phase === "card" && (
              <button
                className={`pvp-ult-btn ${!me.ultUsed && me.ultGauge >= me.ultMax ? "ready" : ""}`}
                disabled={me.ultUsed || me.ultGauge < me.ultMax}
                title={`必杀·${getValkById(me.valkId)?.ult.name ?? ""} — 每出一张牌 +1,满 ${me.ultMax} 可释放(每场对决 1 次)`}
                onClick={() => {
                  AudioEngine.sfx("click");
                  act({ act: "ult" });
                }}
              >
                {me.ultUsed
                  ? "✨ 必杀已用"
                  : me.ultGauge >= me.ultMax
                    ? "✨ 必杀可放!"
                    : `✨ 必杀 ${me.ultGauge}/${me.ultMax}`}
              </button>
            )}
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
        <div className="pvp-wait pvp-wait-live">
          <div>
            ⏳ 对方行动中(
            {st.phase === "question" ? `第 ${Math.min(st.turnQIdx + 1, PVP_MAX_Q)}/${PVP_MAX_Q} 题 · ⚡${st.turnCorrect}` : "出牌阶段"}
            )
          </div>
          {/* 对方本阶段倒计时(宿主取引擎时钟,客机本地递减;归零兜底提示) */}
          <div className="pvp-wait-timer">
            {remainMs > 0 ? `⏱ ${Math.ceil(remainMs / 1000)}s` : "对方思考中…"}
            <span className="bar">
              <i
                style={{
                  width: `${Math.min(100, (remainMs / (st.phase === "question" ? Q_TIME_MS : CARD_TIME_MS)) * 100)}%`,
                }}
              />
            </span>
          </div>
          {/* 等待方可同步心算:显示对方正在答的题干(不含选项) */}
          {st.phase === "question" && st.currentQ && (
            <div className="pvp-wait-q">{st.currentQ.q}</div>
          )}
          {st.skipNote && st.turn === side ? <div>{st.skipNote}</div> : null}
        </div>
      )}
    </section>
  );
}
