import { describe, expect, it } from 'vitest';
import { localRunProblem, WHOLE_SUITE } from '../e2e/localRun';

/** A command line as the runner sees it (after `node cli.js`), split on spaces. */
const run = (line: string, env: Record<string, string | undefined> = {}) => localRunProblem(line.split(' '), env);

describe('browser tests off CI name their specs (e2e/localRun.ts)', () => {
  it('refuses a run that names no spec file', () => {
    const lines = ['test', 'test --project=pixel', 'test --project desktop', 'test -g Reload', 'test e2e'];
    for (const line of lines) expect(run(line), line).toBe(WHOLE_SUITE);
  });

  it('lets named specs run', () => {
    const lines = [
      'test e2e/boot.spec.ts --project=pixel',
      'test e2e/privacy.spec.ts:98',
      'test e2e/art.spec.ts -g Bright',
    ];
    for (const line of lines) expect(run(line), line).toBeNull();
  });

  it('wants --no-deps when the stress project is selected, because that project depends on the other three', () => {
    const lines = [
      'test --project=perf',
      'test --project perf',
      'test e2e/perf.spec.ts',
      'test e2e/boot.spec.ts e2e/perf.spec.ts',
    ];
    for (const line of lines) {
      expect(run(line), line).toBe(WHOLE_SUITE);
      expect(run(`${line} --no-deps`), line).toBeNull();
    }
  });

  it('never refuses on CI, or when the whole suite is asked for on purpose', () => {
    for (const line of ['test', 'test --project=perf', 'test --project=iphone --shard=1/2']) {
      expect(run(line, { CI: 'true' }), line).toBeNull();
      expect(run(line, { TDT_E2E_ALL: '1' }), line).toBeNull();
    }
    expect(run('test', { TDT_E2E_ALL: '0' })).toBe(WHOLE_SUITE);
  });
});
