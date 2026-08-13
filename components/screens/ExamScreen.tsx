"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { buildExamSession, gradeExam, isExamPass, EXAM_CONST } from "@/lib/exam";
import { AudioEngine } from "@/lib/audio";
import type { ExamSession } from "@/lib/types";

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ExamScreen() {
  const questionPool = useGameStore((s) => s.questionPool);
  const setScreen = useGameStore((s) => s.setScreen);
  const recordExamResult = useGameStore((s) => s.recordExamResult);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [result, setResult] = useState<{
    score: number;
    wrongCount: number;
    pass: boolean;
  } | null>(null);
  const recordedRef = useRef(false);

  // 倒计时(250ms 间隔,线上版行为)
  useEffect(() => {
    if (!session || session.done) return;
    const timer = setInterval(() => {
      setSession((s) => {
        if (!s || s.done) return s;
        const t = s.timeLeft - 250;
        if (t <= 0) {
          // 自动交卷
          submit(s);
          return { ...s, timeLeft: 0, done: true };
        }
        return { ...s, timeLeft: t };
      });
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.done]);

  const submit = (sess: ExamSession) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const { score, wrongIds } = gradeExam(sess);
    recordExamResult(score, wrongIds);
    setResult({ score, wrongCount: wrongIds.length, pass: isExamPass(score) });
    AudioEngine.sfx(isExamPass(score) ? "fanfare" : "defeat");
  };

  const start = () => {
    const sess = buildExamSession(questionPool);
    if (!sess) return;
    recordedRef.current = false;
    setResult(null);
    setSession(sess);
    AudioEngine.sfx("click");
  };

  /* ── 结果页 ── */
  if (result && session?.done) {
    return (
      <section className="screen active" id="scr-exam">
        <div className="title-inner">
          <div className={`over-title ${result.pass ? "win" : ""}`}>
            {result.pass ? "🎉 考试合格！" : "💀 未达合格线"}
          </div>
          <div className="over-stats">
            <div className="over-stat">
              得分: <b>{result.score}</b> / {session.qs.length}
            </div>
            <div className="over-stat">
              合格线: <b>{EXAM_CONST.PASS_LINE}</b>
            </div>
            <div className="over-stat">
              错题: <b>{result.wrongCount}</b> 道 (已记入错题本)
            </div>
          </div>
          <div className="over-sub">
            错题计入错题本(答对不自动清除)
          </div>
          <div className="over-btns">
            <button className="btn btn-primary" onClick={() => setScreen("study")}>
              返回学习中心
            </button>
          </div>
        </div>
      </section>
    );
  }

  /* ── 考试中 ── */
  if (session) {
    const q = session.qs[session.idx]!;
    const picked = session.picked[session.idx];

    const pick = (i: number) => {
      setSession((s) => {
        if (!s || s.done) return s;
        const picked2 = [...s.picked];
        picked2[s.idx] = i;
        return { ...s, picked: picked2 };
      });
    };

    const toggleMark = () => {
      setSession((s) => {
        if (!s) return s;
        const marked = [...s.marked];
        marked[s.idx] = !marked[s.idx];
        return { ...s, marked };
      });
    };

    const jump = (i: number) => {
      setSession((s) => (s ? { ...s, idx: i } : s));
    };

    const submitNow = () => submit(session);

    return (
      <section className="screen active" id="scr-exam">
        <div className="title-inner" style={{ justifyContent: "flex-start", paddingTop: 16 }}>
          <div className="set-row">
            <div style={{ fontWeight: 800 }}>
              科目一模拟 · {session.idx + 1}/{session.qs.length}
            </div>
            <div className="exam-timer">⏱ {fmtTime(session.timeLeft)}</div>
          </div>

          <div className="exam-body">
            <div className="exam-main">
              <div className="exam-q">{q.q}</div>

              <div className="battle-options" style={{ flexDirection: "column" }}>
                {q.opts.map((opt, i) => (
                  <button
                    key={i}
                    className={
                      "battle-opt-btn" +
                      (picked === i ? (i === q.ans ? " correct" : " wrong") : "")
                    }
                    onClick={() => pick(i)}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              <div className="set-row">
                <button
                  className={`btn-mini ${session.marked[session.idx] ? "active" : ""}`}
                  onClick={toggleMark}
                >
                  🚩 {session.marked[session.idx] ? "取消标记" : "标记存疑"}
                </button>
                <button
                  className="btn-mini"
                  disabled={session.idx <= 0}
                  onClick={() => jump(session.idx - 1)}
                >
                  ‹ 上一题
                </button>
                <button
                  className="btn-mini"
                  disabled={session.idx >= session.qs.length - 1}
                  onClick={() => jump(session.idx + 1)}
                >
                  下一题 ›
                </button>
              </div>
            </div>

            {/* 题号导航(桌面端右侧边栏) */}
            <div className="exam-nav">
              <div className="exam-grid">
                {session.qs.map((_, i) => (
                  <button
                    key={i}
                    className={`exam-cell ${
                      i === session.idx ? "current" : ""
                    } ${session.picked[i] != null ? "answered" : ""} ${
                      session.marked[i] ? "marked" : ""
                    }`}
                    onClick={() => jump(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={submitNow}>
                交卷
              </button>
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (window.confirm("确定要退出考试吗？本次成绩将不记录。")) {
                // setSession(null) 会触发计时 effect 的 cleanup 自动清计时器
                recordedRef.current = true; // 防止退出后被交卷逻辑记录
                setSession(null);
                setResult(null);
                setScreen("study");
              }
            }}
          >
            ✖ 退出考试 (不记录成绩)
          </button>
        </div>
      </section>
    );
  }

  /* ── 开考确认 ── */
  return (
    <section className="screen active" id="scr-exam">
      <div className="title-inner">
        <div className="title-logo">
          <div className="logo-top">科目一模拟</div>
          <div className="logo-sub">正式模考</div>
        </div>
        <div className="over-stats">
          <div className="over-stat">题目: {EXAM_CONST.COUNT} 题</div>
          <div className="over-stat">时间: {EXAM_CONST.TIME_MS / 60000} 分钟</div>
          <div className="over-stat">合格线: {EXAM_CONST.PASS_LINE} 分</div>
        </div>
        <div className="over-sub">
          错题将计入错题本。可标记存疑题、自由交卷。
        </div>
        <div className="over-btns">
          <button
            className="btn btn-primary"
            disabled={questionPool.length < EXAM_CONST.COUNT}
            onClick={start}
          >
            开始考试
          </button>
          <button className="btn" onClick={() => setScreen("study")}>
            返回
          </button>
        </div>
      </div>
    </section>
  );
}
