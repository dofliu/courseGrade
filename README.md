# EduGrade AI · 智慧評分助理

**繁體中文** ｜ [English](README.en.md)

整合 Gemini AI 與 Gmail 的大學課程評分系統。支援課程／配分管理、AI 批次評分（資料夾與 Gmail）、離線暫存、繳交追蹤、成績匯入匯出、依講義 AI 出題（可匯出 Word），以及課堂抽籤點名工具。全繁體中文介面。

> 本專案原於 Google AI Studio 開發，已改為獨立執行：移除 Firebase，改用 Google Identity Services (GIS) 取得 Gmail 授權。

---

## 技術架構

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS 4
- **後端**：Express（單一 `server.ts`，提供 REST API 並掛載 Vite middleware）
- **AI**：Google Gemini API（`gemini-3.5-flash`）
- **登入**：Google Identity Services（OAuth，僅 `gmail.readonly` + `userinfo.email`）
- **文件解析**：`mammoth`（Word .docx 擷取文字）、`xlsx`（名單／成績匯入）、內建 .ipynb 擷取
- **文件產出**：`docx`（出題匯出 Word 學生卷／答案卷）
- **儲存**：本機 `db.json`（課程與成績）＋ `gmail_cache/`（Gmail 離線暫存與附件）
- **測試**：Vitest（核心邏輯抽到 `src/lib/`，72 項單元測試）

---

## 本機執行

### 1. 安裝套件
```bash
npm install
```

### 2. 設定環境變數
複製 `.env.example` 為 `.env.local`，填入：

| 變數 | 用途 | 取得 |
|------|------|------|
| `GEMINI_API_KEY` | 後端 AI 評分／出題（機密，不外洩到瀏覽器） | https://aistudio.google.com/apikey |
| `VITE_GOOGLE_CLIENT_ID` | Gmail 收件登入（公開值） | Google Cloud Console（見下） |

> `server.ts` 會同時讀取 `.env.local` 與 `.env`；`GEMINI_API_KEY` 也可改設為系統環境變數。

### 3. 啟動
```bash
npm run dev      # http://localhost:3000
npm test         # 執行單元測試（Vitest）
npm run lint     # 型別檢查（tsc --noEmit）
```

### 一鍵啟動（免終端機）
安裝過套件（`npm install`）後，日後可直接：
- **雙擊 `Start-EduGrade.vbs`** → 背景啟動伺服器、就緒後自動開瀏覽器（不顯示終端機視窗）
- 或 **雙擊 `EduGrade.bat`** → 同上但保留小視窗可看 log；關閉視窗即停止
- **`Stop-EduGrade.bat`** → 停止伺服器（釋放 port 3000）
- 指令版：`npm run launch`

> 三者底層都是 `scripts/launch.mjs`：起動伺服器 → 等就緒 → 開 `http://localhost:3000`。

### 打包成桌面 App（Electron）
把整套（前端 + Express 後端）包成 Windows 桌面程式，不需終端機、不需 `npm run dev`：

```bash
npm run electron:start    # 先 build 再以桌面視窗開啟（內嵌伺服器，等同打包後的執行體驗）
npm run electron:build    # 產生 Windows 安裝檔（輸出在 release/）
```

- **資料位置**：`npm run electron:start`（未打包）直接用**專案目錄的 `db.json`**，沿用你現有的課程成績；只有**打包安裝後**才改用使用者資料夾 `%APPDATA%/EduGrade AI`（全新一份，可在 app 內匯入）。
- `GEMINI_API_KEY` 解析順序：環境變數 → `%APPDATA%/EduGrade AI/edugrade-config.json` 的 `geminiApiKey`。沒設也能開，只是 AI 評分／出題會在使用時提示缺 key。
- Electron 主行程在 `electron/main.cjs`：設好 `NODE_ENV/PORT/EDUGRADE_DATA_DIR/EDUGRADE_DIST_DIR` 後直接 `require` 既有的 `dist/server.cjs`（內嵌伺服器），輪詢 `/api/version` 就緒後再開視窗。

> 只用「資料夾批次 / 成績簿 / 繳交總覽 / 儀表板 / 出題 / 課堂工具」的話只需要 `GEMINI_API_KEY`；
> Gmail 收件功能才需要 `VITE_GOOGLE_CLIENT_ID`。

### Gmail OAuth 設定
1. [Google Cloud Console](https://console.cloud.google.com/) 選一個專案
2. 「API 與服務」→ 啟用 **Gmail API**
3. 「OAuth 同意畫面」→ 設定（測試階段把自己加入測試使用者）
4. 「憑證」→「建立 OAuth 用戶端 ID」→ 類型「網頁應用程式」
5. 「已授權的 JavaScript 來源」加入 `http://localhost:3000`
6. 複製 Client ID 填入 `.env.local` 的 `VITE_GOOGLE_CLIENT_ID`

---

## 功能總覽（八個分頁）

### 1. 總覽儀表板
KPI 卡片（修課人數、全班平均累計加權分、主項平均、主項繳交率）＋ 成績分佈圖 ＋ 未繳催繳信文字產生器。

### 2. 成績試算中心
- 試算表式成績表，**雙擊任一格**即可手動改分；展開列可編輯各項評語。
- **匯入成績**：貼上「學號 分數 評語」或上傳 Excel/CSV，一次寫入指定評分項目（自動標記為已繳交）。支援以學號或姓名比對。
- **整欄填同分**：一次把同一分數填給全班某項目（如全班平時 80 分，可只填未評分者）。
- **個人額外加減分**：看平時表現可正可負＋備註，反映到累計加權分、及格試算與 CSV。
- **批次匯出成績 (CSV)**：含各項分數、累計加權分與評語。

### 3. 繳交總覽
全班 × 全項目矩陣，每格顯示四種狀態：**已評分（分數）/ 已繳待評 / 未繳 / 未開放**，並有每欄繳交率統計。最右兩欄：
- **目前累計加權分**：見下方〈成績計算〉
- **期末及格需考**：期末考要考幾分才能讓累計加權分達及格門檻（預設 60）

### 4. 課堂工具
不需 AI、即開即用的教學小工具：
- **隨機抽籤**：從名單抽人，可避免短期重複。
- **點名輪播**：依序／隨機點名，記錄點到次數。
- **座位表**：自動排座位，方便分組與點名。

### 5. AI 出題
- 選課程、題數、題型（選擇／是非／填空）與出題模式（嚴格只用講義／延伸）。
- **上傳講義（可多份）**：PDF／Word／Jupyter／圖片／txt，AI 依你的教材範圍出題。
- 題目可手動增刪改、調難度與配分。
- **列印學生卷／答案卷**（瀏覽器列印對話框可另存 PDF）。
- **匯出 Word .docx**（學生卷／答案卷）：產生真正的 OOXML，可在 Word 直接編輯；答案卷以紅字標正解。

### 6. AI 資料夾批次
選課程＋評分項目，上傳整個資料夾（PDF／圖片／文字／.docx／.ipynb），Gemini 逐一辨識學生並評分，可手動校正後一鍵寫入成績；辨識配對到的學生自動標記為已繳。
- **略過已評分的學生**（預設開啟）：批次前先用檔名（學號／姓名）比對名單，若該生在此評分項目已有分數則不再呼叫 AI，省時間與額度；要重評時取消勾選即可。
- **上層資料夾配對**：當檔名看不出是誰（如 `submission.txt`），用上層資料夾名（`學號_姓名`）補學籍配對。

### 7. Gmail 雲端收件（離線工作流）
> **「讀取 Gmail」＝一次把整批信件＋所有附件下載到本機**，之後複查、AI 評分、下次開啟都讀本機，**不必再連 Gmail**（只有要抓新信才需重新登入）。

- **信件匣選擇**：登入後列出 Gmail 標籤，挑學生作業所在的資料夾，縮小掃描範圍。
- **多訊號學籍配對**：依「寄件信箱 → 學號 → 姓名」交叉比對（從主旨／寄件者／內文／附件檔名擷取），徽章標示配對依據。
- **離線 AI 評分**：用本機附件評分，免 token；結果即時回寫暫存。
- **檔案格式**：PDF／圖片直接送 Gemini；**Word .docx／.ipynb 自動擷取文字後評分**；一封多附件一起評；`.xlsx`／`.doc`／壓縮檔等標「格式不支援」並於批次中略過。
- **自動登記繳交**：配對到的學生立即標記「已繳待評」。
- **同步至成績表**：把 AI 分數與評語寫入正式成績（建議先檢查／校正再同步）。

### 8. 課程與配分管理
課程 CRUD、評分項目與加權比、學生名單（手動／文字／Excel 匯入）。每個評分項目可填 **AI 評分標準（rubric）**，評分時一併送給 Gemini 作為依據。

---

## 成績計算

**目前累計加權分** ＝ 各「已評分」項目的 `分數 × 權重 ÷ 100` 加總；未評分／未繳項目以 0 計，**不做正規化**。

> 例：作業1(70,6%)＋期中(30,30%)＋作業2(70,6%)＋小考(70,8%)＋平時(80,10%)
> ＝ 4.2 + 9 + 4.2 + 5.6 + 8 ＝ **31 分**

學期末所有項目評分完、權重總和達 100% 時，此值即為最終成績（含加分題可超過 100）。

**期末及格需考** ＝ `(及格門檻 − 期末以外已得加權分) ÷ 期末權重`，無條件進位。
> 例：已得 31，門檻 60，期末佔 40% → (60−31)/0.4 ＝ 72.5 → **需 73 分**。
> 若已及格顯示「已穩過」；期末已考顯示「期末已考」；期末滿分仍不足顯示「滿分仍不及格」。

---

## 後端 API

| 端點 | 用途 |
|------|------|
| `GET/POST /api/db` | 讀取／儲存課程與成績（`db.json`） |
| `GET /api/version` | 版本與伺服器啟動時間（前端頁尾顯示） |
| `POST /api/analyze-file` | 單一檔案 AI 評分（資料夾批次用，可帶 rubric） |
| `POST /api/exam/generate` | 依講義／章節範圍 AI 出題 |
| `POST /api/gmail/labels` | 列出 Gmail 標籤（信件匣） |
| `POST /api/gmail/pull` | 掃描 Gmail 並下載整批信件＋附件到本機，存 manifest |
| `GET/POST /api/gmail/cache` | 讀取／儲存本機暫存 manifest（免 token） |
| `POST /api/gmail/analyze-cached` | 用本機附件 AI 評分（免 token，支援 .docx／.ipynb 文字擷取） |
| `POST /api/gmail/scan`、`/api/gmail/analyze-attachment` | 舊版即時端點（保留，前端已改用離線流程） |

---

## 專案結構

```
courseGrade/
├── server.ts              # Express 後端（REST API + Vite middleware）
├── src/
│   ├── App.tsx            # 八個分頁的主框架
│   ├── components/        # 各功能頁元件（成績簿、繳交總覽、出題、課堂工具…）
│   ├── lib/               # 純邏輯 + 單元測試（grades/matching/parsing/notebook/exam/db/examDocx）
│   └── types.ts           # 共用型別
├── scripts/launch.mjs     # 一鍵啟動器
├── STATUS.yaml            # 專案 metadata（研究儀表板用）
└── db.json                # 本機成績資料庫（gitignore，含個資）
```

---

## 資料儲存與隱私

- `db.json`：課程、學生、成績（含個資）— 已 gitignore。
- `gmail_cache/`：Gmail 信件 manifest 與下載的附件 — 已 gitignore。
- `backups/`：`db.json` 的自動備份 — 已 gitignore。
- `_sample_docx/`：出題 .docx 匯出樣本 — 已 gitignore。
- `.env.local`：金鑰 — 已 gitignore。

> 以上皆**只存在本機**，不會進 git，也不會上傳到外部服務。

### 成績資料安全機制
為避免弄丟成績，`db.json` 的存取做了多層保護：
- **原子寫入**：先寫 `db.json.tmp` 再 rename 取代，避免寫到一半當機造成檔案毀損。
- **自動備份**：每次存檔前先備份舊版到 `backups/`（節流：同份至少間隔 3 分鐘；保留最近 50 份）。
- **毀損保護**：若 `db.json` 讀取時解析失敗，**絕不覆蓋原檔**，改從最新合法備份自動還原。
- **防呆驗證**：拒絕寫入結構不合法或「空白課程覆蓋現有課程」的資料。
- **前端警示**：儲存失敗時畫面跳紅色提示，避免「以為存到了其實沒存」。
- **後端防護**：全域錯誤處理，單一壞請求不會讓 server 崩潰（避免 Failed to fetch）。

---

## 已知限制 / 後續方向

見 [TODO.md](TODO.md)。
