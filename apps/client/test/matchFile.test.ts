import type { MatchReport, Replay } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { matchFile, matchFileName, parseMatchFile } from '../src/hud/matchFile';

const report = { mode: 'quick', result: 'victory', seed: 5, heroes: [] } as unknown as MatchReport;
const replay = { format: 1, seed: 5, log: [[0, 0, 'move', 1.5, 2]] } as unknown as Replay;

describe('match report file', () => {
  it('is named after the local date, time, mode and result', () => {
    expect(matchFileName(report, new Date(2026, 8, 28, 9, 5))).toBe('tdt-match-2026-09-28-0905-quick-victory.json');
  });

  it('holds the report (indented, at the top) and the replay (compact), and reads back', () => {
    const f = matchFile(report, replay, new Date(2026, 0, 2, 3, 4));
    expect(f.text.indexOf('"report"')).toBeLessThan(f.text.indexOf('"replay"'));
    expect(f.text).toContain('[[0,0,"move",1.5,2]]');
    expect(parseMatchFile(f.text)).toEqual({ report, replay });
    expect(parseMatchFile('nope')).toBeNull();
    expect(parseMatchFile('{"report":1}')).toBeNull();
  });
});
