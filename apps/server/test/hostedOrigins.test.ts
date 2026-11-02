// The hosted build's origins (docs/DEPLOY.md "Hosted builds"): itch.io, Newgrounds and CrazyGames serve the zip from
// their own origins, and the game reaches this server from there. One `ALLOWED_ORIGINS` answers the WebSocket and every
// HTTP route (analytics, the Daily run, Endless's board); this test reads the exact line DEPLOY.md tells Han to add, and
// checks a real server with it lets those origins in on each and keeps lookalikes out.

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { parseAllowedOrigins } from '../src/origins';
import type { GameServer } from '../src/server';
import { startServer } from './helpers';

/** The fenced block after the marker in docs/DEPLOY.md. */
function documented(): string {
  const doc = readFileSync(new URL('../../../docs/DEPLOY.md', import.meta.url), 'utf8');
  const at = doc.indexOf('<!-- hosted-origins -->');
  expect(at, 'docs/DEPLOY.md has the hosted origins block').toBeGreaterThan(0);
  const block = /```[a-z]*\n([^`]+?)\n```/.exec(doc.slice(at));
  return block![1]!.trim();
}

const FRAMES = [
  'https://html.itch.zone',
  'https://html-classic.itch.zone',
  'https://itch.io',
  'https://han1989.itch.io',
  'https://uploads.ungrounded.net',
  'https://www.newgrounds.com',
  'https://newgrounds.com',
  'https://games.crazygames.com',
  'https://files.crazygames.com',
  'https://www.crazygames.com',
  'https://crazygames.com',
  'https://tower-defense-together.game-files.crazygames.com',
];

const LOOKALIKES = [
  'null',
  'http://html.itch.zone',
  'https://html.itch.zone.evil.example',
  'https://evilitch.zone',
  'https://a.b.itch.zone',
  'https://itch.io.evil.example',
  'https://uploads.ungrounded.net.evil.example',
  'https://evil-ungrounded.net',
  'https://crazygames.com.evil.example',
  'https://evilcrazygames.com',
];

describe('hosted origins', () => {
  const list = documented();

  it('the documented line is a plain comma-separated list, with no space, slash or path', () => {
    expect(list).toMatch(/^https:\/\/[^\s/,]+(,https:\/\/[^\s/,]+)*$/);
  });

  it.each(FRAMES)('lets %s in', (origin) => expect(parseAllowedOrigins(list)(origin)).toBe(true));
  it.each(LOOKALIKES)('keeps %s out', (origin) => expect(parseAllowedOrigins(list)(origin)).toBe(false));

  describe('on a real server, beside the site\'s own origins', () => {
    let server: GameServer | null = null;
    afterEach(async () => {
      await server?.close();
      server = null;
    });

    it('the WebSocket and every HTTP route answer a host\'s frame; a lookalike gets 403 everywhere', async () => {
      const s = await startServer({ allowedOriginsList: `https://tgt-td-cld.vercel.app,${list}`, analyticsDir: 'memory' });
      server = s.server;
      const socket = (origin: string) =>
        new Promise<number>((resolve) => {
          const ws = new WebSocket(s.url, { origin });
          ws.once('open', () => {
            ws.close();
            resolve(101);
          });
          ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
          ws.on('error', () => {});
        });
      for (const origin of ['https://html.itch.zone', 'https://evilitch.zone']) {
        const ok = origin === 'https://html.itch.zone';
        expect(await socket(origin), origin).toBe(ok ? 101 : 403);
        for (const route of ['/analytics/event', '/analytics/count', '/analytics/mine', '/daily/post', '/endless/post']) {
          const pre = await fetch(`${s.http}${route}`, { method: 'OPTIONS', headers: { origin } });
          expect(pre.status, `${origin} OPTIONS ${route}`).toBe(ok ? 204 : 403);
          if (ok) expect(pre.headers.get('access-control-allow-origin')).toBe(origin);
        }
        for (const route of ['/daily/today', '/endless/today']) {
          const get = await fetch(`${s.http}${route}`, { headers: { origin } });
          expect(get.status, `${origin} GET ${route}`).not.toBe(ok ? 403 : 200);
          if (ok) expect(get.headers.get('access-control-allow-origin')).toBe(origin);
        }
      }
    });
  });
});
