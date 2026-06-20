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
const PORT = 3000;

// Set up JSON body size limit to support base64 school documents
app.use(express.json({ limit: "30mb" }));

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
  return data.courses.every(
    (c: any) => c && typeof c.id === "string" && Array.isArray(c.students) && Array.isArray(c.assessments)
  );
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

// 共用的 Gemini 評分流程。可吃「檔案 base64（圖片/PDF）」或「擷取出來的純文字（.docx）」。
async function gradeSubmissionWithGemini(opts: {
  base64?: string;
  mimeType?: string;
  textContent?: string;
  filename: string;
  roster: any;
  assessmentName: string;
  rubric?: string;
}) {
  const { filename, roster, assessmentName, rubric } = opts;
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

  // 依輸入型態組 contents：文字檔走文字 part，圖片/PDF 走 inlineData
  const contents: any[] = [];
  if (opts.textContent) {
    contents.push(`以下是學生繳交檔案「${filename}」由 Word(.docx) 擷取出的文字內容，請據此評分：\n\n${opts.textContent}`);
  } else {
    contents.push({ inlineData: { mimeType: opts.mimeType || "image/jpeg", data: opts.base64 || "" } });
  }
  contents.push(`Grading student submission file "${filename}". Verify details, evaluate quality, and generate feedback.`);

  const result = await ai.models.generateContent({
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

    const ai = getGeminiAI();

    // Prepare system instruction content
    const systemPrompt = `You are an elite, highly precise university teaching assistant (TA) built to grade student papers, exams, and quizzes.
Your grading is rigorous, fair, and encouraging. You speak and write exclusively in traditional Chinese (繁體中文).

You are grading "${assessmentName}" (Description: ${description || "No specific details"}).
${rubric ? `\nThe instructor has provided the following grading rubric / criteria. You MUST grade strictly according to it (scoring weights, key points, and deduction rules):\n"""\n${rubric}\n"""\n` : ""}
Your job is to:
1. Examine the submitted file (might be an image, screenshot, PDF, scanned sheet, or text document).
2. Scan the file content or filename to determine the student name or student ID.
3. Compare the detected name/ID with the class roster provided: ${JSON.stringify(roster)}. Output the closest student name/student ID match from this roster. If absolutely unable to identify, return an empty string for matched student.
4. Grade the work out of 100 based on accuracy, effort, and completeness.
5. Provide constructive, warm, and highly professional TA feedback (評語) in Traditional Chinese (Taiwan conventions) outlining what they did well, where they made mistakes, and instructions for how to improve.

Return your response in clean JSON format matching the schema rules.`;

    const modelToUse = "gemini-3.5-flash";

    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: fileContent, // Base64 raw string
      },
    };

    const textPrompt = `Filename: "${fileName}"
Please identify the student, grade their work out of 100, and provide custom review feedback. Give detailed reasoning.`;

    const result = await ai.models.generateContent({
      model: modelToUse,
      contents: [imagePart, textPrompt],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: {
              type: Type.STRING,
              description: "The name of the student identified from the file or filename. Match with names in the roster if possible."
            },
            studentId: {
              type: Type.STRING,
              description: "The student ID (學號) identified from the document or roster."
            },
            score: {
              type: Type.INTEGER,
              description: "A grade score out of 100. Be fair and professional."
            },
            feedback: {
              type: Type.STRING,
              description: "Encouraging, strict and informative TA feedback in Traditional Chinese. Address specific contents of the file."
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence from 0.0 to 1.0 that this matches the student roster correctly."
            }
          },
          required: ["studentName", "score", "feedback"],
        },
      },
    });

    const parsedResponse = JSON.parse(result.text || "{}");
    res.json(parsedResponse);

  } catch (e: any) {
    console.error("AI File analysis error:", e);
    res.status(500).json({ error: "AI Analysis failed: " + e.message });
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

    const result = await ai.models.generateContent({
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

    const att = (msg.attachments || []).find((a: any) => a.localFile);
    if (!att) return res.status(400).json({ error: "此信件沒有已下載的本機附件可分析。" });

    const buf = await fs.readFile(path.join(GMAIL_FILES_DIR, att.localFile));
    const mt = String(att.mimeType || "").toLowerCase();
    const fnameLower = String(att.filename || "").toLowerCase();

    // 標記為不支援、回寫 manifest、回傳友善訊息（前端會略過、不重試）
    const markUnsupported = async (reason: string) => {
      msg.status = "unsupported";
      msg.unsupported = true;
      await writeGmailCache(courseId, assessmentId, cache);
      return res.json({ success: false, unsupported: true, filename: att.filename, error: reason });
    };

    let parsed: any;
    if (mt.includes("wordprocessingml") || fnameLower.endsWith(".docx")) {
      // Word .docx → 擷取純文字後送 Gemini（Gemini 不吃 .docx 原檔）
      let text = "";
      try {
        const r = await mammoth.extractRawText({ buffer: buf });
        text = r.value || "";
      } catch {
        return await markUnsupported("此 .docx 無法解析（檔案可能損壞），請改交 PDF 或手動評分。");
      }
      if (!text.trim()) {
        return await markUnsupported("此 .docx 擷取不到文字內容（可能是純圖片），請改交 PDF 或手動評分。");
      }
      parsed = await gradeSubmissionWithGemini({ textContent: text, filename: att.filename, roster: roster || [], assessmentName: assessmentName || "作業", rubric });
    } else if (mt.startsWith("image/") || mt === "application/pdf" || mt.startsWith("text/")) {
      const base64 = buf.toString("base64");
      parsed = await gradeSubmissionWithGemini({ base64, mimeType: att.mimeType, filename: att.filename, roster: roster || [], assessmentName: assessmentName || "作業", rubric });
    } else {
      return await markUnsupported(`格式（${att.mimeType || att.filename}）無法由 AI 直接評分，請轉成 PDF 或手動輸入分數。`);
    }

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

    res.json({ success: true, filename: att.filename, ...parsed });
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
