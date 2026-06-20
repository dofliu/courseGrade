import { describe, it, expect } from "vitest";
import { accumulatedWeighted, studentTotal, hasAnyGrade, findFinalAssessment, neededOnFinal } from "./grades";
import { AssessmentItem } from "../types";

// 仿 靜力學 配分
const assessments: AssessmentItem[] = [
  { id: "hw1", name: "作業 1", weight: 6, type: "hw" },
  { id: "midterm", name: "期中考試", weight: 30, type: "midterm" },
  { id: "final", name: "期末考試", weight: 40, type: "final" },
  { id: "bonus", name: "期末加分題", weight: 15, type: "project" },
  { id: "hw2", name: "作業2", weight: 6, type: "hw" },
  { id: "quiz", name: "小考1", weight: 8, type: "quiz" },
  { id: "usual", name: "平時", weight: 10, type: "other" },
];

// 莊竣宇：作業1=70, 期中=30, 作業2=70, 小考=70, 平時=80（期末/加分未評）
const zhuang = { hw1: 70, midterm: 30, hw2: 70, quiz: 70, usual: 80 };

describe("accumulatedWeighted", () => {
  it("莊竣宇 累計加權分 = 31", () => {
    expect(accumulatedWeighted(zhuang, assessments)).toBe(31);
  });
  it("全空 = 0", () => {
    expect(accumulatedWeighted({}, assessments)).toBe(0);
  });
  it("含加分可超過 100", () => {
    const full = { hw1: 100, midterm: 100, final: 100, bonus: 100, hw2: 100, quiz: 100, usual: 100 };
    expect(accumulatedWeighted(full, assessments)).toBe(115);
  });
});

describe("studentTotal（含個人加減分）", () => {
  it("無加減分 = 累計加權分", () => {
    expect(studentTotal(zhuang, assessments, 0)).toBe(31);
  });
  it("加 5 分 → 36", () => {
    expect(studentTotal(zhuang, assessments, 5)).toBe(36);
  });
  it("扣 3 分 → 28", () => {
    expect(studentTotal(zhuang, assessments, -3)).toBe(28);
  });
  it("undefined 加減分視為 0", () => {
    expect(studentTotal(zhuang, assessments)).toBe(31);
  });
});

describe("hasAnyGrade", () => {
  it("有分數 → true", () => expect(hasAnyGrade(zhuang, assessments)).toBe(true));
  it("無分數 → false", () => expect(hasAnyGrade({}, assessments)).toBe(false));
});

describe("findFinalAssessment", () => {
  it("以 type=final 找到", () => {
    expect(findFinalAssessment(assessments)?.id).toBe("final");
  });
  it("無 type 時用名稱、排除加分題", () => {
    const a: AssessmentItem[] = [
      { id: "f", name: "期末考", weight: 40, type: "other" },
      { id: "b", name: "期末加分題", weight: 15, type: "other" },
    ];
    expect(findFinalAssessment(a)?.id).toBe("f");
  });
  it("沒有期末考 → null", () => {
    const a: AssessmentItem[] = [{ id: "hw", name: "作業", weight: 100, type: "hw" }];
    expect(findFinalAssessment(a)).toBeNull();
  });
});

describe("neededOnFinal", () => {
  const final = findFinalAssessment(assessments);

  it("莊竣宇 期末需考 73 分（72.5 進位）", () => {
    const r = neededOnFinal(zhuang, assessments, final, 60);
    expect(r).toEqual({ kind: "need", need: 73 });
  });
  it("個人加 9 分後 banked=40，期末只需 50 分", () => {
    const r = neededOnFinal(zhuang, assessments, final, 60, 9);
    expect(r).toEqual({ kind: "need", need: 50 });
  });
  it("已銀行達標 → passed", () => {
    // 非期末項目全 100 → banked = 6+30+6+8+10 = 60 ≥ 60
    const r = neededOnFinal({ hw1: 100, midterm: 100, hw2: 100, quiz: 100, usual: 100 }, assessments, final, 60);
    expect(r.kind).toBe("passed");
  });
  it("期末已考 → done", () => {
    const r = neededOnFinal({ final: 50 }, assessments, final, 60);
    expect(r.kind).toBe("done");
  });
  it("沒有期末考項目 → nofinal", () => {
    const r = neededOnFinal(zhuang, assessments, null, 60);
    expect(r.kind).toBe("nofinal");
  });
  it("期末滿分仍不及格 → impossible", () => {
    // 已銀行很低、期末權重小，滿分也不夠
    const small: AssessmentItem[] = [
      { id: "final", name: "期末考", weight: 10, type: "final" },
      { id: "hw1", name: "作業", weight: 90, type: "hw" },
    ];
    const r = neededOnFinal({ hw1: 30 }, small, small[0], 60);
    expect(r.kind).toBe("impossible");
  });
});
