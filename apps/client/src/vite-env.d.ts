/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server WebSocket URL, e.g. wss://tgt-td-server.onrender.com. Unset = local solo mode. */
  readonly VITE_SERVER_URL?: string;
}

/** The client's build (Vercel's git commit, or 'dev'), set by vite.config.ts. */
declare const __BUILD__: string;

/**
 * A hosted build's settings (`npm run build:embed`, platform/embedHost.ts; docs/DEPLOY.md "Hosted builds"), or null in
 * the site's own build, where every `if (__EMBED__)` folds away. Set by vite.config.ts.
 */
declare const __EMBED__: import('./platform/embedHost').EmbedConfig | null;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
