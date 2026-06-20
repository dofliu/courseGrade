import { describe, it, expect } from "vitest";
import { parseExamQuestions, DIFF_POINTS } from "./exam";

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
