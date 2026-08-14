/* 成就系统:定义 + 判定。checkAchievements 由 store 在关键节点调用,
 * 直接修改 meta(成就标记 + 发放养成金币),返回新解锁列表供 UI toast。 */

import type { MetaState, RunState } from "./types";
import { ALL_CARDS } from "./cards";
import { VALKYRIES, REGULAR_MONSTERS, STORY } from "@/data";

/** 章节总数(与 store.TOTAL_CHAPTERS 一致;避免循环引用在此独立计算) */
const TOTAL_CHAPTERS = STORY.chapters.length;

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_battle", name: "初出茅庐", desc: "完成第 1 场战斗", icon: "⚔️", reward: 30 },
  { id: "first_boss", name: "首胜魔王", desc: "首次通关任意章节", icon: "👑", reward: 80 },
  { id: "loop1_clear", name: "一周目制霸", desc: "通关全部 9 章(完成一周目)", icon: "🏁", reward: 300 },
  { id: "loop3_clear", name: "三周目老司机", desc: "完成第 3 周目", icon: "🏎️", reward: 500 },
  { id: "combo10", name: "连击新手", desc: "单局连击 ≥ 10", icon: "🔥", reward: 50 },
  { id: "combo20", name: "连击大师", desc: "单局连击 ≥ 20", icon: "🌋", reward: 150 },
  { id: "no_damage", name: "无伤传说", desc: "无伤通关任一章节", icon: "🛡️", reward: 200 },
  { id: "exam_pass", name: "合格学员", desc: "模拟考试首次 ≥ 90 分", icon: "📝", reward: 100 },
  { id: "exam_perfect", name: "满分学霸", desc: "模拟考试满分", icon: "💯", reward: 300 },
  { id: "first_catch", name: "净化专员", desc: "首次收服魔物", icon: "✨", reward: 80 },
  { id: "dex_complete", name: "图鉴收藏家", desc: "魔物图鉴全收服", icon: "📖", reward: 400 },
  { id: "card_master", name: "卡牌大师", desc: "集齐全部卡牌", icon: "🃏", reward: 300 },
  { id: "rich", name: "腰缠万贯", desc: "单局持有金币 ≥ 300", icon: "💰", reward: 50 },
  { id: "answer500", name: "答题狂人", desc: "累计答对 ≥ 500 题", icon: "🧠", reward: 200 },
  { id: "score5000", name: "高分车神", desc: "单局得分 ≥ 5000", icon: "🏆", reward: 150 },
  { id: "all_valks", name: "全员集结", desc: "解锁全部学员", icon: "🌟", reward: 250 },
];

export type CheckExtra = {
  examScore?: number;
  caughtCount?: number;
  /** 刚刚赢得一场普通战斗(endBattle 胜利时置 true) */
  battleWon?: boolean;
  /** 刚刚通关章节(clearChapter 时置 true) */
  chapterCleared?: boolean;
};

function cond(
  id: string,
  meta: MetaState,
  run: RunState | null,
  extra: CheckExtra,
): boolean {
  switch (id) {
    case "first_battle":
      return !!extra.battleWon;
    case "first_boss":
      return meta.storyCleared >= 1;
    case "loop1_clear":
      return meta.storyCleared >= TOTAL_CHAPTERS;
    case "loop3_clear":
      return meta.storyCleared >= TOTAL_CHAPTERS && (run?.loop ?? 0) >= 3;
    case "combo10":
      return (run?.maxCombo ?? 0) >= 10 || meta.maxComboEver >= 10;
    case "combo20":
      return (run?.maxCombo ?? 0) >= 20 || meta.maxComboEver >= 20;
    case "no_damage":
      return !!extra.chapterCleared && !!run && !run.chapterDamaged;
    case "exam_pass":
      return (extra.examScore ?? -1) >= 90;
    case "exam_perfect":
      return extra.examScore === 100;
    case "first_catch":
      return (extra.caughtCount ?? Object.keys(meta.caughtMonsters).length) > 0;
    case "dex_complete":
      return (
        (extra.caughtCount ?? Object.keys(meta.caughtMonsters).length) >=
        REGULAR_MONSTERS.length
      );
    case "card_master":
      return (
        Object.keys(meta.ownedCards || {}).filter((k) => meta.ownedCards![k])
          .length >= ALL_CARDS.length
      );
    case "rich":
      return (run?.gold ?? 0) >= 300;
    case "answer500":
      return meta.totalCorrect >= 500;
    case "score5000":
      return (run?.score ?? 0) >= 5000 || meta.bestScore >= 5000;
    case "all_valks":
      return Object.keys(meta.collected).length >= VALKYRIES.length;
    default:
      return false;
  }
}

/** 判定全部成就:解锁新成就并发放奖励(修改 meta),返回新解锁列表 */
export function checkAchievements(
  meta: MetaState,
  run: RunState | null,
  extra: CheckExtra = {},
): Achievement[] {
  if (!meta.achievements) meta.achievements = {};
  const unlocked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements[a.id]) continue;
    if (cond(a.id, meta, run, extra)) {
      meta.achievements[a.id] = true;
      meta.metaGold += a.reward;
      unlocked.push(a);
    }
  }
  return unlocked;
}

export function unlockedCount(meta: MetaState): number {
  return ACHIEVEMENTS.filter((a) => meta.achievements?.[a.id]).length;
}
