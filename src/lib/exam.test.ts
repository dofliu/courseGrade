import { describe, it, expect } from "vitest";
import { parseExamQuestions, DIFF_POINTS, balancePointsTo } from "./exam";
import { ExamQuestion } from "../types";

describe("parseExamQuestions", () => {
  it("選擇題 options 由 {key,value}[] reduce 成物件", () => {
    const [q] = parseExamQuestions([
      { type: "single", question: "1+1=?", difficulty: "basic", correctAnswer: "B", options: [{ key: "A", value: "1" }, { key: "B", value: "2" }] },
    ]);
    expect(q.options).toEqual({ A: "1", B: "2" });
    expect(q.correctAnswer).toBe("B");
  });

  it("配分依 difficulty（基礎4/中等5/進階8）", () => {
    const qs = parseExamQuestions([
      { type: "single", difficulty: "basic" },
      { type: "single", difficulty: "medium" },
      { type: "single", difficulty: "advanced" },
    ]);
    expect(qs.map((q) => q.points)).toEqual([4, 5, 8]);
    expect(DIFF_POINTS).toEqual({ basic: 4, medium: 5, advanced: 8 });
  });

  it("id 補成 gen-q-<index>", () => {
    const qs = parseExamQuestions([{ type: "single" }, { type: "single" }]);
    expect(qs.map((q) => q.id)).toEqual(["gen-q-0", "gen-q-1"]);
  });

  it("非法 difficulty → 視為 medium（配分5）", () => {
    const [q] = parseExamQuestions([{ type: "single", difficulty: "impossible" }]);
    expect(q.difficulty).toBe("medium");
    expect(q.points).toBe(5);
  });

  it("缺 difficulty → medium", () => {
    const [q] = parseExamQuestions([{ type: "single" }]);
    expect(q.difficulty).toBe("medium");
  });

  it("沒有 options（如問答/是非）→ options 為 undefined", () => {
    const [q] = parseExamQuestions([{ type: "essay", question: "申論" }]);
    expect(q.options).toBeUndefined();
  });

  it("option value 為非字串會轉成字串", () => {
    const [q] = parseExamQuestions([{ type: "single", options: [{ key: "A", value: 3 }] }]);
    expect(q.options).toEqual({ A: "3" });
  });

  it("非陣列輸入 → 回空陣列（不丟錯）", () => {
    expect(parseExamQuestions(null)).toEqual([]);
    expect(parseExamQuestions({})).toEqual([]);
    expect(parseExamQuestions("x")).toEqual([]);
  });

  it("缺 question / correctAnswer → 補空字串", () => {
    const [q] = parseExamQuestions([{ type: "single" }]);
    expect(q.question).toBe("");
    expect(q.correctAnswer).toBe("");
  });
});

describe("balancePointsTo", () => {
  const mk = (pts: number[]): ExamQuestion[] =>
    pts.map((p, i) => ({ id: `q${i}`, type: "multiple-choice", question: "", correctAnswer: "A", difficulty: "medium", points: p }));

  it("等比例縮放，總分精準命中 target", () => {
    const out = balancePointsTo(mk([4, 5, 8, 4, 5]), 100); // 原 26 分
    expect(out.reduce((s, q) => s + q.points, 0)).toBe(100);
  });

  it("縮小時總分也精準命中（餘數修正）", () => {
    const out = balancePointsTo(mk([30, 30, 40]), 50);
    expect(out.reduce((s, q) => s + q.points, 0)).toBe(50);
    expect(out.every((q) => q.points >= 1)).toBe(true);
  });

  it("每題至少 1 分", () => {
    const out = balancePointsTo(mk([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 12);
    expect(out.every((q) => q.points >= 1)).toBe(true);
    expect(out.reduce((s, q) => s + q.points, 0)).toBe(12);
  });

  it("target<=0 或空陣列 → 原樣返回", () => {
    const qs = mk([4, 5]);
    expect(balancePointsTo(qs, 0)).toBe(qs);
    expect(balancePointsTo([], 100)).toEqual([]);
  });

  it("總分為 0 → 原樣返回（不除以零）", () => {
    const qs = mk([0, 0]);
    expect(balancePointsTo(qs, 100)).toBe(qs);
  });
});
