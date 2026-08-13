"use client";

import { useGameStore } from "@/lib/store";
import { AudioEngine } from "@/lib/audio";

export default function StudyScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const questionPool = useGameStore((s) => s.questionPool);
  const meta = useGameStore((s) => s.meta);

  const wrongCount = Object.keys(meta.wrongQ).length;
  const examReady = questionPool.length >= 100;

  const go = (id: "exam" | "wrong" | "bank") => {
    AudioEngine.sfx("click");
    setScreen(id);
  };

  return (
    <section className="screen active" id="scr-study">
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
          <div style={{ fontWeight: 800 }}>🏫 学习中心</div>
        </div>

        <div className="study-cards">
          <button
            className={`btn ${!examReady ? "empty" : ""}`}
            onClick={() => examReady && go("exam")}
          >
            <div style={{ fontSize: 30 }}>📝</div>
            <div style={{ fontWeight: 800 }}>科目一模拟</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>
              100题 · 45分钟 · 90分合格
              {!examReady ? ` (题库仅${questionPool.length}题)` : ""}
            </div>
          </button>

          <button className="btn" onClick={() => go("wrong")}>
            <div style={{ fontSize: 30 }}>❌</div>
            <div style={{ fontWeight: 800 }}>
              错题巩固{wrongCount > 0 ? ` (${wrongCount})` : ""}
            </div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>
              答对自动移出错题本
            </div>
          </button>

          <button className="btn" onClick={() => go("bank")}>
            <div style={{ fontSize: 30 }}>📚</div>
            <div style={{ fontWeight: 800 }}>题库浏览</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>
              分页 · 搜索 · 10题快练
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}
