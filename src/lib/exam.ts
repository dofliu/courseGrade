/**
 * 把 Gemini 回傳的原始題目陣列，解析成本專案的 ExamQuestion：
 * - options 由 {key,value}[] reduce 成 { A:"...", B:"..." } 物件
 * - points 依 difficulty 補（基礎4/中等5/進階8）
 * - id 補 gen-q-<index>
 */
import { ExamQuestion, ExamQuestionType, ExamDifficulty } from "../types";

export const DIFF_POINTS: Record<ExamDifficulty, number> = { basic: 4, medium: 5, advanced: 8 };

/**
 * 把整份題目的配分等比例縮放，使總分等於 target（每題至少 1 分），
 * 並把四捨五入造成的餘數補/扣在分數最高的題目上，確保總和精準命中。
 */
export function balancePointsTo(questions: ExamQuestion[], target: number): ExamQuestion[] {
  if (!Array.isArray(questions) || questions.length === 0) return questions;
  if (!(target > 0)) return questions;
  const current = questions.reduce((s, q) => s + (q.points || 0), 0);
  if (current <= 0) return questions;

  const factor = target / current;
  const scaled = questions.map((q) => ({ ...q, points: Math.max(1, Math.round((q.points || 0) * factor)) }));

  // 修正餘數：與 target 的差距逐 1 分散到分數最高（補）或最高且 >1（扣）的題目
  let diff = target - scaled.reduce((s, q) => s + q.points, 0);
  const order = scaled.map((_, i) => i).sort((a, b) => scaled[b].points - scaled[a].points);
  let guard = 0;
  while (diff !== 0 && guard < 10000) {
    for (const i of order) {
      if (diff === 0) break;
      if (diff > 0) {
        scaled[i].points += 1;
        diff -= 1;
      } else if (scaled[i].points > 1) {
        scaled[i].points -= 1;
        diff += 1;
      }
    }
    guard++;
  }
  return scaled;
}

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
