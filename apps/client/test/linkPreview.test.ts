import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHANNELS, channelFromSearch } from '../src/analytics/channel';
import { PREVIEW_FILES, swSource } from '../src/platform/swSource';

const read = (path: string) => readFileSync(new URL(path, import.meta.url));
const html = read('../index.html').toString('utf8');
const head = html.slice(0, html.indexOf('</head>'));

/** `<meta>` contents by `property` or `name`, from the static page (what a link crawler sees). */
function metaTags(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [, attrs] of source.matchAll(/<meta\s([^>]*?)\/?>/g)) {
    const a = Object.fromEntries([...attrs!.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
    const key = a.property ?? a.name;
    if (key && a.content !== undefined) out.set(key, [...(out.get(key) ?? []), a.content]);
  }
  return out;
}

const meta = metaTags(head);
const one = (key: string) => {
  const values = meta.get(key) ?? [];
  expect(values, key).toHaveLength(1);
  return values[0]!;
};

/** The game's one-line pitch: README.md, line 3. */
const PITCH = read('../../../README.md').toString('utf8').split('\n')[2]!;
const SITE = 'https://tgt-td-cld.vercel.app/';

describe('link preview tags (index.html)', () => {
  it('describe the game with the README pitch, word for word', () => {
    expect(PITCH).toBe(
      'A browser co-op tower defense for 1–3 players (one per lane): build towers, control a hero and hold the Heart against waves of creeps.',
    );
    for (const key of ['description', 'og:description', 'twitter:description']) expect(one(key), key).toBe(PITCH);
    for (const key of ['og:title', 'twitter:title', 'og:site_name']) expect(one(key), key).toBe('Tower Defense Together');
    expect(head).toContain('<title>Tower Defense Together</title>');
  });

  it('point at the production site, with a canonical link', () => {
    const canonical = [...head.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"/g)].map((m) => m[1]);
    expect(canonical).toEqual([SITE]);
    expect(one('og:url')).toBe(SITE);
    expect(one('og:type')).toBe('website');
  });

  it('show a large 1200 × 630 PNG card from an absolute https URL, with alt text', () => {
    const image = one('og:image');
    expect(image).toBe(new URL('/og-card.png', SITE).href);
    expect(new URL(image).protocol).toBe('https:');
    expect(one('twitter:image')).toBe(image);
    expect(one('twitter:card')).toBe('summary_large_image');
    expect(one('og:image:type')).toBe('image/png');
    expect(one('og:image:width')).toBe('1200');
    expect(one('og:image:height')).toBe('630');
    const alt = one('og:image:alt');
    expect(alt.length).toBeGreaterThan(20);
    expect(one('twitter:image:alt')).toBe(alt);
  });

  it('come before the page body, so crawlers that read only the start of the page see them', () => {
    expect(html.indexOf('og:image"')).toBeLessThan(html.indexOf('<body'));
  });
});

describe('the card image (public/og-card.png)', () => {
  const png = read('../public/og-card.png');

  it('is a 1200 × 630 PNG small enough for link previews', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: 1200, height: 630 });
    expect(png.length).toBeLessThan(300 * 1024);
  });

  it('is not precached by the service worker (only link crawlers fetch it)', () => {
    expect(PREVIEW_FILES).toEqual(['/og-card.png']);
    const source = swSource('v1', ['/index.html', '/assets/a.js', '/og-card.png', '/icons/icon-192.png']);
    expect(source).toContain('const SHELL = ["/index.html","/assets/a.js","/icons/icon-192.png"];');
  });
});

describe('tagged links (docs/ANALYTICS.md)', () => {
  const doc = read('../../../docs/ANALYTICS.md').toString('utf8');
  const tagged = [...doc.matchAll(/`https:\/\/<vercel-app>\/(\?src=[\w-]+)`/g)].map((m) => m[1]!);

  it('get the same static page, so the same card, and still record their channel from ?src=', () => {
    expect(tagged).toEqual(['?src=reddit-playmygame', '?src=reddit-incremental', '?src=reddit-cozy', '?src=crazygames']);
    for (const search of tagged) {
      const src = new URLSearchParams(search).get('src')!;
      expect(CHANNELS).toContain(src);
      expect(channelFromSearch(search, '', null)).toEqual({ channel: src, save: true, clear: false });
      // The canonical link is a tag only: the page's own URL (and so its query) is left alone.
      expect(channelFromSearch(new URL(search, SITE).search, 'https://www.reddit.com/', null).channel).toBe(src);
    }
    expect(html).not.toMatch(/history\.replaceState|location\.replace/);
  });
});
