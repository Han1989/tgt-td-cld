import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalyticsClient, type AnalyticsBody } from '../src/analytics/session';
import {
  BOOT_COPY,
  BOOT_SLOW_MS,
  createBootWatchdog,
  GraphicsUnavailableError,
  type BootFailure,
  type BootReason,
} from '../src/startup/boot';

/** A watchdog whose three callbacks are recorded in order. */
function watch() {
  const calls: string[] = [];
  const dog = createBootWatchdog({
    onSlow: () => calls.push('slow'),
    onFailed: (reason) => calls.push(`failed:${reason}`),
    onReport: (reason) => calls.push(`report:${reason}`),
  });
  return { dog, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('start-up watchdog timing', () => {
  it('waits 15 seconds, then says so and reports boot_timeout once', () => {
    expect(BOOT_SLOW_MS).toBe(15_000);
    const { dog, calls } = watch();
    vi.advanceTimersByTime(BOOT_SLOW_MS - 1);
    expect(calls).toEqual([]);
    expect(dog.phase()).toBe('starting');
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['slow', 'report:boot_timeout']);
    expect(dog.phase()).toBe('slow');
    vi.advanceTimersByTime(10 * BOOT_SLOW_MS);
    expect(calls).toHaveLength(2);
  });

  it('says nothing when ready comes in time', () => {
    const { dog, calls } = watch();
    vi.advanceTimersByTime(BOOT_SLOW_MS - 1);
    dog.ready();
    vi.advanceTimersByTime(10 * BOOT_SLOW_MS);
    expect(calls).toEqual([]);
    expect(dog.phase()).toBe('ready');
  });

  it('keeps waiting after the message: a late ready still wins and nothing more is said', () => {
    const { dog, calls } = watch();
    vi.advanceTimersByTime(BOOT_SLOW_MS);
    dog.ready();
    expect(dog.phase()).toBe('ready');
    dog.fail('webgl_context_lost');
    vi.advanceTimersByTime(BOOT_SLOW_MS);
    expect(calls).toEqual(['slow', 'report:boot_timeout']);
  });

  it('a failure shows at once, reports its own reason, and cancels the timeout', () => {
    const failures: BootFailure[] = ['webgl_unavailable', 'webgl_context_lost'];
    for (const reason of failures) {
      const { dog, calls } = watch();
      vi.advanceTimersByTime(1_000);
      dog.fail(reason);
      expect(dog.phase()).toBe('failed');
      vi.advanceTimersByTime(10 * BOOT_SLOW_MS);
      expect(calls).toEqual([`failed:${reason}`, `report:${reason}`]);
    }
  });

  it('a failure after the slow message replaces it and is reported too; a second failure is ignored', () => {
    const { dog, calls } = watch();
    vi.advanceTimersByTime(BOOT_SLOW_MS);
    dog.fail('webgl_context_lost');
    dog.fail('webgl_unavailable');
    expect(calls).toEqual(['slow', 'report:boot_timeout', 'failed:webgl_context_lost', 'report:webgl_context_lost']);
  });

  it('a failure after ready is ignored (the game is up)', () => {
    const { dog, calls } = watch();
    dog.ready();
    dog.fail('webgl_unavailable');
    expect(calls).toEqual([]);
    expect(dog.phase()).toBe('ready');
  });

  it('does not count the time the page is in the background', () => {
    const { dog, calls } = watch();
    vi.advanceTimersByTime(10_000);
    dog.visible(false);
    vi.advanceTimersByTime(10 * BOOT_SLOW_MS);
    expect(calls).toEqual([]);
    dog.visible(true);
    vi.advanceTimersByTime(4_999);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['slow', 'report:boot_timeout']);
  });

  it('a page that starts in the background waits the full 15 seconds once it is shown', () => {
    const { dog, calls } = watch();
    dog.visible(false);
    vi.advanceTimersByTime(60_000);
    dog.visible(true);
    vi.advanceTimersByTime(BOOT_SLOW_MS - 1);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['slow', 'report:boot_timeout']);
  });

  it('repeated hide and show keep only the unspent time', () => {
    const { dog, calls } = watch();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(2_000);
      dog.visible(false);
      vi.advanceTimersByTime(30_000);
      dog.visible(true);
    }
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(5_000);
    expect(calls).toEqual(['slow', 'report:boot_timeout']);
  });

  it('a failure while in the background still shows (and reports) at once', () => {
    const { dog, calls } = watch();
    dog.visible(false);
    dog.fail('webgl_unavailable');
    expect(calls).toEqual(['failed:webgl_unavailable', 'report:webgl_unavailable']);
    dog.visible(true);
    vi.advanceTimersByTime(BOOT_SLOW_MS);
    expect(calls).toHaveLength(2);
  });
});

describe('start-up messages', () => {
  it('speak in plain words', () => {
    expect(BOOT_COPY.slow).toBe('Still loading. This can take longer on a slow connection.');
    expect(BOOT_COPY.graphics).toBe("This browser could not start the game's graphics.");
    expect(BOOT_COPY.threw).toBe('The game could not start. Refresh to try again.');
  });

  it('GraphicsUnavailableError carries the reason main.ts reports', () => {
    const cause = new Error('This browser does not support WebGL');
    const err = new GraphicsUnavailableError('webgl_unavailable', cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe('webgl_unavailable');
    expect(err.cause).toBe(cause);
    expect(new GraphicsUnavailableError('webgl_context_lost').reason).toBe('webgl_context_lost');
  });
});

describe('start-up reports use the crash report path', () => {
  function client(allowed: () => boolean) {
    const posts: AnalyticsBody[] = [];
    const api = createAnalyticsClient({
      visitor: () => 'visitor-0001',
      channel: 'direct',
      platform: 'android',
      newSessionId: () => 'session-0001',
      post: (body) => posts.push(body),
      allowed,
      build: 'abc1234',
      browser: 'chrome',
    });
    api.start(0);
    posts.length = 0;
    return { api, posts };
  }
  const reasons: BootReason[] = ['boot_timeout', 'webgl_unavailable', 'webgl_context_lost'];

  it('is a client_error whose message is the fixed reason, with no stack', () => {
    const { api, posts } = client(() => true);
    for (const [i, reason] of reasons.entries()) api.error({ kind: 'error', message: reason, stack: '' }, i * 10_000);
    expect(posts.map((p) => [p.t, p.kind, p.message, 'stack' in p])).toEqual([
      ['client_error', 'error', 'boot_timeout', false],
      ['client_error', 'error', 'webgl_unavailable', false],
      ['client_error', 'error', 'webgl_context_lost', false],
    ]);
    expect(posts[0]).toMatchObject({ platform: 'android', browser: 'chrome', build: 'abc1234' });
  });

  it('sends nothing while the Play data switch is off', () => {
    const { api, posts } = client(() => false);
    api.error({ kind: 'error', message: 'boot_timeout', stack: '' }, 0);
    expect(posts).toEqual([]);
  });

  it('sends a reason once a session', () => {
    const { api, posts } = client(() => true);
    api.error({ kind: 'error', message: 'boot_timeout', stack: '' }, 0);
    api.error({ kind: 'error', message: 'boot_timeout', stack: '' }, 60_000);
    expect(posts).toHaveLength(1);
  });
});
