/// <reference types="vite/client" />

// 自訂的前端環境變數型別宣告（Vite 只暴露 VITE_ 開頭者到瀏覽器端）。
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
