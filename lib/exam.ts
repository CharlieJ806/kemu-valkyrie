import type { ExamSession, Question } from "./types";
import { EXAM_PASS_LINE, EXAM_QUESTION_COUNT, EXAM_TIME_MS } from "@/data/constants";
import { shuffle } from "./formulas";

export const EXAM_CONST = {
  COUNT: EXAM_QUESTION_COUNT,
  TIME_MS: EXAM_TIME_MS,
  PASS_LINE: EXAM_PASS_LINE,
};

/** 进考场:从题库洗牌无放回抽 100 题(线上版 scr-exam 行为) */
export function buildExamSession(pool: Question[]): ExamSession | null {
  if (pool.length < EXAM_CONST.COUNT) return null; // 题库不足 100 题,禁止开考
  const qs = shuffle(pool).slice(0, EXAM_CONST.COUNT);
  return {
    qs,
    idx: 0,
    picked: Array(qs.length).fill(null),
    marked: Array(qs.length).fill(false),
    timeLeft: EXAM_CONST.TIME_MS,
    done: false,
    score: 100,
    failed: false,
  };
}

/** 判卷:100 分起,每答错一题 -1。countUnanswered 时未答题也按错误扣分(计入总成绩,不入错题本) */
export function gradeExam(
  session: ExamSession,
  countUnanswered = false,
): { score: number; wrongIds: string[]; correctIds: string[]; unanswered: number } {
  const wrongIds: string[] = [];
  const correctIds: string[] = [];
  let unanswered = 0;
  let score = 100;
  session.qs.forEach((q, i) => {
    const picked = session.picked[i];
    if (picked == null) {
      unanswered += 1;
      if (countUnanswered) score -= 1; // 提前交卷:未答题按错误处理
      return;
    }
    if (picked === q.ans) {
      correctIds.push(q.id);
    } else {
      wrongIds.push(q.id);
      score -= 1;
    }
  });
  return { score: Math.max(0, score), wrongIds, correctIds, unanswered };
}

export function isExamPass(score: number): boolean {
  return score >= EXAM_CONST.PASS_LINE;
}
