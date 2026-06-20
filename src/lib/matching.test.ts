import { describe, it, expect } from "vitest";
import { normalizeForMatch, matchStudentFromSignals, matchStudentByFilename } from "./matching";

const roster = [
  { studentId: "3B461123", name: "朱文明", email: "zhu@school.edu" },
  { studentId: "3B461084", name: "黃盟竣", email: "huang@school.edu" },
  { studentId: "3B461101", name: "陳宏穎", email: "chen@school.edu" },
  { studentId: "3B461111", name: "劉昱宏", email: "liu@school.edu" },
];

describe("normalizeForMatch", () => {
  it("去空白/分隔符並轉小寫", () => {
    expect(normalizeForMatch("3B 461-123_.()")).toBe("3b461123");
  });
});

describe("matchStudentFromSignals", () => {
  it("信箱完全相符優先", () => {
    const r = matchStudentFromSignals(roster, { fromEmail: "ZHU@school.edu", subject: "無關" });
    expect(r).toEqual({ student: roster[0], by: "email" });
  });
  it("主旨含學號", () => {
    const r = matchStudentFromSignals(roster, { subject: "Re: 報告 朱文明 3B461123", fromEmail: "x@gmail.com" });
    expect(r.by).toBe("studentId");
    expect(r.student?.studentId).toBe("3B461123");
  });
  it("附件檔名含學號（無主旨）", () => {
    const r = matchStudentFromSignals(roster, { subject: "(無主旨)", filenames: ["陳宏穎 3B461101 第六章.pdf"], fromEmail: "x@gmail.com" });
    expect(r.student?.studentId).toBe("3B461101");
  });
  it("只有姓名可比對", () => {
    const r = matchStudentFromSignals(roster, { senderName: "黃盟竣", fromEmail: "nobody@x.com" });
    expect(r).toEqual({ student: roster[1], by: "name" });
  });
  it("廣告信不誤配", () => {
    const r = matchStudentFromSignals(roster, { subject: "促銷買一送一", fromEmail: "ad@spam.com" });
    expect(r).toEqual({ student: null, by: null });
  });
  it("空 fromEmail 不會空對空誤配", () => {
    const withEmpty = [{ studentId: "x999", name: "甲", email: "" }];
    const r = matchStudentFromSignals(withEmpty, { fromEmail: "" });
    expect(r.student).toBeNull();
  });
  it("空名單回 null", () => {
    expect(matchStudentFromSignals([], { subject: "朱文明" }).student).toBeNull();
  });
});

describe("matchStudentByFilename", () => {
  it("檔名含學號", () => {
    expect(matchStudentByFilename(roster, "四智一丙黃盟竣3B461084.pdf")?.studentId).toBe("3B461084");
  });
  it("檔名含姓名（無學號）", () => {
    expect(matchStudentByFilename(roster, "劉昱宏_作業.jpg")?.name).toBe("劉昱宏");
  });
  it("認不出 → null", () => {
    expect(matchStudentByFilename(roster, "IMG_0001.jpg")).toBeNull();
  });
  it("檔名無資訊、靠上層資料夾路徑（學號）配對", () => {
    const r2 = [{ studentId: "3B261060", name: "謝昆霖", email: "x@s.edu" }];
    const path = "人工智慧0310作業/3B261060_謝昆霖/submission.txt";
    expect(matchStudentByFilename(r2, path)?.studentId).toBe("3B261060");
  });
  it("檔名無資訊、靠上層資料夾路徑（姓名）配對", () => {
    const r2 = [{ studentId: "X999", name: "謝昆霖", email: "x@s.edu" }];
    expect(matchStudentByFilename(r2, "作業/謝昆霖/report.pdf")?.name).toBe("謝昆霖");
  });
});
