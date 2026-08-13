"use client";

import { useGameStore } from "@/lib/store";
import {
  getMaxHpFromMeta,
  getPlayerAtk,
  upgradeCost,
} from "@/lib/formulas";
import { AudioEngine } from "@/lib/audio";

export default function TrainScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const tryUpgradeHp = useGameStore((s) => s.tryUpgradeHp);
  const tryUpgradeAtk = useGameStore((s) => s.tryUpgradeAtk);

  const hpCost = upgradeCost(meta.metaHpLv);
  const atkCost = upgradeCost(meta.metaAtkLv);

  return (
    <section className="screen active" id="scr-train">
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
          <div style={{ fontWeight: 800 }}>🧬 全局养成</div>
        </div>

        <div className="set-row">
          <span>💰 养成金币</span>
          <b style={{ color: "var(--gold)" }}>{meta.metaGold}</b>
        </div>

        <div className="set-card">
          <div className="set-row">
            <span>❤️ 生命等级</span>
            <span style={{ color: "var(--cyan)" }}>{meta.metaHpLv}</span>
          </div>
          <div className="set-row">
            <span>❤️ 最大生命</span>
            <span>{getMaxHpFromMeta(meta.metaHpLv)}</span>
          </div>
          <div className="set-row">
            <span>下次升级费用</span>
            <span style={{ color: "var(--gold)" }}>{hpCost}</span>
          </div>
          <button
            className="btn btn-primary"
            disabled={meta.metaGold < hpCost}
            onClick={() => {
              AudioEngine.sfx("heal");
              tryUpgradeHp();
            }}
          >
            升级生命 +3
          </button>
        </div>

        <div className="set-card">
          <div className="set-row">
            <span>⚔️ 攻击等级</span>
            <span style={{ color: "var(--cyan)" }}>{meta.metaAtkLv}</span>
          </div>
          <div className="set-row">
            <span>⚔️ 攻击力</span>
            <span>{getPlayerAtk(meta.metaAtkLv)}</span>
          </div>
          <div className="set-row">
            <span>下次升级费用</span>
            <span style={{ color: "var(--gold)" }}>{atkCost}</span>
          </div>
          <button
            className="btn btn-primary"
            disabled={meta.metaGold < atkCost}
            onClick={() => {
              AudioEngine.sfx("coin");
              tryUpgradeAtk();
            }}
          >
            升级攻击 +1
          </button>
        </div>

        <div className="set-note">
          首次升级 5 金，之后每次 +2 金，无上限。<br />
          养成金币：冒险获得金币时同步存入。
        </div>
      </div>
    </section>
  );
}
