/**
 * 學籍配對共用邏輯：從多個訊號（信箱／主旨／寄件者／內文／附件檔名）找出對應學生。
 * 前端（FolderAnalyzer 依檔名）與後端（server.ts Gmail 解析）共用，並可單元測試。
 */

export interface RosterLike {
  studentId: string;
  name: string;
  email?: string;
}

/** 正規化字串以利比對：轉小寫、去掉空白與常見分隔符號。 */
export function normalizeForMatch(s: string): string {
  return String(s || "").toLowerCase().replace(/[\s\-_.()／/]/g, "");
}

export interface MatchSignals {
  subject?: string;
  senderName?: string;
  fromEmail?: string;
  bodyExcerpt?: string;
  filenames?: string[];
}

/**
 * 從多訊號找對應學生。優先序：寄件信箱完全相符 → 學號出現 → 完整姓名出現。
 * 學生常漏寫資訊，故多訊號交叉比對。
 */
export function matchStudentFromSignals<T extends RosterLike>(
  roster: T[],
  opts: MatchSignals
): { student: T | null; by: "email" | "studentId" | "name" | null } {
  if (!Array.isArray(roster) || roster.length === 0) return { student: null, by: null };

  // 1) 寄件信箱完全相符（最高信心）；fromEmail 為空時不比對，避免空對空誤判
  const fromEmail = (opts.fromEmail || "").toLowerCase();
  if (fromEmail) {
    const byEmail = roster.find((s) => s.email && s.email.toLowerCase() === fromEmail);
    if (byEmail) return { student: byEmail, by: "email" };
  }

  const rawHay = [opts.subject, opts.senderName, opts.bodyExcerpt, ...(opts.filenames || [])]
    .filter(Boolean)
    .join("  ");
  const normHay = normalizeForMatch(rawHay);

  // 2) 學號出現於主旨／寄件者名／內文／附件檔名（學號最具辨識度）
  const byId = roster.find((s) => {
    const id = normalizeForMatch(s.studentId);
    return id.length >= 4 && normHay.includes(id);
  });
  if (byId) return { student: byId, by: "studentId" };

  // 3) 完整姓名（≥2 字）出現於任一訊號
  const byName = roster.find((s) => s.name && String(s.name).length >= 2 && rawHay.includes(s.name));
  if (byName) return { student: byName, by: "name" };

  return { student: null, by: null };
}

/** 從檔名找對應學生（學號優先，其次姓名）。 */
export function matchStudentByFilename<T extends RosterLike>(students: T[], filename: string): T | null {
  return matchStudentFromSignals(students, { filenames: [filename] }).student;
}
