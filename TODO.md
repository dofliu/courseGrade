# EduGrade AI · 進度與待辦

最後更新：2026-06-18

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

### Gmail（續）
- [x] 一封多附件：整封信的所有附件一起評（多頁掃描＝同一份），個別不支援格式略過不中斷
- [x] server PORT 改為可由環境變數設定（為打包鋪路）

### 一鍵啟動
- [x] `scripts/launch.mjs` + `Start-EduGrade.vbs`（隱藏視窗雙擊啟動）/ `EduGrade.bat` / `Stop-EduGrade.bat`
- [x] 起動伺服器→等就緒→自動開瀏覽器；`npm run launch`

## ⏳ 待辦 / 下一步

- [ ] 真正打包成單一桌面 App（Tauri/Electron）— 目前以啟動器達成「雙擊啟動、免終端機」
- [ ] API 端點測試（cache 來回、analyze-cached guard）
- [ ] 及格門檻課程層級可設定、評分標準範本庫
- [ ] **及格門檻可設定**：目前固定 60，待做成課程層級可調
- [ ] **評分標準範本庫**：常用 rubric 可儲存重用
- [ ] **舊版 `.doc`／`.xlsx`**：目前略過，評估是否支援（.doc 需額外轉換）
- [ ] **批次評分進度條／可中止**：大量信件時的進度顯示與取消
- [ ] **成績匯入支援姓名欄**：目前以「學號 分數」為主，姓名比對為備援
- [ ] **加分題上限處理**：含加分權重時累計分可超過 100，視需要顯示提示

## ⚠️ 已知限制

- Gmail access token 約 1 小時過期、關閉分頁後需重新登入（OAuth 本質；要免登入需 server 端 refresh token，暫不導入）
- AI 評分需人工複查；配對與分數可能有誤，務必在「同步至成績表」前確認
- `.docx` 若為純圖片（無文字）會擷取不到內容 → 標為不支援
