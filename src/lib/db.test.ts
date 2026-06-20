import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { isValidDb, atomicWriteJson, listBackups, backupJson, loadLatestValidBackup } from "./db";

const validDb = () => ({
  courses: [{ id: "c1", students: [], assessments: [] }],
  roster: [],
  examPapers: [{ id: "p1" }],
});

describe("isValidDb", () => {
  it("合法 db（含可選集合）通過", () => {
    expect(isValidDb(validDb())).toBe(true);
  });
  it("最小合法 db（只有 courses）通過", () => {
    expect(isValidDb({ courses: [] })).toBe(true);
  });
  it("courses 不是陣列 → 不合法", () => {
    expect(isValidDb({ courses: {} })).toBe(false);
    expect(isValidDb(null)).toBe(false);
    expect(isValidDb({})).toBe(false);
  });
  it("course 缺 students/assessments → 不合法", () => {
    expect(isValidDb({ courses: [{ id: "c1", students: [] }] })).toBe(false);
    expect(isValidDb({ courses: [{ id: "c1", students: [], assessments: {} }] })).toBe(false);
  });
  it("可選集合存在但非陣列 → 不合法", () => {
    expect(isValidDb({ courses: [], roster: {} })).toBe(false);
    expect(isValidDb({ courses: [], examPapers: "x" })).toBe(false);
    expect(isValidDb({ courses: [], rubricTemplates: {} })).toBe(false);
  });
  it("rubricTemplates 為陣列 → 合法", () => {
    expect(isValidDb({ courses: [], rubricTemplates: [{ id: "r1", name: "範本", content: "..." }] })).toBe(true);
  });
});

describe("atomicWriteJson + backupJson + loadLatestValidBackup（暫存目錄）", () => {
  let dir: string;
  let dbFile: string;
  let backupDir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "edugrade-db-test-"));
    dbFile = path.join(dir, "db.json");
    backupDir = path.join(dir, "backups");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("原子寫入後讀回內容一致", async () => {
    const data = validDb();
    await atomicWriteJson(dbFile, data);
    const back = JSON.parse(await fs.readFile(dbFile, "utf-8"));
    expect(back).toEqual(data);
    // 不應殘留 .tmp
    expect(await listBackups(dir, "db.json.tmp")).toEqual([]);
  });

  it("首次（無現檔）backupJson 不產生備份", async () => {
    await backupJson(dbFile, backupDir, { now: 1000 });
    expect(await listBackups(backupDir)).toEqual([]);
  });

  it("覆寫前備份；保留份數修剪到 keep", async () => {
    await atomicWriteJson(dbFile, validDb());
    for (let i = 0; i < 5; i++) {
      await backupJson(dbFile, backupDir, { keep: 3, now: 1000 + i * 10_000 });
    }
    const list = await listBackups(backupDir);
    expect(list.length).toBe(3);
  });

  it("節流：間隔小於 minIntervalMs 時跳過備份", async () => {
    await atomicWriteJson(dbFile, validDb());
    await backupJson(dbFile, backupDir, { now: 1000 });
    const first = await listBackups(backupDir);
    expect(first.length).toBe(1);
    // 立刻再備份（mtime 相近）→ 應被節流跳過
    await backupJson(dbFile, backupDir, { minIntervalMs: 60_000 });
    expect((await listBackups(backupDir)).length).toBe(1);
  });

  it("毀損還原：寫好→備份→把 db 寫壞→從最新合法備份救回", async () => {
    const good = validDb();
    await atomicWriteJson(dbFile, good);
    await backupJson(dbFile, backupDir, { now: 2000 });
    // 模擬 db.json 毀損
    await fs.writeFile(dbFile, "{ corrupted!!", "utf-8");
    const raw = await fs.readFile(dbFile, "utf-8");
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* 毀損 */ }
    expect(isValidDb(parsed)).toBe(false);
    const restored = await loadLatestValidBackup(backupDir, isValidDb);
    expect(restored).toEqual(good);
  });

  it("loadLatestValidBackup 會略過壞掉/不合法備份，取最新合法那份", async () => {
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, "db-2020-01-01.json"), JSON.stringify({ courses: [] }), "utf-8");
    await fs.writeFile(path.join(backupDir, "db-2020-06-06.json"), "broken json", "utf-8");
    await fs.writeFile(path.join(backupDir, "db-2020-12-31.json"), JSON.stringify({ courses: "bad" }), "utf-8");
    // 最新（db-2020-12-31）不合法、中間那份毀損 → 應回最舊但合法的那份
    const restored = await loadLatestValidBackup(backupDir, isValidDb);
    expect(restored).toEqual({ courses: [] });
  });

  it("沒有任何合法備份 → 回 null", async () => {
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, "db-2020-01-01.json"), "nope", "utf-8");
    expect(await loadLatestValidBackup(backupDir, isValidDb)).toBeNull();
  });
});
