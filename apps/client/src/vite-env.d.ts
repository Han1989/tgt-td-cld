/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server WebSocket URL, e.g. wss://tgt-td-server.onrender.com. Unset = local solo mode. */
  readonly VITE_SERVER_URL?: string;
}

/** The client's build (Vercel's git commit, or 'dev'), set by vite.config.ts. */
declare const __BUILD__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
