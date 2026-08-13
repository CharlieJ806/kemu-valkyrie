"use client";

import { useGameStore } from "@/lib/store";
import { AudioEngine } from "@/lib/audio";

export default function RestScreen() {
  const run = useGameStore((s) => s.run);
  const restHeal = useGameStore((s) => s.restHeal);
  const restTrain = useGameStore((s) => s.restTrain);
  const leaveRest = useGameStore((s) => s.leaveRest);

  if (!run) return null;

  return (
    <section className="screen active" id="scr-rest">
      <div className="rest-list">
        <div className="shop-title">☕ 咖啡厅</div>
        <div className="rest-card">
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>
            当前 HP: {Math.ceil(run.hp)} / {run.maxHp}
          </div>
          <button
            className="btn"
            onClick={() => {
              AudioEngine.sfx("heal");
              restHeal();
            }}
          >
            ☕ 休息一下 (回复30%HP)
          </button>
          <button
            className="btn"
            onClick={() => {
              AudioEngine.sfx("heal");
              restTrain();
            }}
          >
            🔧 简单特训（回复+金币）
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              AudioEngine.sfx("click");
              leaveRest();
            }}
          >
            离开咖啡厅
          </button>
        </div>
      </div>
    </section>
  );
}
