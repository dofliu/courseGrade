import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import { buildExamDocument } from "./examDocx";
import { ExamQuestion } from "../types";

const qs: ExamQuestion[] = [
  { id: "1", type: "multiple-choice", question: "1+1=?", options: { A: "1", B: "2" }, correctAnswer: "B", difficulty: "basic", points: 4 },
  { id: "2", type: "true-false", question: "天空是藍的", options: undefined, correctAnswer: "正確", difficulty: "medium", points: 5 },
  { id: "3", type: "fill-in-the-blank", question: "水的化學式是＿＿", options: undefined, correctAnswer: "H2O", difficulty: "advanced", points: 8 },
];

describe("buildExamDocument", () => {
  it("產生合法的 .docx（zip PK 簽章、非空）— 學生卷", async () => {
    const doc = buildExamDocument({ title: "測驗", courseName: "靜力學", questions: qs, withAnswer: false });
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
    // docx 是 zip，前兩個 byte 必為 "PK"
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("答案卷也能打包（含正解標記）", async () => {
    const doc = buildExamDocument({ title: "測驗", courseName: "靜力學", questions: qs, withAnswer: true });
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50);
  });

  it("空題目也不丟錯", async () => {
    const doc = buildExamDocument({ title: "空卷", courseName: "x", questions: [], withAnswer: false });
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(0);
  });
});
