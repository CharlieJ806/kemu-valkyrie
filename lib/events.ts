import type { RunState } from "./types";
import { rand } from "./formulas";
import { damagePlayer } from "./battle";
import { getValkById } from "@/data";

/** 事件定义:effect 修改 run 并返回 toast 文案;text 可为函数(动态读取队伍状态) */
export type GameEventDef = {
  id: string;
  title: string;
  text: string;
  /** 事件插画 key(public/cg/{cg}.webp),可选 */
  cg?: string;
  choices: {
    id: string;
    text: string | ((run: RunState) => string);
    effect: (run: RunState) => string;
  }[];
};

/** 事件弹窗渲染用:把 choice.text 解析为显示文本 */
export function resolveChoiceText(
  choice: GameEventDef["choices"][number],
  run: RunState,
): string {
  return typeof choice.text === "function" ? choice.text(run) : choice.text;
}
export const GAME_EVENTS: GameEventDef[] = [
  {
    id: "garage",
    title: "神秘车库",
    cg: "cg-awaken",
    text: "里世界深处停着一辆蒙尘的旧车，车钥匙孔发出微光……拔出钥匙，即可为一名学员点火觉醒：获得第二板块、成为领队、解锁必杀技！（每局限一次）",
    choices: [
      {
        id: "awaken",
        text: (run) => {
          const alive = run.team.some(
            (id, i) => (run.teamHp[i] || 0) > 0 && !run.awakened?.[id],
          );
          if (!alive) return "已点火过了 — 领取30金币";
          const idx = run.team.findIndex(
            (id, i) => (run.teamHp[i] || 0) > 0 && !run.awakened?.[id],
          );
          const v = getValkById(run.team[idx]!);
          return `为 ${v?.c ?? "学员"} 点火觉醒（成为领队·解锁必杀）`;
        },
        effect: (run) => {
          const idx = run.team.findIndex(
            (id, i) => (run.teamHp[i] || 0) > 0 && !run.awakened?.[id],
          );
          if (idx < 0) {
            // 本局已点火过 → 金币安慰奖
            run.gold += 30;
            return "已点火过了，获得30金币！";
          }
          const id = run.team[idx]!;
          const v = getValkById(id);
          run.awakened = { ...run.awakened, [id]: v?.attr2 ?? v?.attr ?? "safety" };
          run.leaderId = id;
          run.ultGauge = 0;
          // 点火余波:全员回复 20%
          run.teamHp = run.teamHp.map((hp, i) =>
            Math.min(
              run.teamMaxHp[i] || hp,
              Math.floor(hp + (run.teamMaxHp[i] || hp) * 0.2),
            ),
          );
          return `${v?.c ?? "学员"} 点火觉醒！获得第二板块，成为领队！`;
        },
      },
      { id: "leave", text: "离开车库", effect: () => "" },
    ],
  },
  {
    id: "merchant",
    title: "黑市黄牛",
    text: "一个鬼鬼祟祟的黄牛拦住你，兜售一张来路不明的驾驶技能卡。",
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
    id: "carwash",
    title: "自动洗车房",
    text: "路边有一间自动洗车房，泡沫和水雾看起来能洗净疲劳。",
    choices: [
      {
        id: "wash",
        text: "洗个车 (回复25%HP)",
        effect: (run) => {
          run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.25));
          saveTeamHpFromActive(run);
          return "焕然一新！回复了HP！";
        },
      },
      { id: "leave", text: "继续前进", effect: () => "" },
    ],
  },
  {
    id: "roadrage",
    title: "路怒挑衅者",
    text: "一辆车摇下车窗朝你疯狂鸣笛挑衅！教训他？",
    choices: [
      {
        id: "fight",
        text: "接受挑衅 (获得50金币，但可能受伤)",
        effect: (run) => {
          if (Math.random() < 0.6) {
            run.gold += 50;
            return "文明驾车完胜！+50金币";
          }
          damagePlayer(run, rand(8, 18));
          return "路怒者太疯狂了！";
        },
      },
      { id: "refuse", text: "文明礼让", effect: () => "" },
    ],
  },
  {
    id: "repair",
    title: "4S 维修店",
    text: "你遇到了一家开在里世界的 4S 维修店，技师愿意免费帮你全面检修。",
    choices: [
      {
        id: "heal",
        text: "全面检修 (回复至满血)",
        effect: (run) => {
          run.hp = run.maxHp;
          saveTeamHpFromActive(run);
          return "完全回复！";
        },
      },
      { id: "leave", text: "继续赶路", effect: () => "" },
    ],
  },
];

/** 把 run.hp 回写到出战学员(事件回复走 run.hp,需同步队伍血量) */
function saveTeamHpFromActive(run: RunState): void {
  const i = run.activeIdx ?? 0;
  if (run.teamHp && run.teamHp[i] != null) {
    run.teamHp[i] = run.hp;
  }
}

export function pickRandomEvent(): GameEventDef {
  return GAME_EVENTS[Math.floor(Math.random() * GAME_EVENTS.length)]!;
}
