"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { getValkName } from "@/lib/formulas";
import { ICON } from "@/lib/icon";
import { AudioEngine } from "@/lib/audio";

/** 剧情对白过场:立绘 + 打字机对白,点击/空格推进,可跳过 */
export default function StoryScreen() {
  const storyQueue = useGameStore((s) => s.storyQueue);
  const storyAdvance = useGameStore((s) => s.storyAdvance);
  const storySkip = useGameStore((s) => s.storySkip);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const line = storyQueue?.[0] ?? null;

  // 每条对白重新打字
  useEffect(() => {
    setTyping(true);
    setShown(0);
    if (timerRef.current) clearInterval(timerRef.current);
    if (!line) return;
    const full = line.text;
    // 逐字显示(每 45ms 一字,短句快一点)
    timerRef.current = setInterval(() => {
      setShown((n) => {
        if (n >= full.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTyping(false);
          return n;
        }
        return n + 1;
      });
    }, 42);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyQueue?.length, storyQueue?.[0]?.text]);

  const displayText = useMemo(() => (line ? line.text.slice(0, shown) : ""), [line, shown]);

  if (!line) {
    // 队列空:推进收尾(回地图)
    return null;
  }

  const isNarrator = line.speaker === "narrator";
  const speakerName = isNarrator ? "旁白" : getValkName(line.speaker as number);

  const handleClick = () => {
    if (typing) {
      // 打字中点击 → 立即显示全文
      if (timerRef.current) clearInterval(timerRef.current);
      setShown(line.text.length);
      setTyping(false);
      AudioEngine.sfx("click");
      return;
    }
    AudioEngine.sfx("click");
    storyAdvance();
  };

  return (
    <section className="screen active" id="scr-story">
      <div className="story-bg" />
      <div className="story-inner">
        {!isNarrator && (
          <div className="story-portrait">
            <img src={ICON(line.speaker as number)} alt={speakerName} />
          </div>
        )}
        <div className={`story-bubble ${isNarrator ? "narrator" : ""}`}>
          {!isNarrator && <div className="story-name">{speakerName}</div>}
          <div className="story-text">
            {displayText}
            {typing && <span className="story-caret">▍</span>}
          </div>
        </div>
        <div className="story-hint">
          {typing ? "点击 显示全文" : "点击继续 ▸"}
        </div>
        <button
          className="btn-mini story-skip"
          onClick={() => {
            AudioEngine.sfx("click");
            storySkip();
          }}
        >
          跳过 ▸▸
        </button>
      </div>
      {/* 整屏点击推进(跳过按钮除外) */}
      <div className="story-clicker" onClick={handleClick} />
    </section>
  );
}
