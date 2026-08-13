import { QUESTIONS, type Question } from "@/data";
import { loadImportedQuestions } from "./save";

/** 题库源优先级:导入题库(localStorage) → 内置题库(1034 题) */
export function resolveQuestionPool(): Question[] {
  const imported = loadImportedQuestions<Question>();
  if (imported && imported.length > 0) return imported;
  return [...QUESTIONS];
}

/** 解析导入的题目 JSON(兼容 {q|question, opts|options, ans|answer}) */
export function parseImportedQuestions(data: unknown[]): Question[] {
  return data.map((q, i) => {
    const o = q as Record<string, unknown>;
    return {
      id: typeof o.id === "string" ? o.id : `imp_${i}`,
      q: String(o.q ?? o.question ?? ""),
      opts: Array.isArray(o.opts) ? o.opts : Array.isArray(o.options) ? o.options : [],
      ans: typeof o.ans === "number" ? o.ans : typeof o.answer === "number" ? o.answer : 0,
    };
  });
}
