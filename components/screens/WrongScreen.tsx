"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/lib/store";
import { AudioEngine } from "@/lib/audio";
import type { Question } from "@/lib/types";

export default function WrongScreen() {
  const questionPool = useGameStore((s) => s.questionPool);
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const [search, setSearch] = useState("");
  const [practice, setPractice] = useState(false);

  // 错题列表:按错次降序再按 id
  const wrongList = useMemo(() => {
    const qmap = new Map(questionPool.map((q) => [q.id, q]));
    const list = Object.entries(meta.wrongQ)
      .map(([id, fails]) => ({ q: qmap.get(id), fails }))
      .filter((x): x is { q: Question; fails: number } => !!x.q)
      .sort((a, b) => b.fails - a.fails || a.q.id.localeCompare(b.q.id));
    const s = search.trim().toLowerCase();
    if (s) {
      return list.filter(
        (x) =>
          x.q.q.toLowerCase().includes(s) ||
          x.q.id.toLowerCase().includes(s) ||
          x.q.opts.some((o) => o.toLowerCase().includes(s)),
      );
    }
    return list;
  }, [questionPool, meta.wrongQ, search]);

  const practiceQs = useMemo(
    () =>
      questionPool
        .filter((q) => meta.wrongQ[q.id])
        .sort((a, b) => (meta.wrongQ[b.id] || 0) - (meta.wrongQ[a.id] || 0)),
    [questionPool, meta.wrongQ],
  );

  /* ── 练习会话 ── */
  if (practice) {
    const active = practiceQs.filter((q) => meta.wrongQ[q.id]);
    if (active.length === 0) {
      return (
        <section className="screen active" id="scr-wrong">
          <div className="title-inner">
            <div className="over-title win">🎉 错题全部清空！</div>
            <button className="btn btn-primary" onClick={() => setPractice(false)}>
              返回错题本
            </button>
          </div>
        </section>
      );
    }

    return <PracticeSession qs={active} onDone={() => setPractice(false)} />;
  }

  return (
    <section className="screen active" id="scr-wrong">
      <div className="title-inner" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
        <div className="set-row">
          <button
            className="btn btn-ghost"
            onClick={() => {
              AudioEngine.sfx("click");
              setScreen("study");
            }}
          >
            ← 返回
          </button>
          <div style={{ fontWeight: 800 }}>❌ 错题本 ({wrongList.length})</div>
          <button
            className="btn-mini"
            disabled={practiceQs.length === 0}
            onClick={() => {
              AudioEngine.sfx("click");
              setPractice(true);
            }}
          >
            ⚡ 开始巩固
          </button>
        </div>

        <div className="set-row">
          <input
            className="search-input"
            placeholder="搜索错题..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bank-list">
          {wrongList.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--dim)" }}>
              错题本空空如也 🎉
            </div>
          ) : (
            wrongList.map(({ q, fails }) => (
              <div key={q.id} className="bank-item wrong">
                <div className="bank-q-num">
                  #{q.id} ❌{fails}次
                </div>
                <div className="bank-q-text">{q.q}</div>
                <div className="bank-opts">
                  {q.opts.map((o, oi) => (
                    <div key={oi} className={`bank-opt ${oi === q.ans ? "is-ans" : ""}`}>
                      {o}
                      {oi === q.ans ? " ✅" : ""}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/** 练习会话:答对移出错题本,答错计数+1 */
function PracticeSession({ qs, onDone }: { qs: Question[]; onDone: () => void }) {
  const clearWrongQ = useGameStore((s) => s.clearWrongQ);
  const bumpWrongQ = useGameStore((s) => s.bumpWrongQ);
  const showToast = useGameStore((s) => s.showToast);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const q = qs[idx];
  if (!q) {
    return (
      <section className="screen active" id="scr-wrong">
        <div className="title-inner">
          <div className="over-title win">🎉 错题全部清空！</div>
          <button className="btn btn-primary" onClick={onDone}>
            返回错题本
          </button>
        </div>
      </section>
    );
  }

  const handlePick = (i: number) => {
    if (picked != null) return;
    setPicked(i);
    if (i === q.ans) {
      clearWrongQ(q.id);
      showToast("答对了，已从错题本移除", 1600);
      AudioEngine.sfx("correct");
    } else {
      bumpWrongQ(q.id, 1);
      AudioEngine.sfx("wrong");
    }
  };

  return (
    <section className="screen active" id="scr-wrong">
      <div className="title-inner" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
        <div className="set-row">
          <div style={{ fontWeight: 800 }}>
            错题巩固 ({idx + 1}/{qs.length})
          </div>
        </div>
        <div className="exam-q">{q.q}</div>
        <div className="battle-options" style={{ flexDirection: "column" }}>
          {q.opts.map((opt, i) => (
            <button
              key={i}
              className={
                "battle-opt-btn" +
                (picked != null && i === q.ans
                  ? " correct"
                  : picked === i
                    ? " wrong"
                    : "")
              }
              onClick={() => handlePick(i)}
            >
              {opt}
            </button>
          ))}
        </div>
        {picked != null && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setPicked(null);
              setIdx((v) => v + 1);
            }}
          >
            {idx >= qs.length - 1 ? "完成" : "下一题"}
          </button>
        )}
      </div>
    </section>
  );
}
