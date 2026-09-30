// Entry point: `node dist/index.cjs` (production) or `npm run dev:server`.

import { configFromEnv } from './config';
import { createGameServer } from './server';

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

function main(): void {
  let config;
  try {
    config = configFromEnv(process.env);
  } catch (err) {
    console.error(`Invalid configuration: ${(err as Error).message}`);
    process.exit(1);
  }
  const server = createGameServer(config, log);
  server.listen(config.port).then(
    (port) => {
      const analytics = server.analytics;
      const dash = analytics.dashboard ? 'dashboard on at /analytics' : 'dashboard off until ANALYTICS_DASHBOARD_KEY is set';
      const store = analytics.durable
        ? `file ${analytics.dir} (kept across deploys when that path is a disk)`
        : analytics.persistent
          ? `temp file ${analytics.dir} (lost on deploy — set ANALYTICS_DIR to a Render Disk to keep it)`
          : `memory only, lost when this process stops${analytics.diskError ? ` (${analytics.diskError})` : ''}`;
      log(`Listening on :${port} (shard ${config.shard}; allowed origins: ${config.allowedOriginsList})`);
      log(`Analytics: ${store}; ${dash}`);
    },
    (err: unknown) => {
      console.error('Failed to start:', err);
      process.exit(1);
    },
  );

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      log(`${signal} again: exiting immediately`);
      process.exit(1);
    }
    shuttingDown = true;
    log(`${signal} received: telling clients the server is restarting`);
    server.drain(log).then(() => {
      log('Shutdown complete');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
