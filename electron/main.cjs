// EduGrade AI — Electron 主行程
// 策略：在主行程內直接啟動既有 Express 伺服器（dist/server.cjs），
// 等 /api/version 就緒後再開視窗載入 http://localhost:<PORT>。
// 不用 spawn 子行程，避免 asar 內檔案無法直接執行的問題。
const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PORT = Number(process.env.EDUGRADE_PORT) || 3100;
const BASE_URL = `http://localhost:${PORT}`;

let mainWindow = null;

// 讀取 Gemini API Key：環境變數 > userData/edugrade-config.json
function resolveGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const cfgPath = path.join(app.getPath("userData"), "edugrade-config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      if (cfg.geminiApiKey) return String(cfg.geminiApiKey);
    }
  } catch {
    /* 設定檔毀損就忽略，AI 功能會在使用時友善報錯 */
  }
  return "";
}

// app 根目錄（dev 為專案根；打包後為 resources/app[.asar]）
function appRoot() {
  // __dirname = <root>/electron；上一層即 root
  return path.join(__dirname, "..");
}

// 啟動內嵌 Express 伺服器（require 既有 bundle，會自動 app.listen）
function startEmbeddedServer() {
  const root = appRoot();
  process.env.NODE_ENV = "production";
  process.env.PORT = String(PORT);
  process.env.EDUGRADE_DIST_DIR = path.join(root, "dist");
  // 成績/暫存/備份都寫到使用者資料夾，打包後仍可讀寫
  process.env.EDUGRADE_DATA_DIR = app.getPath("userData");
  const key = resolveGeminiKey();
  if (key) process.env.GEMINI_API_KEY = key;

  const serverPath = path.join(root, "dist", "server.cjs");
  if (!fs.existsSync(serverPath)) {
    dialog.showErrorBox("缺少伺服器檔案", `找不到 ${serverPath}\n請先執行 npm run build。`);
    app.quit();
    return;
  }
  require(serverPath); // 載入即啟動（startServer → app.listen）
}

// 輪詢 /api/version 直到伺服器就緒（最多 ~20 秒）
function waitForServer(timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BASE_URL}/api/version`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1500, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error("伺服器啟動逾時"));
      setTimeout(tick, 300);
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "EduGrade AI 智慧評分助理",
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 外部連結（如 Google 登入）用系統瀏覽器開，不在 app 內導頁
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(process.env.ELECTRON_START_URL || BASE_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // ELECTRON_START_URL 指定時（dev：先跑 npm run dev）直接連那個位址，不內嵌伺服器
  if (!process.env.ELECTRON_START_URL) {
    startEmbeddedServer();
    try {
      await waitForServer();
    } catch (e) {
      dialog.showErrorBox("啟動失敗", String(e && e.message ? e.message : e));
      app.quit();
      return;
    }
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // 桌面 App 行為：關掉視窗就結束（含內嵌伺服器，隨主行程一起退出）
  app.quit();
});
