/**
 * Google Identity Services (GIS) OAuth token client。
 *
 * 為什麼不用 Firebase：這個專案唯一需要的是「一個 Gmail 唯讀的 access token」，
 * 用 GIS 直接索取比拉進整套 Firebase SDK 更輕、依賴更少、也不需要 Firebase 專案設定。
 *
 * 登入持久化：token 會連同到期時間存進 sessionStorage，切換分頁、重新整理都能自動還原，
 * 直到 token 過期（GIS 約 1 小時）或關閉分頁。避免每次切 tab 都要重新點 Google 登入。
 */

// Vite 只會把 VITE_ 開頭的變數注入到瀏覽器端。Client ID 是公開值（必然出現在前端），
// 但仍以環境變數管理，避免像舊的 firebase config 那樣寫死在 commit 進 git 的檔案裡。
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// gmail.readonly 用於讀信；userinfo.email 僅用來顯示「目前登入的是哪個帳號」。
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const GIS_SRC = "https://accounts.google.com/gsi/client";
const STORAGE_KEY = "edugrade_gmail_auth";

let cachedAccessToken: string | null = null;
let tokenClient: any = null;
let gisLoadPromise: Promise<void> | null = null;

interface StoredAuth {
  accessToken: string;
  email: string | null;
  expiresAt: number; // epoch ms
}

// --- sessionStorage 持久化 ---
function saveSession(s: StoredAuth) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 隱私模式等情境寫入失敗時，至少記憶體快取仍可用 */
  }
  cachedAccessToken = s.accessToken;
}

function loadSession(): StoredAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredAuth;
    // 過期（或快過期）就視為無效，逼使用者重新授權
    if (!s.accessToken || Date.now() >= s.expiresAt) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  cachedAccessToken = null;
}

// 動態載入 GIS script（只載一次）。沒用到 Gmail 功能的使用者完全不會載到 Google 的腳本。
function loadGisScript(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google 登入元件 (GIS) 載入失敗，請檢查網路連線。"));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

async function ensureTokenClient(): Promise<any> {
  if (!CLIENT_ID) {
    throw new Error(
      "尚未設定 VITE_GOOGLE_CLIENT_ID。請於 .env.local 填入 Google OAuth Client ID 後重新啟動。"
    );
  }
  await loadGisScript();
  const google = (window as any).google;
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // 真正的 callback 在每次 requestAccessToken 前覆寫
    });
  }
  return tokenClient;
}

export interface GoogleSignInResult {
  accessToken: string;
  email: string | null;
}

// 必須由按鈕點擊等使用者互動觸發（會彈出 Google 授權視窗）。
export const googleSignIn = async (): Promise<GoogleSignInResult> => {
  const client = await ensureTokenClient();
  const hadSession = !!loadSession();

  const resp = await new Promise<any>((resolve, reject) => {
    client.callback = (r: any) => {
      if (r.error) {
        reject(new Error(r.error_description || r.error));
        return;
      }
      resolve(r);
    };
    // 已授權過就不再跳同意視窗；首次強制顯示 consent 讓使用者看清楚授權範圍。
    client.requestAccessToken({ prompt: hadSession ? "" : "consent" });
  });

  const accessToken = resp.access_token as string;
  const expiresInSec = Number(resp.expires_in) || 3600;
  const email = await fetchUserEmail(accessToken);

  // 提前 60 秒視為過期，避免拿著快過期的 token 去打 API
  saveSession({ accessToken, email, expiresAt: Date.now() + (expiresInSec - 60) * 1000 });
  return { accessToken, email };
};

// 用 token 反查登入帳號的 email，純粹給 UI 顯示用。
async function fetchUserEmail(token: string): Promise<string | null> {
  try {
    const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.email || null;
  } catch {
    return null;
  }
}

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const s = loadSession();
  if (s) {
    cachedAccessToken = s.accessToken;
    return s.accessToken;
  }
  return null;
};

// 還原已儲存的登入資訊（token + email），給元件重新掛載時用，不會觸發任何網路請求。
export const getStoredAuth = (): { accessToken: string; email: string | null } | null => {
  const s = loadSession();
  return s ? { accessToken: s.accessToken, email: s.email } : null;
};

export const logout = async (): Promise<void> => {
  const google = (window as any).google;
  if (cachedAccessToken && google?.accounts?.oauth2) {
    // 主動撤銷 token，而不只是丟掉本地參考。
    google.accounts.oauth2.revoke(cachedAccessToken, () => {});
  }
  clearSession();
};
