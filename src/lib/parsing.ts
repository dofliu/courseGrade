/**
 * 成績匯入的文字解析共用邏輯（貼上「學號 分數 評語」）。抽出以便單元測試。
 */

export interface ParsedScoreRow {
  studentId: string;
  score: number | null;
  feedback: string;
}

/**
 * 解析一行「學號 分數 [評語]」，分隔符容許 tab / 逗號 / 空白。
 * 規則：第一欄為學號；其後第一個 0–100 的純數字當分數，其餘文字併為評語。
 * 無法解析（少於兩欄）回 null。
 */
export function parseScoreLine(line: string): ParsedScoreRow | null {
  const text = line.trim();
  if (!text) return null;

  let parts: string[];
  if (text.includes("\t")) parts = text.split("\t");
  else if (text.includes(",")) parts = text.split(",");
  else parts = text.split(/\s+/);
  parts = parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const studentId = parts[0];
  let score: number | null = null;
  let scoreIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d+(\.\d+)?$/.test(parts[i])) {
      const n = Number(parts[i]);
      if (n >= 0 && n <= 100) {
        score = n;
        scoreIdx = i;
        break;
      }
    }
  }
  const feedback = scoreIdx >= 0 ? parts.slice(scoreIdx + 1).join(" ") : "";
  return { studentId, score, feedback };
}

/** 解析整段多行文字。 */
export function parseScoreText(text: string): ParsedScoreRow[] {
  return text
    .split("\n")
    .map(parseScoreLine)
    .filter((r): r is ParsedScoreRow => r !== null);
}
