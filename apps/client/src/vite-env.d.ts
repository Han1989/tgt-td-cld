/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server WebSocket URL, e.g. wss://tgt-td-server.onrender.com. Unset = local solo mode. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
