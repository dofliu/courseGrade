import express from "express";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { matchStudentFromSignals } from "./src/lib/matching";

// 優先讀 .env.local（放本機機密，與 Vite 前端共用同一檔），再以 .env 補沒設到的值。
// dotenv 預設不覆寫已存在的變數，所以先載入的 .env.local 具有較高優先序。
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 版本與啟動時間：讓前端能顯示「跑的是不是最新程式、何時啟動」，避免改了 server 卻忘了重啟
const APP_VERSION = "2026.06";
const SERVER_STARTED_AT = new Date().toISOString();

// JSON body 上限：支援一次上傳多份 base64 講義/掃描檔（出題的大 PDF）
app.use(express.json({ limit: "50mb" }));

// DB File destination
const DB_FILE = path.join(process.cwd(), "db.json");

// Cache Gemini AI instance
let aiClient: GoogleGenAI | null = null;

function getGeminiAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. AI functions will fail.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// 判斷是否為「暫時性」錯誤（值得重試）：限流/伺服器忙/網路；400 等永久錯誤不重試
function isRetryableGeminiError(e: any): boolean {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    /\b(429|500|502|503|504)\b/.test(msg) ||
    msg.includes("resource_exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("internal error") ||
    msg.includes("deadline") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  );
}

// 呼叫 Gemini，遇暫時性錯誤自動退避重試（1s→2s），讓單筆偶發失敗不中斷整批
async function geminiGenerate(args: any, attempts = 3): Promise<any> {
  const ai = getGeminiAI();
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await ai.models.generateContent(args);
    } catch (e: any) {
      lastErr = e;
      if (i < attempts - 1 && isRetryableGeminiError(e)) {
        const delay = 1000 * Math.pow(2, i);
        console.warn(`[Gemini] 暫時性錯誤，${delay}ms 後重試（${i + 1}/${attempts - 1}）：`, e?.message || e);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Initial demo database content
const DEFAULT_DB = {
  courses: [
    {
      id: "alg-2026",
      name: "演算法設計與分析 (Algorithms Design)",
      semester: "114-2",
      assessments: [
        { id: "hw1", name: "作業 1 (分治法)", weight: 15, type: "hw" },
        { id: "hw2", name: "作業 2 (動態規劃)", weight: 15, type: "hw" },
        { id: "quiz1", name: "隨堂小考 1", weight: 10, type: "quiz" },
        { id: "midterm", name: "期中考試", weight: 30, type: "midterm" },
        { id: "project", name: "期末專題報告", weight: 30, type: "project" }
      ],
      students: [
        {
          id: "std-001",
          studentId: "111306021",
          name: "陳冠宇",
          email: "guanyu.chen@example.com",
          grades: { "hw1": 85, "quiz1": 80, "midterm": 75 },
          feedback: {
            "hw1": "邏輯推導大致正確，細節部分的虛擬碼可以更精簡。",
            "midterm": "期中表現良好，時間複雜度分析有待加強。"
          },
          submitStatus: { "hw1": "submitted", "quiz1": "submitted", "midterm": "submitted", "hw2": "missing", "project": "unreleased" }
        },
        {
          id: "std-002",
          studentId: "111306042",
          name: "林佳穎",
          email: "jiaying.lin@example.com",
          grades: { "hw1": 92, "hw2": 95, "quiz1": 90, "midterm": 88 },
          feedback: {
            "hw1": "作業非常工整，圖示輔助清晰易懂，完美！",
            "hw2": "答案全對，實作細節考量全面。"
          },
          submitStatus: { "hw1": "submitted", "hw2": "submitted", "quiz1": "submitted", "midterm": "submitted", "project": "missing" }
        },
        {
          id: "std-003",
          studentId: "111306075",
          name: "張家豪",
          email: "moredof@gmail.com", // Linked to user's real email for easy automatic scanning demonstration
          grades: { "hw1": 78, "quiz1": 65 },
          feedback: {
            "hw1": "完成度尚可，但空間複雜度沒有寫出來，請加油。"
          },
          submitStatus: { "hw1": "submitted", "quiz1": "submitted", "midterm": "missing", "hw2": "missing", "project": "missing" }
        },
        {
          id: "std-004",
          studentId: "111306110",
          name: "許雅婷",
          email: "yating.hsu@example.com",
          grades: {},
          feedback: {},
          submitStatus: { "hw1": "missing", "hw2": "missing", "quiz1": "missing", "midterm": "missing", "project": "missing" }
        }
      ]
    },
    {
      id: "calc-2026",
      name: "微積分甲 (Calculus I)",
      semester: "114-2",
      assessments: [
        { id: "test1", name: "單元測驗 1", weight: 20, type: "quiz" },
        { id: "test2", name: "單元測驗 2", weight: 20, type: "quiz" },
        { id: "mid", name: "期中會考", weight: 30, type: "midterm" },
        { id: "final", name: "期末會考", weight: 30, type: "final" }
      ],
      students: [
        {
          id: "std-001",
          studentId: "111306021",
          name: "陳冠宇",
          email: "guanyu.chen@example.com",
          grades: { "test1": 70 },
          feedback: { "test1": "導數的連鎖律公式應用有小紕漏，需再複習。" },
          submitStatus: { "test1": "submitted" }
        },
        {
          id: "std-002",
          studentId: "111306042",
          name: "林佳穎",
          email: "jiaying.lin@example.com",
          grades: { "test1": 88 },
          feedback: { "test1": "微積分基本定理應用正確，寫得十分流暢。" },
          submitStatus: { "test1": "submitted" }
        }
      ]
    }
  ]
};

/* ──────────────────────────────────────────────────────────────────────────
   DB 安全儲存：原子寫入 + 自動備份 + 防呆驗證
   目標：絕不因為單次讀／寫失敗而弄丟既有成績資料。
   ────────────────────────────────────────────────────────────────────────── */
const DB_TMP = DB_FILE + ".tmp";
const DB_BACKUP_DIR = path.join(process.cwd(), "backups");
const BACKUP_KEEP = 50;                          // 最多保留幾份備份
const BACKUP_MIN_INTERVAL_MS = 3 * 60 * 1000;    // 同一份至少間隔 3 分鐘才再備份（避免每次改分都備份）

// 基本結構驗證：合法的 DB 一定有 courses 陣列，且每門課有 id / students / assessments
function isValidDb(data: any): boolean {
  if (!data || !Array.isArray(data.courses)) return false;
  const coursesOk = data.courses.every(
    (c: any) => c && typeof c.id === "string" && Array.isArray(c.students) && Array.isArray(c.assessments)
  );
  // 新頂層集合（整合 unicourse）：有就必須是陣列，沒有也可（向後相容）
  const optArrayOk = ["homeroomClasses", "roster", "transcripts", "officers", "examPapers"].every(
    (k) => data[k] === undefined || Array.isArray(data[k])
  );
  return coursesOk && optArrayOk;
}

async function listBackups(): Promise<string[]> {
  try {
    return (await fs.readdir(DB_BACKUP_DIR))
      .filter((f) => f.startsWith("db-") && f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

// 從最新一份「合法」備份還原（讀檔毀損時的救命稻草）
async function tryRestoreFromBackup(): Promise<any | null> {
  const files = (await listBackups()).reverse();
  for (const f of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(DB_BACKUP_DIR, f), "utf-8"));
      if (isValidDb(data)) {
        console.warn(`[DB] db.json 無法解析，已從備份還原：${f}`);
        return data;
      }
    } catch {
      /* 試下一份 */
    }
  }
  return null;
}

// 覆寫前先備份目前的 db.json（節流 + 修剪），保住「上一個好版本」
async function backupCurrentDB() {
  try {
    await fs.access(DB_FILE);
  } catch {
    return; // 沒有現檔（首次執行）就不用備份
  }
  try {
    await fs.mkdir(DB_BACKUP_DIR, { recursive: true });
    const existing = await listBackups();
    if (existing.length > 0) {
      const newest = existing[existing.length - 1];
      const stat = await fs.stat(path.join(DB_BACKUP_DIR, newest));
      if (Date.now() - stat.mtimeMs < BACKUP_MIN_INTERVAL_MS) return; // 太近，跳過
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.copyFile(DB_FILE, path.join(DB_BACKUP_DIR, `db-${stamp}.json`));
    const after = await listBackups();
    for (const f of after.slice(0, Math.max(0, after.length - BACKUP_KEEP))) {
      await fs.unlink(path.join(DB_BACKUP_DIR, f)).catch(() => {});
    }
  } catch (e: any) {
    console.warn("[DB] 備份失敗（不影響存檔）：", e.message);
  }
}

// 讀取 DB。檔案不存在 → 建預設；檔案毀損 → 絕不覆蓋原檔，改從備份還原。
async function readDB() {
  let content: string;
  try {
    content = await fs.readFile(DB_FILE, "utf-8");
  } catch (e: any) {
    if (e.code === "ENOENT") {
      await writeDB(DEFAULT_DB); // 首次執行才建立預設
      return DEFAULT_DB;
    }
    throw e; // 權限等其他讀取錯誤 → 不亂寫
  }
  try {
    const data = JSON.parse(content);
    if (!isValidDb(data)) throw new Error("schema invalid");
    return data;
  } catch {
    const restored = await tryRestoreFromBackup();
    if (restored) return restored;
    // 無法還原也絕不覆蓋原檔，讓使用者能手動搶救
    throw new Error("db.json 內容毀損且無可用備份；已保留原檔未動，請手動檢查 db.json 或 backups/ 目錄。");
  }
}

// 原子寫入：備份舊檔 → 寫暫存檔 → rename 取代，避免寫到一半造成毀損。
async function writeDB(data: any) {
  if (!isValidDb(data)) {
    throw new Error("拒絕寫入：資料結構不合法（缺 courses/students/assessments），保護現有成績不被覆蓋。");
  }
  await backupCurrentDB();
  await fs.writeFile(DB_TMP, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(DB_TMP, DB_FILE);
}

/* ==========================================================================
   GMAIL 離線暫存 (scan cache)
   「讀取 Gmail」時一次把整批信件 metadata + 附件二進位下載到本機磁碟，
   之後複查 / AI 評分 / 下次開啟都讀本機，不必再連 Gmail。
   ========================================================================== */

const GMAIL_CACHE_DIR = path.join(process.cwd(), "gmail_cache");
const GMAIL_FILES_DIR = path.join(GMAIL_CACHE_DIR, "files");

function safeKey(s: string) {
  return String(s || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}
function gmailCachePath(courseId: string, assessmentId: string) {
  return path.join(GMAIL_CACHE_DIR, `${safeKey(courseId)}__${safeKey(assessmentId)}.json`);
}
async function readGmailCache(courseId: string, assessmentId: string) {
  try {
    return JSON.parse(await fs.readFile(gmailCachePath(courseId, assessmentId), "utf-8"));
  } catch {
    return null;
  }
}
async function writeGmailCache(courseId: string, assessmentId: string, data: any) {
  await fs.mkdir(GMAIL_FILES_DIR, { recursive: true });
  await fs.writeFile(gmailCachePath(courseId, assessmentId), JSON.stringify(data, null, 2), "utf-8");
}

// 從 Jupyter Notebook (.ipynb, 其實是 JSON) 擷取文字：Markdown + 程式碼 + 文字輸出。
function extractNotebookText(buf: Buffer): string {
  let nb: any;
  try {
    nb = JSON.parse(buf.toString("utf-8"));
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

// 依檔案型態組一個 Gemini content 片段（字串文字 或 {inlineData}）。不支援的格式回 null。
// .ipynb / .docx 先擷取文字；圖片 / PDF / 純文字直接送原檔；其餘（.xlsx/壓縮檔…）回 null。
async function buildGradingPart(buf: Buffer, mimeType: string, filename: string): Promise<any | null> {
  const mt = String(mimeType || "").toLowerCase();
  const fn = String(filename || "").toLowerCase();
  if (fn.endsWith(".ipynb")) {
    const text = extractNotebookText(buf);
    return text.trim() ? `檔案「${filename}」(Jupyter Notebook 擷取)：\n${text}` : null;
  }
  if (mt.includes("wordprocessingml") || fn.endsWith(".docx")) {
    let text = "";
    try {
      text = (await mammoth.extractRawText({ buffer: buf })).value || "";
    } catch {
      text = "";
    }
    return text.trim() ? `檔案「${filename}」(Word 擷取文字)：\n${text}` : null;
  }
  if (mt.startsWith("image/") || mt === "application/pdf" || mt.startsWith("text/")) {
    return { inlineData: { mimeType: mimeType || "image/jpeg", data: buf.toString("base64") } };
  }
  return null;
}

// 共用的 Gemini 評分流程。吃「已組好的 content 片段陣列」（字串或 {inlineData}），
// 可一次餵入一封信的多個附件（多頁掃描）一起評。
async function gradeSubmissionWithGemini(opts: {
  parts: any[];   // 字串（文字）或 {inlineData:{mimeType,data}}（圖片/PDF）
  label: string;  // 描述用（檔名清單）
  roster: any;
  assessmentName: string;
  rubric?: string;
}) {
  const { parts, label, roster, assessmentName, rubric } = opts;
  const ai = getGeminiAI();

  const systemPrompt = `You are an elite, highly precise university assistant built to grade assignments.
You write exclusively in Traditional Chinese (繁體中文).
You are evaluating the submission "${label}" for the assessment "${assessmentName}".
If multiple files/pages are provided, treat them together as ONE student's single submission.
${rubric ? `\nThe instructor has provided the following grading rubric / criteria. You MUST grade strictly according to it (scoring weights, key points, and deduction rules):\n"""\n${rubric}\n"""\n` : ""}
Your goal:
1. Examine this custom assignment workspace submission.
2. Verify if you can identify the student name, registration ID inside.
3. Compare with the roster list: ${JSON.stringify(roster)}
4. Determine the score (0 to 100), grading reasons, and constructive traditional Chinese feedback.
5. In addition to grading, classify the email as "作業繳交" (Homework Submission) or other types.

Return your response in clean JSON matching the target schema.`;

  const contents: any[] = [
    ...parts,
    `Grading student submission "${label}" (may span multiple files/pages). Verify details, evaluate quality, and generate feedback.`,
  ];

  const result = await geminiGenerate({
    model: "gemini-3.5-flash",
    contents,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          studentName: { type: Type.STRING, description: "Identified student name that best matches the roster list." },
          studentId: { type: Type.STRING, description: "Detected pupil index / student ID key." },
          score: { type: Type.INTEGER, description: "Fair TA score from 0 to 100." },
          feedback: { type: Type.STRING, description: "TA analysis review remarks in Taiwan Traditional Chinese." },
          confidence: { type: Type.NUMBER, description: "Quality estimation confidence from 0.0 to 1.0." },
          keyPoints: {
            type: Type.ARRAY,
            description: "List of key-points and notable concepts summarized from the student's submission.",
            items: { type: Type.STRING },
          },
        },
        required: ["studentName", "score", "feedback"],
      },
    },
  });

  return JSON.parse(result.text || "{}");
}

// AI 出題（紙本考卷）。parts 為講義內容片段（文字或圖片/PDF），可空（純章節出題）。
async function generateExamWithGemini(opts: {
  parts: any[];
  course: string;
  count: number;
  questionTypes?: string[];
  mode?: "strict" | "creative";
  contentFocus?: string;
  topics?: string;
}) {
  const ai = getGeminiAI();
  const types =
    opts.questionTypes && opts.questionTypes.length
      ? opts.questionTypes
      : ["multiple-choice", "true-false", "fill-in-the-blank"];
  const hasFiles = opts.parts.length > 0;
  const modeInstr = hasFiles
    ? opts.mode === "creative"
      ? "以提供的講義為基礎出題，可適度延伸相關但合理的概念。"
      : "只能根據提供的講義內容出題，嚴格不要超出講義範圍。"
    : "";

  const instruction =
    `You are an expert exam author. Generate exactly ${opts.count} exam questions in Traditional Chinese (繁體中文) ` +
    `for the course "${opts.course}". Allowed question types ONLY: ${types.join(", ")}. ` +
    (hasFiles ? `${modeInstr} ` : opts.topics ? `Cover these topics/chapters: ${opts.topics}. ` : "") +
    (opts.contentFocus ? `Additional focus/style instruction: "${opts.contentFocus}". ` : "") +
    `For multiple-choice, provide an "options" array of {key,value} objects with keys A, B, C, D, and set correctAnswer to the correct key (e.g. "A"). ` +
    `For true-false, correctAnswer must be "正確" or "錯誤". For fill-in-the-blank, correctAnswer is the expected answer text. ` +
    `Vary difficulty across basic/medium/advanced. Questions and options MUST be Traditional Chinese. Return a JSON array.`;

  const contents = [...opts.parts, instruction];

  const result = await geminiGenerate({
    model: "gemini-3.5-flash",
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["multiple-choice", "true-false", "fill-in-the-blank"] },
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { key: { type: Type.STRING }, value: { type: Type.STRING } },
                required: ["key", "value"],
              },
            },
            correctAnswer: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ["basic", "medium", "advanced"] },
          },
          required: ["type", "question", "correctAnswer", "difficulty"],
        },
      },
    },
  });

  const raw = JSON.parse(result.text || "[]");
  const POINTS: Record<string, number> = { basic: 4, medium: 5, advanced: 8 };
  return (Array.isArray(raw) ? raw : []).map((q: any, i: number) => {
    let options: { [k: string]: string } | undefined;
    if (Array.isArray(q.options) && q.options.length) {
      options = q.options.reduce((acc: any, o: any) => {
        if (o && typeof o.key === "string") acc[o.key] = o.value;
        return acc;
      }, {});
    }
    return {
      id: `gen-q-${i}`,
      type: q.type,
      question: q.question || "",
      options,
      correctAnswer: q.correctAnswer || "",
      difficulty: q.difficulty || "medium",
      points: POINTS[q.difficulty] ?? 5,
    };
  });
}

// 多訊號學籍配對改用共用模組 src/lib/matching（與前端同一份邏輯、有單元測試）

// 列出並解析 Gmail 信件（不下載附件）— 給 pull 端點使用
async function listAndParseGmailMessages(accessToken: string, query: string, labelIds: any, roster: any) {
  const searchQuery = encodeURIComponent(query || "");
  let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=20`;
  if (Array.isArray(labelIds)) {
    for (const id of labelIds) listUrl += `&labelIds=${encodeURIComponent(id)}`;
  }

  const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listResponse.ok) {
    throw new Error("Gmail 列信失敗: " + (await listResponse.text()));
  }
  const listData = (await listResponse.json()) as any;
  const messageRefs = listData.messages || [];

  const results: any[] = [];
  for (const msgRef of messageRefs) {
    const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgResponse.ok) continue;

    const msg = (await msgResponse.json()) as any;
    const headers = msg.payload?.headers || [];
    const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "(無主旨)";
    const sender = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "(未知寄件者)";
    const date = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";

    const emailMatch = sender.match(/<([^>]+)>/) || [null, sender];
    const fromEmail = emailMatch[1]?.trim() || sender.trim();
    // 寄件者顯示名稱（"朱文明" <...> → 朱文明）
    const senderNameMatch = sender.match(/^\s*"?([^"<]+?)"?\s*</);
    const senderName = senderNameMatch ? senderNameMatch[1].trim() : "";

    let bodyText = "";
    const estimateBody = (part: any): string => {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part.parts) {
        for (const sub of part.parts) {
          const found = estimateBody(sub);
          if (found) return found;
        }
      }
      return "";
    };
    bodyText = estimateBody(msg.payload || {});

    const attachments: any[] = [];
    const collectAttachments = (part: any) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({ id: part.body.attachmentId, filename: part.filename, mimeType: part.mimeType, size: part.body.size });
      }
      if (part.parts) for (const sub of part.parts) collectAttachments(sub);
    };
    collectAttachments(msg.payload || {});

    // 多訊號配對：信箱 → 學號 → 姓名（從主旨/寄件者名/內文/附件檔名找）
    const { student: matchedStudent, by: matchedBy } = matchStudentFromSignals(roster || [], {
      subject,
      senderName,
      fromEmail,
      bodyExcerpt: bodyText,
      filenames: attachments.map((a) => a.filename),
    });

    results.push({
      messageId: msg.id,
      subject,
      sender,
      fromEmail,
      date,
      bodyExcerpt: bodyText.slice(0, 300),
      attachments,
      matchedStudent: matchedStudent || null,
      matchedBy,
    });
  }
  return results;
}

// 從 Gmail 下載單一附件二進位並存到本機磁碟，回傳檔名（相對 GMAIL_FILES_DIR）
async function downloadAttachmentToDisk(accessToken: string, courseId: string, assessmentId: string, messageId: string, att: any) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${att.id}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(await r.text());
  const d = (await r.json()) as any;
  const normalBase64 = (d.data || "").replace(/-/g, "+").replace(/_/g, "/");
  const buf = Buffer.from(normalBase64, "base64");
  await fs.mkdir(GMAIL_FILES_DIR, { recursive: true });
  // 用短雜湊當檔名 — Gmail 的 attachmentId 長達數百字元，直接當檔名會超過
  // Windows 260 字元路徑上限導致 ENOENT 寫檔失敗。
  const localName = crypto
    .createHash("sha1")
    .update(`${courseId}|${assessmentId}|${messageId}|${att.id}`)
    .digest("hex");
  await fs.writeFile(path.join(GMAIL_FILES_DIR, localName), buf);
  return localName;
}

/* ==========================================================================
   EXPRESS REST ENDPOINTS
   ========================================================================== */

// 1. Get entire Database
app.get("/api/db", async (req, res) => {
  try {
    const data = await readDB();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to read database: " + e.message });
  }
});

// 版本/啟動時間：前端用來顯示「目前跑的 server 何時啟動」，方便確認改了 server 有沒有重啟
app.get("/api/version", (_req, res) => {
  res.json({ version: APP_VERSION, startedAt: SERVER_STARTED_AT });
});

// 2. Save entire Database
app.post("/api/db", async (req, res) => {
  try {
    const data = req.body;
    if (!isValidDb(data)) {
      return res.status(400).json({ error: "資料結構不合法，未儲存（保護現有成績）。" });
    }
    // 防呆：避免用「空課程」覆蓋掉「現有有課程」的檔（多半是前端異常或誤觸）
    if (data.courses.length === 0) {
      const current = await readDB().catch(() => null);
      if (current && Array.isArray(current.courses) && current.courses.length > 0) {
        return res.status(409).json({ error: "拒絕以空白資料覆蓋現有課程（防呆）。如確定要清空，請手動處理 db.json。" });
      }
    }
    await writeDB(data);
    res.json({ success: true, message: "Database saved successfully" });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to save database: " + e.message });
  }
});

// 3. AI analysis of single file (for local folder file upload)
app.post("/api/analyze-file", async (req, res) => {
  try {
    const { fileContent, mimeType, fileName, roster, assessmentName, description, rubric } = req.body;

    if (!fileContent) {
      return res.status(400).json({ error: "Missing file content" });
    }

    // 依檔案型態組片段：.ipynb / .docx 擷取文字；圖片 / PDF / 純文字直接送；其餘不支援
    const buf = Buffer.from(fileContent, "base64");
    const part = await buildGradingPart(buf, mimeType, fileName);
    if (!part) {
      return res.status(400).json({
        error: `格式（${mimeType || fileName}）無法由 AI 直接評分，請轉成 PDF 或手動輸入分數。`,
      });
    }

    const parsedResponse = await gradeSubmissionWithGemini({
      parts: [part],
      label: fileName || "作業",
      roster: roster || [],
      assessmentName: assessmentName || "作業",
      rubric,
    });
    res.json(parsedResponse);

  } catch (e: any) {
    console.error("AI File analysis error:", e);
    res.status(500).json({ error: "AI Analysis failed: " + e.message });
  }
});

// 3b. AI 出題（紙本考卷）— 可上傳講義（多份、多格式）從內容出題
app.post("/api/exam/generate", async (req, res) => {
  try {
    const { course, count, questionTypes, mode, contentFocus, topics, files } = req.body;
    const n = Number(count);
    if (!n || n < 1) return res.status(400).json({ error: "請指定題數（至少 1）。" });

    // 把上傳的講義轉成 Gemini content 片段（docx/ipynb 擷文字、pdf/圖片多模態）
    const parts: any[] = [];
    const usedFiles: string[] = [];
    const skippedFiles: string[] = [];
    for (const f of Array.isArray(files) ? files : []) {
      try {
        const buf = Buffer.from(f.base64 || "", "base64");
        const part = await buildGradingPart(buf, f.mimeType, f.filename);
        if (part) {
          parts.push(part);
          usedFiles.push(f.filename);
        } else {
          skippedFiles.push(f.filename);
        }
      } catch {
        skippedFiles.push(f.filename);
      }
    }

    const questions = await generateExamWithGemini({
      parts,
      course: course || "課程",
      count: n,
      questionTypes,
      mode,
      contentFocus,
      topics,
    });

    res.json({ questions, usedFiles, skippedFiles });
  } catch (e: any) {
    console.error("Exam generate error:", e);
    res.status(500).json({ error: "AI 出題失敗: " + e.message });
  }
});

// 3.5 列出使用者的 Gmail 信件匣（標籤），讓老師先挑要掃描的資料夾再縮小範圍
app.post("/api/gmail/labels", async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(401).json({ error: "需要 Google OAuth access token。" });
    }

    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: "讀取 Gmail 標籤失敗: " + (await r.text()) });
    }

    const data = (await r.json()) as any;
    const labels = (data.labels || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      type: l.type, // "system" | "user"
    }));
    res.json({ labels });
  } catch (e: any) {
    console.error("Gmail labels error:", e);
    res.status(500).json({ error: "Failed to list Gmail labels: " + e.message });
  }
});

// 4. Scan Gmail for Homework submissions
// Expects: accessToken in body, query (search query), optional labelIds, and assessment parameters
app.post("/api/gmail/scan", async (req, res) => {
  try {
    const { accessToken, query, roster, assessmentName, labelIds } = req.body;

    if (!accessToken) {
      return res.status(401).json({ error: "Google OAuth access token is required for Gmail scanning." });
    }

    // Call Gmail API: search messages
    const searchQuery = encodeURIComponent(query || "");
    let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=20`;

    // 限定只搜尋指定的信件匣（label），避免一次撈到整個信箱
    if (Array.isArray(labelIds)) {
      for (const id of labelIds) {
        listUrl += `&labelIds=${encodeURIComponent(id)}`;
      }
    }

    const listResponse = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!listResponse.ok) {
      const errText = await listResponse.text();
      return res.status(listResponse.status).json({ error: "Failed to fetch messages from Gmail: " + errText });
    }

    const listData = (await listResponse.json()) as any;
    const messages = listData.messages || [];

    const results: any[] = [];

    // For each message, fetch details
    for (const msgRef of messages) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}`;
      const msgResponse = await fetch(msgUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!msgResponse.ok) continue;

      const msg = (await msgResponse.json()) as any;
      const headers = msg.payload?.headers || [];
      const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "(無主旨)";
      const sender = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "(未知寄件者)";
      const date = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";

      // Extract sender email
      const emailMatch = sender.match(/<([^>]+)>/) || [null, sender];
      const fromEmail = emailMatch[1]?.trim() || sender.trim();

      // Look for plain-text body
      let bodyText = "";
      const estimateBody = (part: any): string => {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) {
          for (const sub of part.parts) {
            const found = estimateBody(sub);
            if (found) return found;
          }
        }
        return "";
      };
      
      bodyText = estimateBody(msg.payload || {});

      // Find attachments
      const attachments: any[] = [];
      const collectAttachments = (part: any) => {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
          });
        }
        if (part.parts) {
          for (const sub of part.parts) {
            collectAttachments(sub);
          }
        }
      };
      collectAttachments(msg.payload || {});

      // Try matching the sender index to student roster by email address!
      let matchedStudent = roster.find((s: any) => s.email.toLowerCase() === fromEmail.toLowerCase());

      results.push({
        messageId: msg.id,
        subject,
        sender,
        fromEmail,
        date,
        bodyExcerpt: bodyText.slice(0, 300),
        attachments,
        matchedStudent: matchedStudent || null,
      });
    }

    res.json({ messages: results });

  } catch (e: any) {
    console.error("Gmail listing error:", e);
    res.status(500).json({ error: "Failed to scan Gmail messages: " + e.message });
  }
});

// 5. Download and analyze single Gmail Attachment
app.post("/api/gmail/analyze-attachment", async (req, res) => {
  try {
    const { accessToken, messageId, attachmentId, mimeType, filename, roster, assessmentName, rubric } = req.body;

    if (!accessToken || !messageId || !attachmentId) {
      return res.status(400).json({ error: "Missing required arguments for attachment download" });
    }

    // Fetch the attachment binary contents
    const attachUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
    const attachResponse = await fetch(attachUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!attachResponse.ok) {
      const errText = await attachResponse.text();
      return res.status(attachResponse.status).json({ error: "Failed to download attachment: " + errText });
    }

    const attachData = (await attachResponse.json()) as any;
    // Gmail API returns base64 url-safe format
    const urlSafeBase64 = attachData.data || "";
    // Standard Base64
    const normalBase64 = urlSafeBase64.replace(/-/g, "+").replace(/_/g, "/");

    // Run Gemini analysis!
    const ai = getGeminiAI();

    const systemPrompt = `You are an elite, highly precise university assistant built to grade assignments.
You write exclusively in Traditional Chinese (繁體中文).
You are evaluating the submitted file "${filename}" for the assessment "${assessmentName}".
${rubric ? `\nThe instructor has provided the following grading rubric / criteria. You MUST grade strictly according to it (scoring weights, key points, and deduction rules):\n"""\n${rubric}\n"""\n` : ""}
Your goal:
1. Examine this custom assignment workspace submission.
2. Verify if you can identify the student name, registration ID inside.
3. Compare with the roster list: ${JSON.stringify(roster)}
4. Determine the score (0 to 100), grading reasons, and constructive traditional Chinese feedback.
5. In addition to grading, classify the email as "作業繳交" (Homework Submission) or other types.

Return your response in clean JSON matching the target schema.`;

    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: normalBase64,
      },
    };

    const textPrompt = `Grading student submission file download from Gmail: "${filename}". Verify details, evaluate quality, and generate feedback.`;

    const result = await geminiGenerate({
      model: "gemini-3.5-flash",
      contents: [imagePart, textPrompt],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: {
              type: Type.STRING,
              description: "Identified student name that best matches the roster list."
            },
            studentId: {
              type: Type.STRING,
              description: "Detected pupil index / student ID key."
            },
            score: {
              type: Type.INTEGER,
              description: "Fair TA score from 0 to 100."
            },
            feedback: {
              type: Type.STRING,
              description: "TA analysis review remarks in Taiwan Traditional Chinese."
            },
            confidence: {
              type: Type.NUMBER,
              description: "Quality estimation confidence from 0.0 to 1.0."
            },
            keyPoints: {
              type: Type.ARRAY,
              description: "List of key-points and notable concepts summarized from the student's submission.",
              items: { type: Type.STRING }
            }
          },
          required: ["studentName", "score", "feedback"],
        }
      },
    });

    const parsedResponse = JSON.parse(result.text || "{}");
    res.json({
      success: true,
      filename,
      ...parsedResponse,
      rawBase64Length: normalBase64.length,
    });

  } catch (e: any) {
    console.error("Gmail attachment analyze error:", e);
    res.status(500).json({ error: "Attachment AI grading failed: " + e.message });
  }
});

// 6. PULL：掃描 Gmail 並把整批信件 + 所有附件下載到本機磁碟，存成 manifest（需 token，一次性）
app.post("/api/gmail/pull", async (req, res) => {
  try {
    const { accessToken, query, roster, labelIds, courseId, assessmentId } = req.body;
    if (!accessToken) return res.status(401).json({ error: "需要 Google OAuth access token。" });
    if (!courseId || !assessmentId) return res.status(400).json({ error: "缺少 courseId / assessmentId。" });

    const parsed = await listAndParseGmailMessages(accessToken, query, labelIds, roster || []);

    // 逐封下載附件到磁碟
    const messages: any[] = [];
    for (const m of parsed) {
      const cachedAttachments: any[] = [];
      for (const att of m.attachments) {
        try {
          const localFile = await downloadAttachmentToDisk(accessToken, courseId, assessmentId, m.messageId, att);
          cachedAttachments.push({ id: att.id, filename: att.filename, mimeType: att.mimeType, size: att.size, localFile });
        } catch (err: any) {
          console.warn("附件下載失敗:", att.filename, err.message);
          cachedAttachments.push({ id: att.id, filename: att.filename, mimeType: att.mimeType, size: att.size, localFile: null });
        }
      }
      messages.push({ ...m, attachments: cachedAttachments, status: "idle" });
    }

    const manifest = { courseId, assessmentId, pulledAt: new Date().toISOString(), messages };
    await writeGmailCache(courseId, assessmentId, manifest);
    res.json(manifest);
  } catch (e: any) {
    console.error("Gmail pull error:", e);
    res.status(500).json({ error: "讀取並下載 Gmail 失敗: " + e.message });
  }
});

// 7. 讀取本機暫存批次（免 token）— 開啟頁面 / 切換課程項目時自動載入上次拉取的結果
app.get("/api/gmail/cache", async (req, res) => {
  try {
    const { courseId, assessmentId } = req.query as any;
    if (!courseId || !assessmentId) return res.status(400).json({ error: "缺少 courseId / assessmentId。" });
    const cache = await readGmailCache(String(courseId), String(assessmentId));
    res.json(cache || { courseId, assessmentId, pulledAt: null, messages: [] });
  } catch (e: any) {
    res.status(500).json({ error: "讀取暫存失敗: " + e.message });
  }
});

// 8. 儲存本機暫存批次（免 token）— 前端在手動校正、批次評分後把最新 messages 寫回
app.post("/api/gmail/cache", async (req, res) => {
  try {
    const { courseId, assessmentId, pulledAt, messages } = req.body;
    if (!courseId || !assessmentId) return res.status(400).json({ error: "缺少 courseId / assessmentId。" });
    // 若前端沒帶 pulledAt，保留既有 manifest 的拉取時間，避免被覆蓋成 null
    const existing = await readGmailCache(courseId, assessmentId);
    const keptPulledAt = pulledAt || existing?.pulledAt || null;
    await writeGmailCache(courseId, assessmentId, { courseId, assessmentId, pulledAt: keptPulledAt, messages: messages || [] });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: "儲存暫存失敗: " + e.message });
  }
});

// 9. 用本機暫存的附件做 AI 評分（免 token）— 評分結果回寫 manifest
app.post("/api/gmail/analyze-cached", async (req, res) => {
  try {
    const { courseId, assessmentId, messageId, roster, assessmentName, rubric } = req.body;
    if (!courseId || !assessmentId || !messageId) {
      return res.status(400).json({ error: "缺少 courseId / assessmentId / messageId。" });
    }

    const cache = await readGmailCache(courseId, assessmentId);
    if (!cache) return res.status(404).json({ error: "找不到本機暫存批次，請先點「讀取 Gmail」。" });

    const msg = (cache.messages || []).find((m: any) => m.messageId === messageId);
    if (!msg) return res.status(404).json({ error: "暫存中找不到該封信件。" });

    const atts = (msg.attachments || []).filter((a: any) => a.localFile);
    if (atts.length === 0) return res.status(400).json({ error: "此信件沒有已下載的本機附件可分析。" });

    // 標記為不支援、回寫 manifest、回傳友善訊息（前端會略過、不重試）
    const markUnsupported = async (reason: string) => {
      msg.status = "unsupported";
      msg.unsupported = true;
      await writeGmailCache(courseId, assessmentId, cache);
      return res.json({ success: false, unsupported: true, filename: atts[0].filename, error: reason });
    };

    // 一封信的所有附件一起評（多頁掃描＝同一份繳交）。個別不支援的格式略過、不中斷。
    const parts: any[] = [];
    const usedNames: string[] = [];
    const skippedNames: string[] = [];
    for (const att of atts) {
      const buf = await fs.readFile(path.join(GMAIL_FILES_DIR, att.localFile));
      const part = await buildGradingPart(buf, att.mimeType, att.filename);
      if (part) {
        parts.push(part);
        usedNames.push(att.filename);
      } else {
        skippedNames.push(att.filename);
      }
    }

    if (parts.length === 0) {
      return await markUnsupported(`附件格式皆無法由 AI 直接評分（${skippedNames.join("、")}），請轉成 PDF 或手動輸入分數。`);
    }

    const parsed: any = await gradeSubmissionWithGemini({
      parts,
      label: usedNames.join("、"),
      roster: roster || [],
      assessmentName: assessmentName || "作業",
      rubric,
    });

    // 回寫 manifest，讓 AI 結果持久化（下次開啟仍在）
    msg.analysis = {
      studentName: parsed.studentName || "",
      studentId: parsed.studentId || "",
      score: parsed.score != null ? parsed.score : 80,
      feedback: parsed.feedback || "",
      confidence: parsed.confidence != null ? parsed.confidence : 0.85,
      keyPoints: parsed.keyPoints || [],
    };
    msg.status = "completed";
    await writeGmailCache(courseId, assessmentId, cache);

    res.json({ success: true, filename: usedNames.join("、"), filesUsed: usedNames.length, filesSkipped: skippedNames, ...parsed });
  } catch (e: any) {
    console.error("Gmail cached analyze error:", e);
    res.status(500).json({ error: "本機附件 AI 評分失敗: " + e.message });
  }
});

/* ==========================================================================
   全域錯誤防護：讓單一壞請求不會把整個 server 弄掛（避免 Failed to fetch）
   ========================================================================== */

// Express 路由意外丟錯時的最後防線（不讓未捕捉的例外冒泡終止程序）
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[express error]", err);
  if (res.headersSent) return;
  // 上傳內容過大（多份大檔）→ 給明確訊息而非神祕 500
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "上傳內容過大（單次上限約 50MB）。請減少檔案數量或大小（大型 PDF 可先壓縮）。" });
  }
  res.status(500).json({ error: "伺服器內部錯誤：" + (err?.message || "未知錯誤") });
});

// 本機單人工具：存活優先於崩潰。記錄錯誤但不結束程序。
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

/* ==========================================================================
   VITE DEV INTEGRATION & DIST SERVING
   ========================================================================== */

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Starting in DEVELOPMENT mode with Vite Middleware.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    try {
      await fs.access(distPath);
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      console.log("Starting in PRODUCTION mode serving static dist.");
    } catch {
      console.warn("WARNING: 'dist' folder was not found. Assets serving might fail. Let's make sure 'npm run build' has completed.");
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Student Grading App] Server running on port ${PORT}`);
  });
}

startServer();
