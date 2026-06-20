/**
 * Jupyter Notebook (.ipynb) 文字擷取：Markdown + 程式碼 + 文字輸出。
 * 吃 JSON 字串（server 端先 buf.toString("utf-8")），不依賴 Node Buffer，方便測試。
 */
export function extractNotebookText(jsonText: string): string {
  let nb: any;
  try {
    nb = JSON.parse(jsonText);
  } catch {
    return "";
  }
  const cells = Array.isArray(nb.cells) ? nb.cells : [];
  const parts: string[] = [];
  for (const cell of cells) {
    const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source || "";
    if (cell.cell_type === "markdown") {
      if (src.trim()) parts.push("【Markdown】\n" + src);
    } else if (cell.cell_type === "code") {
      if (src.trim()) parts.push("【程式碼】\n" + src);
      const outs = Array.isArray(cell.outputs) ? cell.outputs : [];
      const outText = outs
        .map((o: any) => {
          if (o.text) return Array.isArray(o.text) ? o.text.join("") : o.text;
          const tp = o.data && o.data["text/plain"];
          if (tp) return Array.isArray(tp) ? tp.join("") : tp;
          return "";
        })
        .join("")
        .trim();
      if (outText) parts.push("【輸出】\n" + outText.slice(0, 2000));
    } else if (src.trim()) {
      parts.push(src);
    }
  }
  return parts.join("\n\n");
}
