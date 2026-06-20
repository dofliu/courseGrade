/**
 * 一鍵啟動器：起動伺服器 → 等就緒 → 自動開預設瀏覽器。
 * 供 Start-EduGrade.vbs（雙擊、不開終端機）或 `npm run launch` 使用。
 * 設 NO_OPEN=1 可在測試時不要真的開瀏覽器。
 */
import { spawn } from "child_process";
import http from "http";

const PORT = process.env.PORT || 3000;
const url = `http://localhost:${PORT}`;

console.log(`[EduGrade] 啟動伺服器中... (${url})`);

// 起動 dev 伺服器（永遠反映最新程式碼，不必先 build）
const server = spawn("npm", ["run", "dev"], { stdio: "inherit", shell: true });
server.on("exit", (code) => {
  console.log(`[EduGrade] 伺服器已結束 (code ${code ?? 0})`);
  process.exit(code ?? 0);
});

let opened = false;
function openBrowser() {
  if (opened) return;
  opened = true;
  if (process.env.NO_OPEN) {
    console.log("[EduGrade] 伺服器就緒（NO_OPEN，略過開瀏覽器）。");
    return;
  }
  console.log(`[EduGrade] 伺服器就緒，開啟瀏覽器：${url}`);
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { shell: false, detached: true, stdio: "ignore" }).unref();
}

// 輪詢直到 /api/db 有回應再開瀏覽器（最多等約 60 秒）
let tries = 0;
function ping() {
  if (opened) return;
  http
    .get(`${url}/api/db`, (res) => {
      res.resume();
      openBrowser();
    })
    .on("error", () => {
      if (++tries > 75) {
        console.warn("[EduGrade] 等待逾時，仍未開瀏覽器；請手動開啟", url);
        return;
      }
      setTimeout(ping, 800);
    });
}
setTimeout(ping, 1500);

// 優雅關閉：關掉啟動器時一併結束伺服器
function shutdown() {
  try {
    server.kill();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
