"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/lib/store";
import { AudioEngine } from "@/lib/audio";
import type { Question } from "@/lib/types";

const PAGE_SIZE = 30;

/** 10 题快速练习(线上版 review 的 quiz 模式) */
function Quiz({ qs, onExit }: { qs: Question[]; onExit: () => void }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const clearWrongQ = useGameStore((s) => s.clearWrongQ);
  const bumpWrongQ = useGameStore((s) => s.bumpWrongQ);

  const q = qs[idx];
  if (!q) {
    return (
      <div className="modal-wrap">
        <div className="modal">
          <div className="capture-title">🎉 练习完成！</div>
          <button className="btn btn-primary" onClick={onExit}>
            返回题库
          </button>
        </div>
      </div>
    );
  }

  const handlePick = (i: number) => {
    if (picked != null) return;
    setPicked(i);
    if (i === q.ans) {
      clearWrongQ(q.id);
    } else {
      bumpWrongQ(q.id, 1);
    }
  };

  return (
    <div className="modal-wrap">
      <div className="modal">
        <div className="capture-title">快速练习 ({idx + 1}/{qs.length})</div>
        <div className="battle-q-text">{q.q}</div>
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
            style={{ marginTop: 10 }}
            onClick={() => {
              setPicked(null);
              setIdx((v) => v + 1);
            }}
          >
            {idx >= qs.length - 1 ? "完成" : "下一题"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function BankScreen() {
  const questionPool = useGameStore((s) => s.questionPool);
  const meta = useGameStore((s) => s.meta);
  const setScreen = useGameStore((s) => s.setScreen);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [wrongOnly, setWrongOnly] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);

  const filtered = useMemo(() => {
    let arr = questionPool;
    if (wrongOnly) arr = arr.filter((q) => meta.wrongQ[q.id]);
    const s = search.trim().toLowerCase();
    if (s) {
      arr = arr.filter(
        (q) =>
          q.q.toLowerCase().includes(s) ||
          q.id.toLowerCase().includes(s) ||
          q.opts.some((o) => o.toLowerCase().includes(s)),
      );
    }
    return arr;
  }, [questionPool, meta.wrongQ, wrongOnly, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const items = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const wrongList = Object.keys(meta.wrongQ).length > 0;

  const quizQs = useMemo(() => {
    const pool = wrongOnly
      ? questionPool.filter((q) => meta.wrongQ[q.id])
      : questionPool;
    return pool.slice(0, 10);
  }, [questionPool, meta.wrongQ, wrongOnly]);

  return (
    <section className="screen active" id="scr-review">
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
          <div style={{ fontWeight: 800 }}>题库 ({questionPool.length}题)</div>
          <button
            className="btn-mini"
            disabled={quizQs.length === 0}
            onClick={() => {
              AudioEngine.sfx("click");
              setQuizOpen(true);
            }}
          >
            ⚡ 10题快练
          </button>
        </div>

        <div className="set-row">
          <input
            className="search-input"
            placeholder="搜索题目..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button
            className={`chip ${wrongOnly ? "active" : ""}`}
            onClick={() => {
              setWrongOnly((v) => !v);
              setPage(1);
            }}
          >
            只看错题{wrongList ? `(${Object.keys(meta.wrongQ).length})` : ""}
          </button>
        </div>

        <div className="bank-list">
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--dim)" }}>
              暂无题目{wrongOnly ? " · 错题本已清空 🎉" : ""}
            </div>
          ) : (
            items.map((q, i) => (
              <div key={q.id} className={`bank-item ${meta.wrongQ[q.id] ? "wrong" : ""}`}>
                <div className="bank-q-num">
                  #{(cur - 1) * PAGE_SIZE + i + 1}
                  {meta.wrongQ[q.id] ? ` ❌${meta.wrongQ[q.id]}` : ""}
                </div>
                <div className="bank-q-text">{q.q}</div>
                <div className="bank-opts">
                  {q.opts.map((o, oi) => (
                    <div
                      key={oi}
                      className={`bank-opt ${oi === q.ans ? "is-ans" : ""}`}
                    >
                      {o}
                      {oi === q.ans ? " ✅" : ""}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bank-pagination">
          <button
            className="btn-mini"
            disabled={cur <= 1}
            onClick={() => setPage(cur - 1)}
          >
            ‹
          </button>
          <span>
            {cur}/{totalPages}
          </span>
          <button
            className="btn-mini"
            disabled={cur >= totalPages}
            onClick={() => setPage(cur + 1)}
          >
            ›
          </button>
        </div>
      </div>

      {quizOpen && <Quiz qs={quizQs} onExit={() => setQuizOpen(false)} />}
    </section>
  );
}
