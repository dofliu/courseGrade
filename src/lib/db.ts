/**
 * db.json 安全儲存的共用邏輯：結構驗證 + 原子寫入 + 自動備份 + 毀損還原。
 * 路徑全部用參數傳入，方便對暫存目錄做單元測試（不碰真實 db.json）。
 */
import fs from "fs/promises";
import path from "path";

const OPT_COLLECTIONS = ["homeroomClasses", "roster", "transcripts", "officers", "examPapers", "rubricTemplates"];

/** 結構驗證：一定要有合法 courses；新頂層集合有就必須是陣列（向後相容）。 */
export function isValidDb(data: any): boolean {
  if (!data || !Array.isArray(data.courses)) return false;
  const coursesOk = data.courses.every(
    (c: any) => c && typeof c.id === "string" && Array.isArray(c.students) && Array.isArray(c.assessments)
  );
  const optArrayOk = OPT_COLLECTIONS.every((k) => data[k] === undefined || Array.isArray(data[k]));
  return coursesOk && optArrayOk;
}

/** 原子寫入：先寫 .tmp 再 rename，避免寫到一半造成毀損。 */
export async function atomicWriteJson(file: string, data: any): Promise<void> {
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, file);
}

export async function listBackups(backupDir: string, prefix = "db-"): Promise<string[]> {
  try {
    return (await fs.readdir(backupDir)).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/** 覆寫前備份目前檔（節流 + 修剪保留最近 keep 份）。 */
export async function backupJson(
  file: string,
  backupDir: string,
  opts: { keep?: number; minIntervalMs?: number; prefix?: string; now?: number } = {}
): Promise<void> {
  const prefix = opts.prefix ?? "db-";
  const keep = opts.keep ?? 50;
  try {
    await fs.access(file);
  } catch {
    return; // 沒有現檔（首次）就不用備份
  }
  await fs.mkdir(backupDir, { recursive: true });
  const existing = await listBackups(backupDir, prefix);
  const now = opts.now ?? Date.now();
  if (existing.length > 0 && opts.minIntervalMs) {
    const stat = await fs.stat(path.join(backupDir, existing[existing.length - 1]));
    if (now - stat.mtimeMs < opts.minIntervalMs) return; // 太近，跳過
  }
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-") + "-" + Math.random().toString(36).slice(2, 6);
  await fs.copyFile(file, path.join(backupDir, `${prefix}${stamp}.json`));
  const after = await listBackups(backupDir, prefix);
  for (const f of after.slice(0, Math.max(0, after.length - keep))) {
    await fs.unlink(path.join(backupDir, f)).catch(() => {});
  }
}

/** 從最新一份「通過驗證」的備份還原；都不合法則回 null。 */
export async function loadLatestValidBackup(
  backupDir: string,
  validate: (d: any) => boolean,
  prefix = "db-"
): Promise<any | null> {
  const files = (await listBackups(backupDir, prefix)).reverse();
  for (const f of files) {
    try {
      const d = JSON.parse(await fs.readFile(path.join(backupDir, f), "utf-8"));
      if (validate(d)) return d;
    } catch {
      /* 試下一份 */
    }
  }
  return null;
}
