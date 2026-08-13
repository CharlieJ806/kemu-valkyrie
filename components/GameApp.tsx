"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import { AudioEngine } from "@/lib/audio";
import { domBurst } from "@/lib/dom-fx";
import TitleScreen from "./screens/TitleScreen";
import StarterScreen from "./screens/StarterScreen";
import MapScreen from "./screens/MapScreen";
import BattleScreen from "./screens/BattleScreen";
import ShopScreen from "./screens/ShopScreen";
import RestScreen from "./screens/RestScreen";
import DexScreen from "./screens/DexScreen";
import BankScreen from "./screens/BankScreen";
import TrainScreen from "./screens/TrainScreen";
import GachaScreen from "./screens/GachaScreen";
import DeckBuildScreen from "./screens/DeckBuildScreen";
import SettingsScreen from "./screens/SettingsScreen";
import StudyScreen from "./screens/StudyScreen";
import ExamScreen from "./screens/ExamScreen";
import WrongScreen from "./screens/WrongScreen";
import OverScreen from "./screens/OverScreen";
import Modal from "./ui/Modal";
import Toast from "./ui/Toast";

export default function GameApp() {
  const screen = useGameStore((s) => s.screen);
  const hydrated = useGameStore((s) => s.hydrated);
  const hydrate = useGameStore((s) => s.hydrate);
  const meta = useGameStore((s) => s.meta);
  const gameOver = useGameStore((s) => s.gameOver);
  const overSfxDone = useRef(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    AudioEngine.setSfxVol(meta.soundEnabled ? 0.8 : 0);
  }, [hydrated, meta.soundEnabled]);

  // 首触解锁音频
  useEffect(() => {
    const unlock = () => {
      AudioEngine.unlock();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  // 全局键盘:1-4 答题 / E 结束回合(迁移自 standalone main.js)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        const st = useGameStore.getState();
        if (st.screen === "over") {
          st.setScreen("title");
          return;
        }
      }
      if (!useGameStore.getState().run?.inBattle) return;
      const keys = ["1", "2", "3", "4"];
      const idx = keys.indexOf(e.key);
      if (idx >= 0) {
        useGameStore.getState().answer(idx);
        return;
      }
      if (e.key === "e" || e.key === "E") {
        const st = useGameStore.getState();
        const run = st.run;
        if (!run) return;
        if (run.turnPhase === "question" && run.turnCorrect > 0) {
          st.enterCardPhase();
        } else if (run.turnPhase === "card") {
          st.endTurnAction();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 结算音效
  useEffect(() => {
    if (screen !== "over" || !gameOver) {
      overSfxDone.current = false;
      return;
    }
    if (overSfxDone.current) return;
    overSfxDone.current = true;
    AudioEngine.sfx(gameOver.win ? "fanfare" : "defeat");
    if (gameOver.win) {
      const layer = document.getElementById("app-fx-layer");
      domBurst(layer, 50, 30, "#ffd700", 30);
    }
  }, [screen, gameOver]);

  if (!hydrated) {
    return (
      <div id="app">
        <div id="shake-wrap">
          <section className="screen active" id="scr-title">
            <div className="title-inner">
              <div className="title-logo">
                <div className="logo-top">宝可驾</div>
                <div className="logo-sub">交 规 地 牢</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div id="app">
      <div id="shake-wrap">
        {screen === "title" && <TitleScreen />}
        {screen === "starter" && <StarterScreen />}
        {screen === "map" && <MapScreen />}
        {screen === "battle" && <BattleScreen />}
        {screen === "shop" && <ShopScreen />}
        {screen === "rest" && <RestScreen />}
        {screen === "dex" && <DexScreen />}
        {screen === "bank" && <BankScreen />}
        {screen === "train" && <TrainScreen />}
        {screen === "gacha" && <GachaScreen />}
        {screen === "deckbuild" && <DeckBuildScreen />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "study" && <StudyScreen />}
        {screen === "exam" && <ExamScreen />}
        {screen === "wrong" && <WrongScreen />}
        {screen === "over" && <OverScreen />}
      </div>
      <div
        id="app-fx-layer"
        className="fx-layer"
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
      />
      <Modal />
      <Toast />
    </div>
  );
}
