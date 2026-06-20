/**
 * 把 Gemini 回傳的原始題目陣列，解析成本專案的 ExamQuestion：
 * - options 由 {key,value}[] reduce 成 { A:"...", B:"..." } 物件
 * - points 依 difficulty 補（基礎4/中等5/進階8）
 * - id 補 gen-q-<index>
 */
import { ExamQuestion, ExamQuestionType, ExamDifficulty } from "../types";

export const DIFF_POINTS: Record<ExamDifficulty, number> = { basic: 4, medium: 5, advanced: 8 };

export function parseExamQuestions(raw: any): ExamQuestion[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((q: any, i: number) => {
    let options: { [k: string]: string } | undefined;
    if (Array.isArray(q.options) && q.options.length) {
      options = q.options.reduce((acc: { [k: string]: string }, o: any) => {
        if (o && typeof o.key === "string") acc[o.key] = String(o.value ?? "");
        return acc;
      }, {});
    }
    const difficulty: ExamDifficulty = ["basic", "medium", "advanced"].includes(q.difficulty) ? q.difficulty : "medium";
    return {
      id: `gen-q-${i}`,
      type: q.type as ExamQuestionType,
      question: q.question || "",
      options,
      correctAnswer: q.correctAnswer || "",
      difficulty,
      points: DIFF_POINTS[difficulty],
    };
  });
}
