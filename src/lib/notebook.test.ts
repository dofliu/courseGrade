import { describe, it, expect } from "vitest";
import { extractNotebookText } from "./notebook";

const nb = (cells: any[]) => JSON.stringify({ cells, metadata: {}, nbformat: 4 });

describe("extractNotebookText", () => {
  it("擷取 markdown + 程式碼 + 文字輸出", () => {
    const text = extractNotebookText(
      nb([
        { cell_type: "markdown", source: ["# 標題\n", "說明文字"] },
        { cell_type: "code", source: ["print(1)"], outputs: [{ output_type: "stream", text: ["1\n"] }] },
      ])
    );
    expect(text).toContain("【Markdown】");
    expect(text).toContain("# 標題");
    expect(text).toContain("【程式碼】");
    expect(text).toContain("print(1)");
    expect(text).toContain("【輸出】");
    expect(text).toContain("1");
  });

  it("execute_result 的 text/plain 輸出也抓得到", () => {
    const text = extractNotebookText(nb([{ cell_type: "code", source: ["x"], outputs: [{ output_type: "execute_result", data: { "text/plain": ["5"] } }] }]));
    expect(text).toContain("5");
  });

  it("source 為單一字串也支援", () => {
    expect(extractNotebookText(nb([{ cell_type: "markdown", source: "純字串" }]))).toContain("純字串");
  });

  it("空 cell 不輸出標記", () => {
    expect(extractNotebookText(nb([{ cell_type: "code", source: ["   "] }]))).toBe("");
  });

  it("壞掉的 JSON → 空字串（不丟錯）", () => {
    expect(extractNotebookText("{not valid json")).toBe("");
  });

  it("沒有 cells → 空字串", () => {
    expect(extractNotebookText(JSON.stringify({ nbformat: 4 }))).toBe("");
  });

  it("輸出過長會截斷在 2000 字內", () => {
    const long = "a".repeat(5000);
    const text = extractNotebookText(nb([{ cell_type: "code", source: ["x"], outputs: [{ text: [long] }] }]));
    const outPart = text.split("【輸出】\n")[1] || "";
    expect(outPart.length).toBeLessThanOrEqual(2000);
  });
});
