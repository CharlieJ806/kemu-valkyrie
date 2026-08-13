import type { RunState } from "./types";
import { rand } from "./formulas";
import { damagePlayer } from "./battle";

/** 事件定义:effect 修改 run 并返回 toast 文案(迁移自 standalone openEvent) */
export type GameEventDef = {
  id: string;
  title: string;
  text: string;
  choices: {
    id: string;
    text: string;
    effect: (run: RunState) => string;
  }[];
};

export const GAME_EVENTS: GameEventDef[] = [
  {
    id: "merchant",
    title: "神秘商人",
    text: "一个神秘商人出现在你面前，愿意用一张稀有卡片换取你的一些金币。",
    choices: [
      {
        id: "pay",
        text: "支付30金币 (获得稀有卡)",
        effect: (run) => {
          if (run.gold < 30) return "金币不足";
          run.gold -= 30;
          return "获得稀有卡片！";
        },
      },
      { id: "refuse", text: "拒绝", effect: () => "" },
    ],
  },
  {
    id: "hotspring",
    title: "温泉",
    text: "你发现了一处温泉，可以选择休息回复HP，但会浪费时间。",
    choices: [
      {
        id: "soak",
        text: "泡温泉 (回复25%HP)",
        effect: (run) => {
          run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.25));
          return "回复了HP！";
        },
      },
      { id: "leave", text: "继续前进", effect: () => "" },
    ],
  },
  {
    id: "trainer",
    title: "训练师挑战",
    text: "一位路过的训练师向你发起挑战！高风险，高回报。",
    choices: [
      {
        id: "fight",
        text: "接受挑战 (获得50金币，但可能受伤)",
        effect: (run) => {
          if (Math.random() < 0.6) {
            run.gold += 50;
            return "战胜训练师！+50金币";
          }
          damagePlayer(run, rand(8, 18));
          return "训练师太强了！";
        },
      },
      { id: "refuse", text: "婉拒", effect: () => "" },
    ],
  },
  {
    id: "pkm_center",
    title: "宝可梦中心",
    text: "你遇到了一台野外宝可梦中心的治疗机器。",
    choices: [
      {
        id: "heal",
        text: "使用机器 (回复至满血)",
        effect: (run) => {
          run.hp = run.maxHp;
          return "完全回复！";
        },
      },
      { id: "leave", text: "继续赶路", effect: () => "" },
    ],
  },
];

export function pickRandomEvent(): GameEventDef {
  return GAME_EVENTS[Math.floor(Math.random() * GAME_EVENTS.length)]!;
}
