/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL for production builds; unset in dev (Vite proxies /api). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
