import { describe, it, expect } from "vitest";
import { parseScoreLine, parseScoreText } from "./parsing";

describe("parseScoreLine", () => {
  it("空白分隔：學號 分數 評語", () => {
    expect(parseScoreLine("3B461079 88 力學分析清楚")).toEqual({
      studentId: "3B461079",
      score: 88,
      feedback: "力學分析清楚",
    });
  });
  it("逗號分隔、無評語", () => {
    expect(parseScoreLine("3B461080,72")).toEqual({ studentId: "3B461080", score: 72, feedback: "" });
  });
  it("Tab 分隔", () => {
    expect(parseScoreLine("A1\t90\t很好")).toEqual({ studentId: "A1", score: 90, feedback: "很好" });
  });
  it("姓名當第一欄也可（學號=姓名）", () => {
    expect(parseScoreLine("高志全 95 觀念正確")).toEqual({ studentId: "高志全", score: 95, feedback: "觀念正確" });
  });
  it("分數超出 0–100 不採用（視為無效分數）", () => {
    expect(parseScoreLine("X 150")).toEqual({ studentId: "X", score: null, feedback: "" });
  });
  it("小數分數", () => {
    expect(parseScoreLine("X 87.5")?.score).toBe(87.5);
  });
  it("只有一欄 → null", () => {
    expect(parseScoreLine("3B461079")).toBeNull();
  });
  it("空行 → null", () => {
    expect(parseScoreLine("   ")).toBeNull();
  });
});

describe("parseScoreText", () => {
  it("多行、略過空行與單欄壞行", () => {
    const rows = parseScoreText("3B01 80\n\n3B02 90 讚\n壞行\n");
    expect(rows.map((r) => r.studentId)).toEqual(["3B01", "3B02"]);
  });
  it("壞行（單欄）被濾掉", () => {
    const rows = parseScoreText("3B01 80\nonlyone\n3B02 90");
    expect(rows.map((r) => r.studentId)).toEqual(["3B01", "3B02"]);
  });
});
