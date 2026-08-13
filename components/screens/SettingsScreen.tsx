"use client";

import { useRef } from "react";
import { useGameStore } from "@/lib/store";
import { parseImportedQuestions } from "@/lib/questions";
import { AudioEngine } from "@/lib/audio";

export default function SettingsScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const toggleSound = useGameStore((s) => s.toggleSound);
  const wipeAll = useGameStore((s) => s.wipeAll);
  const importQuestions = useGameStore((s) => s.importQuestions);
  const showToast = useGameStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result));
        if (Array.isArray(data) && data.length > 0) {
          importQuestions(parseImportedQuestions(data));
        } else {
          showToast("文件格式错误", 1500);
        }
      } catch {
        showToast("文件格式错误", 1500);
      }
    };
    reader.readAsText(file);
  };

  return (
    <section className="screen active" id="scr-settings">
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
          <div style={{ fontWeight: 800 }}>⚙️ 游戏设置</div>
        </div>

        <div className="set-row">
          <span>🔊 音效</span>
          <button
            className={`btn-mini ${meta.soundEnabled ? "" : "empty"}`}
            onClick={() => {
              AudioEngine.sfx("click");
              toggleSound();
            }}
          >
            {meta.soundEnabled ? "开启" : "关闭"}
          </button>
        </div>

        <div className="set-row">
          <span>📊 游戏统计</span>
          <span style={{ fontSize: 12, color: "var(--dim)" }}>
            总游戏 {meta.totalRuns} | 最高分 {meta.bestScore} | 最高层 {meta.bestFloor}
          </span>
        </div>

        <div className="set-row">
          <span>🏆 累计答题</span>
          <span style={{ fontSize: 12, color: "var(--dim)" }}>
            {meta.totalCorrect}/{meta.totalAnswered}
          </span>
        </div>

        <div className="set-row">
          <span>❌ 错题本</span>
          <span style={{ fontSize: 12, color: "var(--dim)" }}>
            {Object.keys(meta.wrongQ).length} 道
          </span>
        </div>

        <div className="set-row">
          <span>📂 导入题库</span>
          <button
            className="btn-mini"
            onClick={() => fileRef.current?.click()}
          >
            选择文件
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              handleImport(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="set-row">
          <span>🗑️ 重置所有数据</span>
          <button
            className="btn-mini danger"
            onClick={() => {
              AudioEngine.sfx("click");
              if (window.confirm("确定要重置所有数据吗？此操作不可恢复！")) {
                wipeAll();
              }
            }}
          >
            重置
          </button>
        </div>

        <div className="set-note">
          宝可驾 Pokerogue 壳 · Next.js 移植版<br />
          宝可梦数据 pokeapi · 题库 科目一 1034 题
        </div>
      </div>
    </section>
  );
}
