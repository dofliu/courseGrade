/**
 * 成績計算共用邏輯。
 * 原本散在 GradeBook / SubmissionOverview / GradingDashboard 三個元件各一份，
 * 抽出集中以避免公式漂移，並可單元測試。
 */
import { Student, AssessmentItem } from "../types";

type Grades = Student["grades"];

/**
 * 目前累計加權分：各「已評分」項目的 分數×權重/100 加總。
 * 未評分／未繳項目以 0 計，不做正規化。學期末全部評完即為最終成績。
 */
export function accumulatedWeighted(grades: Grades, assessments: AssessmentItem[]): number {
  let earned = 0;
  for (const a of assessments) {
    const score = grades[a.id];
    if (score != null) earned += (score * a.weight) / 100;
  }
  return Math.round(earned * 10) / 10;
}

/** 是否至少有一個項目已評分（給「—」顯示判斷用）。 */
export function hasAnyGrade(grades: Grades, assessments: AssessmentItem[]): boolean {
  return assessments.some((a) => grades[a.id] != null);
}

/**
 * 找出「期末考」項目：優先 type=final，否則用名稱（含「期末」「考」且非「加分」）。
 */
export function findFinalAssessment(assessments: AssessmentItem[]): AssessmentItem | null {
  return (
    assessments.find((a) => a.type === "final") ||
    assessments.find((a) => a.name.includes("期末") && a.name.includes("考") && !a.name.includes("加分")) ||
    null
  );
}

export type NeededOnFinal = {
  kind: "nofinal" | "done" | "passed" | "need" | "impossible";
  need?: number; // 僅 need / impossible 有值
};

/**
 * 期末考要考幾分，才能讓「累計加權分」達到及格門檻。
 * - nofinal：此課程沒有期末考項目
 * - done：期末考已經有分數
 * - passed：不靠期末考、已銀行的分數就達標
 * - need：需考 need 分（無條件進位）
 * - impossible：期末考滿分仍不足
 */
export function neededOnFinal(
  grades: Grades,
  assessments: AssessmentItem[],
  finalAsst: AssessmentItem | null,
  passMark = 60
): NeededOnFinal {
  if (!finalAsst) return { kind: "nofinal" };
  if (grades[finalAsst.id] != null) return { kind: "done" };

  // 排除期末考本身，把其他已評項目的加權分加總（已銀行的分數）
  let banked = 0;
  for (const a of assessments) {
    if (a.id === finalAsst.id) continue;
    const score = grades[a.id];
    if (score != null) banked += (score * a.weight) / 100;
  }
  if (banked >= passMark) return { kind: "passed" };

  const fw = finalAsst.weight / 100;
  const need = fw > 0 ? (passMark - banked) / fw : Infinity;
  if (need > 100) return { kind: "impossible", need: Math.ceil(need) };
  return { kind: "need", need: Math.ceil(need) };
}
