/**
 * 後端 API 端點整合測試（supertest）。
 * 透過 EDUGRADE_DATA_DIR 把資料目錄指向暫存資料夾，全程不碰真實 db.json；
 * EDUGRADE_NO_LISTEN=1 讓匯入 server 時不啟動實際監聽 / Vite。
 * 只覆蓋「不需呼叫 Gemini」的端點與守門邏輯（核心解析已在 src/lib 測過）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import os from "os";
import path from "path";

let app: any;
let dataDir: string;

const validDb = () => ({
  courses: [
    {
      id: "c1",
      name: "測試課程",
      assessments: [{ id: "a1", name: "作業1", weight: 100, type: "hw" }],
      students: [{ id: "s1", studentId: "111000001", name: "王小明", grades: {}, feedback: {} }],
    },
  ],
});

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "edugrade-api-"));
  process.env.EDUGRADE_NO_LISTEN = "1";
  process.env.EDUGRADE_DATA_DIR = dataDir;
  const mod = await import("./server");
  app = mod.app;
}, 30000); // 匯入 server（express + genai 等重依賴）首次轉譯較久，放寬逾時

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("GET /api/version", () => {
  it("回傳版本與啟動時間", async () => {
    const res = await request(app).get("/api/version");
    expect(res.status).toBe(200);
    expect(typeof res.body.version).toBe("string");
    expect(typeof res.body.startedAt).toBe("string");
  });
});

describe("GET/POST /api/db", () => {
  it("首次讀取（無 db.json）會建立並回傳預設資料", async () => {
    const res = await request(app).get("/api/db");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.courses)).toBe(true);
  });

  it("存合法資料 → 200，再讀回內容一致（round-trip）", async () => {
    const data = validDb();
    const save = await request(app).post("/api/db").send(data);
    expect(save.status).toBe(200);
    expect(save.body.success).toBe(true);

    const read = await request(app).get("/api/db");
    expect(read.body.courses[0].id).toBe("c1");
    expect(read.body.courses[0].students[0].name).toBe("王小明");
  });

  it("結構不合法 → 400（保護現有成績）", async () => {
    const res = await request(app).post("/api/db").send({ courses: "not-an-array" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("course 缺 students/assessments → 400", async () => {
    const res = await request(app).post("/api/db").send({ courses: [{ id: "x", students: [] }] });
    expect(res.status).toBe(400);
  });

  it("以空白課程覆蓋現有課程 → 409 防呆", async () => {
    // 前一個測試已存了一門課；此處嘗試用空陣列覆蓋
    const res = await request(app).post("/api/db").send({ courses: [] });
    expect(res.status).toBe(409);
    // 確認原資料仍在
    const read = await request(app).get("/api/db");
    expect(read.body.courses.length).toBeGreaterThan(0);
  });
});

describe("/api/analyze-file 守門（不觸發 Gemini）", () => {
  it("缺 fileContent → 400", async () => {
    const res = await request(app).post("/api/analyze-file").send({ fileName: "x.pdf" });
    expect(res.status).toBe(400);
  });

  it("不支援格式（.xlsx）→ 400，不送 AI", async () => {
    const res = await request(app)
      .post("/api/analyze-file")
      .send({
        fileContent: Buffer.from("dummy").toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: "grades.xlsx",
      });
    expect(res.status).toBe(400);
  });
});

describe("GET/POST /api/gmail/cache", () => {
  it("缺 courseId/assessmentId → 400", async () => {
    expect((await request(app).get("/api/gmail/cache")).status).toBe(400);
    expect((await request(app).post("/api/gmail/cache").send({})).status).toBe(400);
  });

  it("空暫存讀取回傳空 messages", async () => {
    const res = await request(app).get("/api/gmail/cache").query({ courseId: "c1", assessmentId: "a1" });
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  it("寫入暫存 → 再讀回一致（round-trip）", async () => {
    const messages = [{ messageId: "m1", studentName: "王小明", attachments: [] }];
    const save = await request(app)
      .post("/api/gmail/cache")
      .send({ courseId: "c1", assessmentId: "a1", pulledAt: "2026-06-20T00:00:00Z", messages });
    expect(save.status).toBe(200);

    const read = await request(app).get("/api/gmail/cache").query({ courseId: "c1", assessmentId: "a1" });
    expect(read.body.messages).toHaveLength(1);
    expect(read.body.messages[0].messageId).toBe("m1");
    expect(read.body.pulledAt).toBe("2026-06-20T00:00:00Z");
  });
});

describe("/api/gmail/analyze-cached 守門（不觸發 Gemini）", () => {
  it("缺必要參數 → 400", async () => {
    const res = await request(app).post("/api/gmail/analyze-cached").send({ courseId: "c1" });
    expect(res.status).toBe(400);
  });

  it("找不到暫存批次 → 404", async () => {
    const res = await request(app)
      .post("/api/gmail/analyze-cached")
      .send({ courseId: "no-such", assessmentId: "no-such", messageId: "m1" });
    expect(res.status).toBe(404);
  });
});
