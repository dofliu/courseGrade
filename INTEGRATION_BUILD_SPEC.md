# EduGrade ← UniCourse 整合實作規格（Claude Code 執行用）

> **這份文件是給 Claude Code 的施工藍圖。** 目標讀者是會直接改 code 的 agent，不是人。
> 請從頭讀完「0. 給 Claude Code 的指示」與「1~3 背景與約束」，再依「8. 分階段任務」逐步施工，每階段做完跑「9. 驗收」。
> 對應的高層規劃書（給人看的）：`EduGrade_UniCourse_整合規劃書.docx`。

---

## 0. 給 Claude Code 的指示

- **主體 repo（在此施工）**：`D:\Project_CodingSimulation\courseRelated\courseGrade`（即 eduGrade）。
- **參考 repo（只讀、抄程式碼）**：`D:\Project_CodingSimulation\courseRelated\unicourseaionline1219`（即 unicourse）。**不要修改它。**
- 每個階段獨立成一個 commit。動工前先 `git checkout -b integrate-classroom`。
- 每階段結束務必跑：`npm run lint`（= `tsc --noEmit`）與 `npm test`（vitest），並手動 `npm run dev` 確認 6 個既有分頁仍正常。
- **絕對不要破壞既有資料與既有 6 分頁**（dashboard / gradebook / submissions / folder / gmail / courses）。
- UI 一律**繁體中文**。樣式用 **Tailwind CSS 4**，圖示用 **lucide-react**。不要引入大型新相依套件（docx 匯出除外，見模組 A）。
- 所有資料都存本機 `db.json`，**不得引入任何資料庫或雲端儲存**。沿用既有的原子寫入＋自動備份機制。

---

## 1. 背景

eduGrade 已經是「無資料庫、email 收件、AI 批改」的單機教師端工具，本整合**以它為唯一主體**，把 unicourse 還有價值的四個模組移植進來，其餘（線上考試、線上繳交、學生登入、Supabase、GCP 部署）全部捨棄。

要移植的四模組：

| 代號 | 模組 | 來源（unicourse 元件） |
|---|---|---|
| A | AI 紙本考卷產生器 | `services/llmService.ts` 的 `generateQuizQuestions` |
| B | 班級經營（學籍/個資/家長/幹部） | `HomeroomStudentManagementEnhanced.tsx`、`HomeroomStudentProfile.tsx`、`StudentInfoManagement.tsx`、`ClassOfficersManagement.tsx` |
| C | 跨學期成績 / 畢業進度 | `GradeManagement.tsx`、`GradeStatistics.tsx`、`StudentGradeView.tsx`、`SemesterManagement.tsx` |
| D | 課堂工具（座位表/點名/抽籤） | `SeatingChart.tsx`、`RollCallPicker.tsx`、`LotteryPicker.tsx`、`ClassroomTools.tsx` |

---

## 2. 目標（Goals）與非目標（Non-goals）

**Goals**
- 在 eduGrade 內新增 4 個分頁，承載 A/B/C/D。
- 資料全部進 `db.json` 的新頂層集合，沿用既有備份/還原。
- A 模組要能閉環：出題 → 列印紙本 → 考後掃描/拍照 → 丟既有「AI 資料夾批次」批改。

**Non-goals（明確不做）**
- 不做學生登入、學生面板、線上作答、線上繳交、改資料申請、師生回饋、問卷、登入紀錄。
- 不接任何資料庫；不做 GCP/Docker/nginx 部署。
- 不保留 unicourse 的 Supabase 存取層（`storageService.ts`）——移植元件時要把它的呼叫改成 props/`/api/db`。

---

## 3. eduGrade 現況（施工接點，全部已確認）

**啟動**：`npm run dev`（= `tsx server.ts`，Express 掛 Vite middleware，http://localhost:3000）。一鍵：`Start-EduGrade.vbs`。

**前端分頁機制**（`src/App.tsx`）：
- 第 14 行：`const [activeTab, setActiveTab] = useState<"dashboard" | "courses" | "folder" | "gmail" | "gradebook" | "submissions">("dashboard");`
- `App` 載入時 `GET /api/db` 取得 `dbState`，存進 `useState<DatabaseState>`。
- 存檔走 `handleSaveDatabase(nextState)` → `POST /api/db`（含 `isSaving` / `saveError` 狀態）。
- 子元件以 **props 接收 `dbState` 切片 + 存檔 callback**（不是 context）。新元件沿用此模式。
- 側邊欄與手機版各一組 `<button onClick={() => setActiveTab(...)}>`；新增分頁要兩邊都加。

**後端關鍵函式**（`server.ts`）：
- `readDB()` / `writeDB(data)`：原子寫入（先寫 `db.json.tmp` 再 rename）＋ `backupCurrentDB()`（節流備份到 `backups/`，保留 50 份）＋ 毀損時自動從備份還原。
- `isValidDb(data)`：**目前只驗 `courses`**。新增頂層集合前**必須改這裡**（見 4.2），否則 `writeDB` 會拒寫。
- `getGeminiAI()`：回傳 `@google/genai` 的 `GoogleGenAI`（金鑰來自 `process.env.GEMINI_API_KEY`）。
- `gradeSubmissionWithGemini(opts)`：批改範例，用 `ai.models.generateContent({ model: "gemini-3.5-flash", config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, ... } } })`。**模組 A 出題請完全比照此寫法**（`Type` 由 `@google/genai` 匯入）。
- 既有端點：`GET/POST /api/db`、`POST /api/analyze-file`、`POST /api/gmail/*`。

**既有型別**（`src/types.ts`）：`AssessmentItem`、`Student`（含 `grades`/`feedback`/`submitStatus`/`adjustment`）、`Course`、`DatabaseState { courses: Course[] }`。

---

## 4. 資料模型變更

### 4.1 `src/types.ts` 新增型別（可直接貼）

```ts
// ---- 班級經營（B）----
export interface HomeroomClass {
  classCode: string;        // 標準班級代碼（主鍵）
  className: string;         // 顯示名稱
  enrollmentYear?: number;  // 入學年（學年制，統一即可）
}

export interface RosterStudent {
  studentId: string;        // 學號（主鍵）
  name: string;
  classCode?: string;       // 對應 HomeroomClass.classCode
  className?: string;        // 顯示用
  email?: string;
  housing?: "dorm" | "off-campus";
  dormRoom?: string;
  mobile?: string;
  address?: string;
  homeAddress?: string;
  homePhone?: string;
  parentName?: string;
  parentPhone1?: string;
  parentPhone2?: string;
  note?: string;
}

export interface ClassOfficer {
  id: string;               // uuid
  classCode: string;
  term: string;             // 如 "114-1"
  title: string;            // 職稱（班長、副班長…）
  studentId: string;
  appointedDate?: string;   // ISO date
  notes?: string;
}

// ---- 跨學期成績（C）----
export interface TranscriptEntry {
  id: string;               // uuid
  studentId: string;
  classCode?: string;
  year: number;             // 學年（如 114）
  semester: number;         // 學期（1 或 2）
  subject: string;
  score: number;
  credits: number;
  gradeType?: string;       // 必修/選修/通識…
  // isPassed 一律由 score >= 60 即時計算，不存
}

// ---- AI 紙本考卷（A）----
export type ExamQuestionType = "multiple-choice" | "true-false" | "fill-in-the-blank";
export type ExamDifficulty = "basic" | "medium" | "advanced";

export interface ExamQuestion {
  id: string;
  type: ExamQuestionType;
  question: string;
  options?: { [key: string]: string };  // 選擇題用 A/B/C/D
  correctAnswer: string;
  difficulty: ExamDifficulty;
  points: number;
}

export interface ExamPaper {
  id: string;
  courseId: string;
  title: string;
  topics: string;           // 章節範圍
  createdAt: number;
  questions: ExamQuestion[];
}

// ---- 擴充總狀態 ----
export interface DatabaseState {
  courses: Course[];                  // 既有，不動
  homeroomClasses?: HomeroomClass[];  // 新（B）
  roster?: RosterStudent[];           // 新（B）
  transcripts?: TranscriptEntry[];    // 新（C）
  officers?: ClassOfficer[];          // 新（B）
  examPapers?: ExamPaper[];           // 新（A）
}
```

> 新集合一律 **optional**，向後相容既有 `db.json`（目前只有 `courses`）。

### 4.2 `server.ts` 的 `isValidDb` 必改

```ts
function isValidDb(data: any): boolean {
  if (!data || !Array.isArray(data.courses)) return false;
  const coursesOk = data.courses.every(
    (c: any) => c && typeof c.id === "string" && Array.isArray(c.students) && Array.isArray(c.assessments)
  );
  // 新頂層集合：有就必須是陣列，沒有也可（向後相容）
  const optArrayOk = ["homeroomClasses", "roster", "transcripts", "officers", "examPapers"]
    .every((k) => data[k] === undefined || Array.isArray(data[k]));
  return coursesOk && optArrayOk;
}
```

### 4.3 存取方式

- **B/C/D 不需要新後端端點**：資料隨整個 `dbState` 經既有 `POST /api/db` 一起存。
  - 新元件改 `dbState.roster`（等）後，呼叫 App 傳下來的存檔 callback（同 `handleSaveDatabase` 模式）。
  - 前端讀 `GET /api/db` 後，對 undefined 集合做預設空陣列：`roster = dbState.roster ?? []`。
- **只有模組 A 需要新端點**（呼叫 Gemini，金鑰必須留在後端）。

---

## 5. 後端變更（只為模組 A）

在 `server.ts` 新增一個出題函式（**比照 `gradeSubmissionWithGemini`**）與端點。Schema 直接抄 unicourse `services/llmService.ts` 第 152–179 行的 `responseSchema`（`generateQuizQuestions` 內）。

> **兩個必知細節（抄 unicourse 時別漏）：**
> 1. **`options` 在 Gemini schema 是 `{key, value}` 物件陣列**（不是物件）。解析後要像 unicourse `parseAndValidateQuestions`（第 45–49 行）那樣 `reduce` 成 `{ A: "...", B: "..." }` 物件，才符合本專案 `ExamQuestion.options` 型別。
> 2. **`points` 不在 schema 內**，由 difficulty 換算後補上：`basic=4、medium=5、advanced=8`（unicourse `constants.ts` 的 `POINTS_BASIC/MEDIUM/ADVANCED`）。`id` 也是解析後自己補（如 `gen-q-<index>`）。

```ts
// 新增：AI 出題（紙本考卷）
async function generateExamWithGemini(opts: {
  course: string; topics: string; count: number;
  questionTypes?: string[];            // ["multiple-choice","true-false","fill-in-the-blank"]
  contentFocus?: string;               // 可選：偏重的內容
}) {
  const ai = getGeminiAI();
  const result = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: `Generate exactly ${opts.count} exam questions in Traditional Chinese for the course "${opts.course}", `
      + `covering topics "${opts.topics}". Allowed types: ${(opts.questionTypes || ["multiple-choice","true-false","fill-in-the-blank"]).join(", ")}. `
      + (opts.contentFocus ? `Focus: ${opts.contentFocus}. ` : "")
      + `For multiple-choice include an options object with keys A-D. Return JSON array.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: { /* 抄 unicourse llmService 第 148–181 行：type/question/options/correctAnswer/difficulty */ },
    },
  });
  // 解析後：options 由 {key,value}[] reduce 成物件；補 id；points 依 difficulty（basic=4, medium=5, advanced=8）
  return JSON.parse(result.text || "[]");
}
```

新端點：

| 端點 | 方法 | Body | 回傳 |
|---|---|---|---|
| `/api/exam/generate` | POST | `{ course, topics, count, questionTypes?, contentFocus? }` | `{ questions: ExamQuestion[] }` |
| `/api/exam/export`（可選，見模組 A） | POST | `{ paper: ExamPaper, mode: "student" \| "answer" }` | `.docx` 二進位或寫入 `exports/` 後回傳路徑 |

---

## 6. 前端變更（共用）

### 6.1 新增分頁

`src/App.tsx`：
1. 擴充 union：`... | "roster" | "transcripts" | "classroom" | "exam"`。
2. 頂部 import 新元件（見 6.2）。
3. 側邊欄與手機版 nav 各加 4 個 `<button>`（lucide 圖示建議：`Users`(roster)、`GraduationCap`(transcripts，注意已被 logo 用，改 `Award` 或 `LineChart`)、`Grid3x3`(classroom)、`FileText`(exam)）。
4. 內容區依 `activeTab` 渲染對應元件，並把需要的 `dbState` 切片與存檔 callback 當 props 傳入。

### 6.2 新增元件（`src/components/`）

| 檔案 | 模組 | 由哪些 unicourse 元件移植 |
|---|---|---|
| `RosterManager.tsx` | B | `HomeroomStudentManagementEnhanced` + `HomeroomStudentProfile` + `StudentInfoManagement` |
| `ClassOfficers.tsx` | B | `ClassOfficersManagement` |
| `Transcripts.tsx` | C | `GradeManagement` + `GradeStatistics` + `StudentGradeView` + `SemesterManagement` |
| `ClassroomTools.tsx` | D | `SeatingChart` + `RollCallPicker` + `LotteryPicker` + `ClassroomTools` |
| `ExamGenerator.tsx` | A | 新建（呼叫 `/api/exam/generate`） |

### 6.3 移植改寫準則（重要）

unicourse 元件多半透過 `useQuiz()` context 或 `storageService` 取存資料。移植時：
- **移除** 對 `useQuiz` / `storageService` / `supabase` 的所有 import 與呼叫。
- 改成 **props 注入**：`dbState` 的對應切片（如 `roster`、`transcripts`）＋一個 `onChange/onSave` callback，沿用 eduGrade 既有 props 模式。
- 任何「學生自助/登入/權限」分支直接刪除（一律老師端視角）。
- 保留 UI/演算法邏輯（座位排列、抽籤、統計、畢業學分計算）。

---

## 7. 各模組驗收重點

**A 紙本考卷**：能依課程＋章節＋題型＋題數生成題目；可手動增刪改；可匯出「學生卷」與「教師答案卷」（MVP 可先用瀏覽器列印樣式 `window.print()`，docx 匯出列為加分）；生成的卷存入 `examPapers` 可重開重印；**且**說明文件提醒：考後掃描檔丟「AI 資料夾批次」即完成批改閉環。

**B 班級經營**：可新增/編輯/刪除 `roster` 學生（含家長欄位）；可用 Excel/CSV 匯入名單（沿用 eduGrade 既有 xlsx 解析）；可指派/查詢班級幹部；資料正確存入 `db.json` 並重開後仍在。

**C 跨學期成績**：可逐筆或批次（Excel/CSV）匯入歷年成績；顯示各學期/各科成績與及格（≥60）標記；顯示畢業進度（已修學分 vs 應修學分）；統計圖沿用 recharts（eduGrade 已有）。

**D 課堂工具**：座位表可編排並對應 `roster`；點名與抽籤可運作；純前端，不需後端。

---

## 8. 分階段任務（依序施工）

| 階段 | 內容 | 主要檔案 | 完成定義 |
|---|---|---|---|
| **P0** 基礎 | 開分支；改 `isValidDb`（4.2）；加型別（4.1）；`DEFAULT_DB` 不必動 | `server.ts`、`src/types.ts` | lint 通過；`POST /api/db` 帶新集合可成功存讀 |
| **P1** 課堂工具 D | 新分頁＋`ClassroomTools.tsx` | `App.tsx`、`components/ClassroomTools.tsx` | 座位/點名/抽籤可用（暖身、純前端） |
| **P2** 班級經營 B | `RosterManager.tsx`＋`ClassOfficers.tsx`＋匯入 | 同上＋`App.tsx` | 7.B 驗收全過；C/D 可讀到 roster |
| **P3** 跨學期成績 C | `Transcripts.tsx`＋匯入＋畢業進度 | 同上＋`App.tsx` | 7.C 驗收全過 |
| **P4** 紙本考卷 A | `/api/exam/generate`＋`ExamGenerator.tsx`＋匯出 | `server.ts`、`components/ExamGenerator.tsx`、`App.tsx` | 7.A 驗收全過 |
| **P5** 遷移與驗收 | Supabase→本機 JSON 腳本＋整體回歸 | `scripts/migrate-from-supabase.mjs` | 第 10 節遷移完成；全測試綠 |

> 相依：P0 為前置；B 是 C/D 的資料基礎，建議 P1→P2→P3；A 可與 B/C 並行。

---

## 9. 每階段驗收指令

```bash
npm run lint     # tsc --noEmit，型別不得有錯
npm test         # vitest，既有測試（grades/matching/parsing）不得退步
npm run dev      # 手動確認 6 個既有分頁 + 新分頁皆正常
```
另外手動檢查：改完資料後重啟，`db.json` 內新集合仍在；`backups/` 有新增備份；故意塞壞 `db.json` 一次，確認會從備份還原（不要在正式資料上做）。

---

## 10. 既有資料遷移（P5，趁 Supabase 未停用前）

新增 `scripts/migrate-from-supabase.mjs`：
1. 讀環境變數 `SUPABASE_URL`、`SUPABASE_ANON_KEY`（或請使用者從 Supabase dashboard 匯出各表 CSV 放到 `scripts/import/`）。
2. 抓四張表並對映：

| Supabase 表 | → db.json 集合 | 對映重點 |
|---|---|---|
| `students` | `roster`（個資）＋併入 `courses[].students`（分數） | 個資欄位進 roster，課程分數留 courses |
| `class_grades` | `transcripts` | `(student_id, year, semester, subject)` 為唯一鍵；`score`/`credits`/`grade_type` 照搬 |
| `class_officers` | `officers` | `(class_code, term, title)` 唯一 |
| `homeroom_classes` | `homeroomClasses` | 直接對應 |

3. **合併而非覆蓋**：讀現有 `db.json`，只新增上述集合，**不得動 `courses`**；寫入前先備份（沿用既有機制或先手動複製一份）。
4. `quiz_attempts / assignment_* / surveys / login_history / feedback_* / change_requests` **不遷移**。
5. Supabase Storage 內的作業/考卷舊檔：新流程不需要，預設放棄。

---

## 11. 約束與慣例（再次強調）

- 介面與 AI 輸出一律**繁體中文**。
- 不引入資料庫/雲端；資料只在 `db.json` + 檔案系統。
- 沿用 `writeDB` 的原子寫入＋備份；不要繞過它直接寫檔。
- `db.json`、`backups/`、`gmail_cache/`、`.env.local`、新增的 `exports/` 都要在 `.gitignore`（前四者已在，新增 `exports/`）。
- Gemini：用 `@google/genai`（v2）、模型字串 `gemini-3.5-flash`、`Type` 由 `@google/genai` 匯入。
- 個資（家長電話等）只存本機，提醒使用者定期把 `db.json` 複製到雲端硬碟/隨身碟備援。

---

## 12. 完成定義（Definition of Done）

- 4 個新分頁可用，A/B/C/D 七節驗收全過。
- 既有 6 分頁與既有測試零退步。
- `db.json` 含新集合、可正常備份還原。
- 遷移腳本能把 Supabase 四表轉進本機 JSON 而不動 courses。
- `npm run lint` / `npm test` 全綠。
