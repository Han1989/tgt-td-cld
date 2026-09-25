import { HERO_KINDS } from '@tdt/protocol';
import { defaultConfig, type ServerConfig } from '../src/config';
import { createGameServer, type GameServer } from '../src/server';
import { BotClient, type BotClientOptions } from '../src/testing/botClient';

export const ORIGIN = 'http://localhost:5173';

export async function startServer(overrides: Partial<ServerConfig> = {}): Promise<{ server: GameServer; url: string; http: string }> {
  const server = createGameServer(defaultConfig({ allowedOriginsList: ORIGIN, ...overrides }));
  const port = await server.listen(0);
  return { server, url: `ws://127.0.0.1:${port}`, http: `http://127.0.0.1:${port}` };
}

export function bot(url: string, name: string, extra: Partial<BotClientOptions> = {}): BotClient {
  return new BotClient({ url, origin: ORIGIN, name, ...extra });
}

/** Creates a room with `n` bots (the first is host), all ready. Bots cycle through the heroes unless `extra.hero` is set. */
export async function fullRoom(url: string, n: number, extra: Partial<BotClientOptions> = {}): Promise<BotClient[]> {
  const host = bot(url, 'Host', { index: 0, hero: HERO_KINDS[0], ...extra });
  const code = await host.create();
  const clients = [host];
  for (let i = 1; i < n; i++) {
    const c = bot(url, `Bot ${i + 1}`, { index: i, hero: HERO_KINDS[i % HERO_KINDS.length], ...extra });
    await c.join(code);
    c.send({ t: 'ready', ready: true });
    clients.push(c);
  }
  await host.waitFor(() => host.lobby?.players.length === n && host.lobby.players.every((p) => p.ready));
  return clients;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
