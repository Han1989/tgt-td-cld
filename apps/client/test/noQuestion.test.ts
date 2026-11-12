// q3: no age question before the first match in hosted builds, and the anonymous counts that need no id.

import { describe, expect, it } from 'vitest';
import { MatchCounts, type MatchCountKind } from '../src/analytics/matchCounts';
import { analyticsAllowed, countAllowed, type AnalyticsChoice, type PrivacySignals } from '../src/analytics/preference';
import { createCounter, type CountBody, type CountKind } from '../src/analytics/session';
import { countVisit, FIRST_DAY_KEY, parseFirstDay, utcDayOf, visitCounts, type VisitStore } from '../src/analytics/visits';
import type { AgeBand } from '../src/analytics/age';
import { ASK_AGE_AT_PLAY, askAgeAtPlay, gateAtPlay } from '../src/privacy/askAt';

const hosted = { host: 'itch', channel: 'itch', canonical: 'https://tgt-td-cld.vercel.app' };

describe('the age question at Play', () => {
  it('is asked on the site and not in a hosted build', () => {
    expect(ASK_AGE_AT_PLAY).toEqual({ site: true, hosted: false });
    expect(askAgeAtPlay(null)).toBe(true);
    expect(askAgeAtPlay(hosted)).toBe(false);
  });

  it('goes through the age gate on the site and runs at once in a hosted build', () => {
    for (const [embed, asked] of [
      [null, 1],
      [hosted, 0],
    ] as const) {
      let gates = 0;
      let ran = 0;
      const pending: (() => void)[] = [];
      gateAtPlay(embed, () => ran++, (next) => {
        gates++;
        pending.push(next);
      });
      expect(gates).toBe(asked);
      // The site's gate runs the match only after the answer; a hosted build has run it already.
      expect(ran).toBe(1 - asked);
      for (const next of pending) next();
      expect(ran).toBe(1);
    }
  });
});

const NEW_KINDS: CountKind[] = [
  'first_open',
  'match_start',
  'match_minute',
  'match_end',
  'match_second',
  'return_d1',
  'return_d7',
];

describe('the new anonymous counts', () => {
  it('follow countOn exactly: every age band, choice, GPC and DNT', () => {
    const signalsList: PrivacySignals[] = [
      { gpc: false, dnt: false },
      { gpc: true, dnt: false },
      { gpc: false, dnt: true },
    ];
    const choices: (AnalyticsChoice | null)[] = [null, 'on', 'off'];
    const ages: (AgeBand | null)[] = [null, 'child', 'teen', 'adult'];
    for (const choice of choices) {
      for (const signals of signalsList) {
        for (const age of ages) {
          const posts: CountBody[] = [];
          const counter = createCounter({
            channel: 'itch',
            platform: 'web',
            browser: 'chrome',
            post: (body) => posts.push(body),
            allowed: () => countAllowed(choice, signals, age),
          });
          for (const kind of NEW_KINDS) counter.count(kind);
          const expected = countAllowed(choice, signals, age);
          const label = JSON.stringify({ choice, signals, age });
          expect(posts.map((p) => p.what), label).toEqual(expected ? NEW_KINDS : []);
          for (const body of posts) expect(Object.keys(body).sort()).toEqual(['browser', 'channel', 'platform', 'what']);
          // Nothing with an id before the answer: play data still waits for the age.
          if (age === null) expect(analyticsAllowed(choice, signals, age)).toBe(false);
          // Under 13 nothing; 13 to 15 only with play data turned on.
          if (age === 'child') expect(posts).toEqual([]);
          if (age === 'teen' && choice !== 'on') expect(posts).toEqual([]);
        }
      }
    }
  });
});

function memory(init: Record<string, string> = {}): VisitStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const DAY = 86_400_000;

describe('first open and the returns', () => {
  it('works in UTC days', () => {
    expect(utcDayOf(0)).toBe(0);
    expect(utcDayOf(DAY - 1)).toBe(0);
    expect(utcDayOf(DAY)).toBe(1);
    expect(utcDayOf(Date.UTC(2026, 10, 12, 23, 59))).toBe(utcDayOf(Date.UTC(2026, 10, 12, 0, 0)));
  });

  it('counts a first open once, then day 1 and day 7 once each, and nothing on other days', () => {
    const store = memory();
    const seen: string[] = [];
    const open = (day: number, hour = 12) => countVisit(store, day * DAY + hour * 3_600_000, (k) => seen.push(`${day}:${k}`));
    open(100);
    open(100, 20);
    open(101, 1);
    open(101, 23);
    open(102);
    open(106);
    open(107);
    open(107);
    open(108);
    open(130);
    expect(seen).toEqual(['100:first_open', '101:return_d1', '107:return_d7']);
    expect(parseFirstDay(store.map.get(FIRST_DAY_KEY))).toEqual({ day: 100, counted: ['return_d1', 'return_d7'] });
  });

  it('counts day 7 even when day 1 was missed', () => {
    expect(visitCounts(JSON.stringify({ day: 10, counted: [] }), 17)).toEqual({
      kinds: ['return_d7'],
      keep: { day: 10, counted: ['return_d7'] },
    });
    expect(visitCounts(JSON.stringify({ day: 10, counted: [] }), 13)).toEqual({ kinds: [], keep: null });
  });

  it('starts again from a cleared store or a value it cannot read', () => {
    for (const raw of [null, '', 'nope', '{"day":-1,"counted":[]}', '{"day":3,"counted":["x"]}', '{"day":1.5,"counted":[]}']) {
      expect(visitCounts(raw, 50), String(raw)).toEqual({ kinds: ['first_open'], keep: { day: 50, counted: [] } });
    }
    // A kept day in the future (a clock set back) starts again too.
    expect(visitCounts(JSON.stringify({ day: 60, counted: [] }), 50).kinds).toEqual(['first_open']);
  });

  it('counts nothing and never throws with no store or a store that throws', () => {
    const seen: string[] = [];
    countVisit(null, DAY * 5, (k) => seen.push(k));
    const broken: VisitStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => countVisit(broken, DAY * 5, (k) => seen.push(k))).not.toThrow();
    expect(seen).toEqual([]);
  });
});

describe('match counts', () => {
  const sample = (tick: number, phase = 'waves') => ({ tick, tickRate: 20, phase });

  it('counts a start a second in, a minute at 60 s, an end, and a second match in the same page', () => {
    const counts = new MatchCounts();
    const seen: MatchCountKind[] = [];
    const feed = (tick: number, phase?: string) => seen.push(...counts.feed(sample(tick, phase)));
    feed(0);
    feed(5);
    expect(seen).toEqual([]);
    feed(20);
    feed(40);
    expect(seen).toEqual(['match_start']);
    feed(1199);
    feed(1200);
    feed(1300);
    expect(seen).toEqual(['match_start', 'match_minute']);
    feed(2000, 'defeat');
    feed(2001, 'defeat');
    expect(seen).toEqual(['match_start', 'match_minute', 'match_end']);
    // Play again: the tick goes back. A short second match: no minute.
    feed(0);
    feed(25);
    feed(400, 'victory');
    expect(seen).toEqual(['match_start', 'match_minute', 'match_end', 'match_start', 'match_second', 'match_end']);
    // A third match is no new kind.
    counts.reset();
    feed(0);
    feed(30);
    expect(seen.slice(6)).toEqual(['match_start']);
  });

  it('never counts a match first seen already over (a rejoin after the end)', () => {
    const counts = new MatchCounts();
    expect(counts.feed(sample(5000, 'victory'))).toEqual([]);
    expect(counts.feed(sample(5001, 'victory'))).toEqual([]);
  });
});
