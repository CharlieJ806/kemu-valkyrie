"use client";

import { useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { parseImportedQuestions } from "@/lib/questions";
import { AudioEngine } from "@/lib/audio";

export default function SettingsScreen() {
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const toggleSound = useGameStore((s) => s.toggleSound);
  const setBgmVol = useGameStore((s) => s.setBgmVol);
  const setSfxVol = useGameStore((s) => s.setSfxVol);
  const wipeAll = useGameStore((s) => s.wipeAll);
  const importQuestions = useGameStore((s) => s.importQuestions);
  const exportSaveCode = useGameStore((s) => s.exportSaveCode);
  const importSaveCode = useGameStore((s) => s.importSaveCode);
  const showToast = useGameStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importCode, setImportCode] = useState("");

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

  const handleExportSave = () => {
    const code = exportSaveCode();
    if (!code) {
      showToast("导出失败", 1500);
      return;
    }
    navigator.clipboard
      ?.writeText(code)
      .then(() => showToast("存档码已复制到剪贴板", 2200))
      .catch(() => {
        window.prompt("复制下方存档码(手动全选复制):", code);
        showToast("已生成存档码", 2200);
      });
    AudioEngine.sfx("click");
  };

  const handleImportSave = () => {
    if (!importCode.trim()) {
      showToast("请先粘贴存档码", 1500);
      return;
    }
    if (!window.confirm("导入将覆盖当前存档,确定继续吗?")) return;
    importSaveCode(importCode);
    setImportCode("");
    AudioEngine.sfx("click");
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
          <div style={{ fontWeight: 800, flex: 1, textAlign: "center" }}>⚙️ 游戏设置</div>
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
          <span>🎵 音乐音量</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((meta.bgmVol ?? 0.6) * 100)}
            onChange={(e) => {
              setBgmVol(Number(e.target.value) / 100);
              AudioEngine.sfx("click");
            }}
          />
        </div>

        <div className="set-row">
          <span>🔔 音效音量</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((meta.sfxVol ?? 0.8) * 100)}
            onChange={(e) => {
              setSfxVol(Number(e.target.value) / 100);
              AudioEngine.sfx("click");
            }}
          />
        </div>

        <div className="set-row">
          <span>📊 游戏统计</span>
          <span style={{ fontSize: 12, color: "var(--dim)" }}>
            总冒险 {meta.totalRuns} | 最高分 {meta.bestScore} | 最深街区 {meta.bestFloor}
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
          <span>💾 导出存档</span>
          <button className="btn-mini" onClick={handleExportSave}>
            复制存档码
          </button>
        </div>

        <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <span>📥 导入存档</span>
          <textarea
            className="save-code-input"
            placeholder="粘贴存档码..."
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            rows={2}
          />
          <button className="btn-mini" onClick={handleImportSave}>
            导入并覆盖
          </button>
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
          驾考女武神 · 交规里世界净化战<br />
          科目一题库 1034 题 · 四大板块卡牌 · 点火觉醒
        </div>
      </div>
    </section>
  );
}
