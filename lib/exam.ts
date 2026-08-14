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

/** 判卷:100 分起,每答错一题 -1;未作答(提前终止)不计。返回得分/错题/答对列表 */
export function gradeExam(
  session: ExamSession,
): { score: number; wrongIds: string[]; correctIds: string[] } {
  const wrongIds: string[] = [];
  const correctIds: string[] = [];
  let score = 100;
  session.qs.forEach((q, i) => {
    const picked = session.picked[i];
    if (picked == null) return; // 未作答(不合格提前终止)不计分也不入错题本
    if (picked === q.ans) {
      correctIds.push(q.id);
    } else {
      wrongIds.push(q.id);
      score -= 1;
    }
  });
  return { score: Math.max(0, score), wrongIds, correctIds };
}

export function isExamPass(score: number): boolean {
  return score >= EXAM_CONST.PASS_LINE;
}
