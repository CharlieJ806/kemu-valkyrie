"use client";

import { useGameStore } from "@/lib/store";
import { ACHIEVEMENTS, unlockedCount } from "@/lib/achievements";
import { AudioEngine } from "@/lib/audio";

export default function AchievementsScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const unlocked = unlockedCount(meta);

  return (
    <section className="screen active" id="scr-achievements">
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
          <div style={{ fontWeight: 800, flex: 1, textAlign: "center" }}>
            🏅 成就 ({unlocked}/{ACHIEVEMENTS.length})
          </div>
        </div>

        <div className="dex-progress">
          已解锁 {unlocked} / {ACHIEVEMENTS.length} · 每项成就奖励养成金币
        </div>

        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = !!meta.achievements?.[a.id];
            return (
              <div key={a.id} className={`ach-cell ${got ? "got" : "locked"}`}>
                <div className="ach-icon">{got ? a.icon : "🔒"}</div>
                <div className="ach-name">{a.name}</div>
                <div className="ach-desc">{a.desc}</div>
                <div className="ach-reward">
                  {got ? "✓ 已达成" : `+${a.reward} 金币`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
