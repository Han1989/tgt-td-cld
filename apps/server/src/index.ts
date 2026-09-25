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
  const server = createGameServer(config);
  server.listen(config.port).then(
    (port) => log(`Listening on :${port} (shard ${config.shard}; allowed origins: ${config.allowedOriginsList})`),
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
