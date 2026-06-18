import express from "express";
import path from "path";
import fs from "fs/promises";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

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

// Thread-safe DB reader helper
async function readDB() {
  try {
    const content = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    // If not exists, write defaults and return
    await fs.writeFile(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), "utf-8");
    return DEFAULT_DB;
  }
}

// Thread-safe DB writer helper
async function writeDB(data: any) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
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
    if (!data || !Array.isArray(data.courses)) {
      return res.status(400).json({ error: "Invalid database schema provided." });
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
    const { fileContent, mimeType, fileName, roster, assessmentName, description } = req.body;

    if (!fileContent) {
      return res.status(400).json({ error: "Missing file content" });
    }

    const ai = getGeminiAI();

    // Prepare system instruction content
    const systemPrompt = `You are an elite, highly precise university teaching assistant (TA) built to grade student papers, exams, and quizzes.
Your grading is rigorous, fair, and encouraging. You speak and write exclusively in traditional Chinese (繁體中文).

You are grading "${assessmentName}" (Description: ${description || "No specific details"}).

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

// 4. Scan Gmail for Homework submissions
// Expects: accessToken in body, query (search query), and assessment parameters
app.post("/api/gmail/scan", async (req, res) => {
  try {
    const { accessToken, query, roster, assessmentName } = req.body;

    if (!accessToken) {
      return res.status(401).json({ error: "Google OAuth access token is required for Gmail scanning." });
    }

    // Call Gmail API: search messages
    const searchQuery = encodeURIComponent(query || "subject:作業");
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=10`;

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
    const { accessToken, messageId, attachmentId, mimeType, filename, roster, assessmentName } = req.body;

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
