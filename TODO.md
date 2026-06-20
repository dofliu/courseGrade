# EduGrade AI · 進度與待辦

最後更新：2026-06-20

## ✅ 已完成

### 基礎架構
- [x] 從 Google AI Studio 移出、可獨立執行
- [x] 移除 Firebase，改用 Google Identity Services (GIS) 取得 Gmail 授權
- [x] 移除寫死的金鑰，改用 `.env.local`（`GEMINI_API_KEY` / `VITE_GOOGLE_CLIENT_ID`）
- [x] `server.ts` 同時讀取 `.env.local` 與 `.env`
- [x] 修正失效的 Tailwind 色階；`db.json`、`gmail_cache/` 加入 gitignore

### Gmail 登入與收件
- [x] 登入持久化（sessionStorage，切 tab／重整不必重登）
- [x] 信件匣（Gmail 標籤）選擇器，縮小掃描範圍
- [x] 多訊號學籍配對：寄件信箱 → 學號 → 姓名（主旨／寄件者／內文／附件檔名）
- [x] 離線暫存：`pull` 一次下載整批信件＋附件到本機磁碟
- [x] 離線 AI 評分（`analyze-cached`，免 token），結果回寫暫存
- [x] 自動登記「已繳待評」（信箱／AI 配對成功時）

### 評分與檔案
- [x] 每個評分項目可設定 AI 評分標準（rubric），評分時送入 prompt
- [x] Word `.docx` 自動擷取文字後評分（mammoth）
- [x] 不支援格式（.xlsx/.doc/壓縮檔）優雅略過，批次不再噴錯、不重試
- [x] 修正批次評分狀態互相覆蓋的 bug（改用 messagesRef）
- [x] 修正附件下載檔名過長導致 Windows 路徑超限（改用 SHA-1 短雜湊）

### 成績與檢視
- [x] 繳交總覽獨立頁（學生×項目矩陣、四狀態、繳交率統計）
- [x] 成績計算改為「目前累計加權分」（實得加權分，不正規化）
- [x] 繳交總覽新增「期末及格需考」欄位
- [x] 成績匯入（貼上／Excel）寫入指定評分項目
- [x] 雙擊單格手動改分、展開編輯評語、CSV 匯出
- [x] 資料夾批次：依檔名比對名單，已評分的學生自動略過（可關閉）
- [x] 支援 .ipynb（Jupyter）與 .docx：擷取文字後評分（資料夾批次與 Gmail 兩條都通）
- [x] 資料夾批次以上層資料夾（學號_姓名）補學籍配對
- [x] 整欄填同分：一次把同一分數填給全班某項目（如全班平時 80 分，可只填未評分者）
- [x] 個人額外加減分欄位（看平時表現，可正可負＋備註），反映到累計加權分與及格試算、CSV

### 穩定性 / 資料安全
- [x] `db.json` 原子寫入（temp + rename），避免寫一半毀損
- [x] 自動備份到 `backups/`（節流 + 保留最近 50 份）
- [x] 毀損保護：讀取解析失敗時不覆蓋原檔、改從備份還原
- [x] 防呆驗證：拒絕不合法／空白覆蓋現有課程的寫入
- [x] 前端儲存失敗顯示紅色警示
- [x] 後端全域錯誤處理（unhandledRejection / uncaughtException / express error）

### 測試
- [x] 成績計算抽出到 `src/lib/grades.ts`（去除三元件重複），導入 Vitest
- [x] 成績計算單元測試（累計加權分、期末及格需考、邊界）— `npm test`，13 項通過

### 測試（續）
- [x] 配對邏輯抽到 `src/lib/matching.ts`（前後端共用）+ 單元測試
- [x] 分數匯入解析抽到 `src/lib/parsing.ts` + 單元測試（合計 39 項測試）
- [x] `.ipynb` 擷取 / 出題解析 / `isValidDb`＋備份還原抽到 `src/lib/`（notebook/exam/db）+ 單元測試（含毀損還原 e2e）
- [x] 出題 docx 產生器抽到 `src/lib/examDocx.ts` + 煙霧測試（合計 72 項測試）

### 整合（UniCourse 模組）
- [x] 課堂工具分頁：隨機抽籤 / 點名輪播 / 座位表（移植自 unicourse，免 AI）
- [x] AI 出題分頁：選課程／題數／題型／模式，可手動增刪改題
- [x] 出題支援上傳講義（可多份 PDF/Word/Notebook/圖片/txt），AI 依教材範圍出題
- [x] 出題匯出 Word .docx（學生卷／答案卷，真正 OOXML、答案卷紅字標正解）
- [x] 出題列印學生卷／答案卷（瀏覽器列印可另存 PDF）、考卷可儲存重用

### Gmail（續）
- [x] 一封多附件：整封信的所有附件一起評（多頁掃描＝同一份），個別不支援格式略過不中斷
- [x] server PORT 改為可由環境變數設定（為打包鋪路）

### 一鍵啟動
- [x] `scripts/launch.mjs` + `Start-EduGrade.vbs`（隱藏視窗雙擊啟動）/ `EduGrade.bat` / `Stop-EduGrade.bat`
- [x] 起動伺服器→等就緒→自動開瀏覽器；`npm run launch`

## ⏳ 待辦 / 下一步

> GitHub Issues #1–#5 已處理完畢（#2/#3/#4 已實作關閉、#1 Electron 已完成、#5 暫緩關閉）。

### ✅ 本波完成（Issues）
- [x] **打包桌面 App（Electron）**（#1）— `electron/main.cjs` 內嵌 Express 伺服器、`npm run electron:start`／`electron:build`
- [x] **後端 API 端點整合測試**（#2）— supertest 13 項，server 以 `EDUGRADE_DATA_DIR/EDUGRADE_NO_LISTEN` 可測試化
- [x] **及格門檻課程層級可設定 + 評分標準範本庫**（#3）
- [x] **批次評分進度條／可中止**（#4）— 資料夾批次與 Gmail 離線兩處

### ✅ 後續波（已完成）
- [x] **桌面版設定 UI**：app 內填 `GEMINI_API_KEY`（env 優先、其次本機 config.json、即時生效），課程設定頁 ApiKeySettings 卡
- [x] **出題增強**：難度分布控制（各難度題數）＋自動平衡總分（balancePointsTo，餘數精準修正）

### 後續可做
- [ ] **整合 C：跨學期成績**（transcripts）— 暫緩（#5 決議）
- [ ] **整合 B：班級經營**（homeroom / officers）— 暫緩（#5 決議）
- [ ] **桌面版自動更新**（electron-updater）
- [ ] **出題增強（續）**：圖片題、題組
- [ ] **舊版 `.doc`／`.xlsx`**：目前略過，評估是否支援（.doc 需額外轉換）
- [ ] **成績匯入支援姓名欄**：目前以「學號 分數」為主，姓名比對為備援
- [ ] **加分題上限處理**：含加分權重時累計分可超過 100，視需要顯示提示

## ⚠️ 已知限制

- Gmail access token 約 1 小時過期、關閉分頁後需重新登入（OAuth 本質；要免登入需 server 端 refresh token，暫不導入）
- AI 評分需人工複查；配對與分數可能有誤，務必在「同步至成績表」前確認
- `.docx` 若為純圖片（無文字）會擷取不到內容 → 標為不支援
