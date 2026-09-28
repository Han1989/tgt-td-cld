import { describe, expect, it } from 'vitest';
import { HeroPredictor, PREDICT, type Pt } from '../src/predict';

const FRAME = 16;
const TICK = 50;
const SPEED = 3.2;

/** Straight-line walking (an open field). */
const straight = (_from: Pt, to: Pt) => [{ x: to.x, y: to.y }];

/**
 * A small world: a server that applies commands `oneWay` ms after they are sent, at its next
 * 50 ms tick, moves the hero at SPEED and sends a snapshot that arrives `oneWay` ms later; and a
 * client that holds the joystick towards +x from `pressAt` to `releaseAt`, resending the move
 * every 100 ms like TouchControls, and draws the hero from the predictor.
 */
function play(opts: { oneWay: number; pressAt: number; releaseAt: number; until: number; stunFrom?: number; offsetAt?: { t: number; dy: number } }) {
  const pred = new HeroPredictor(straight);
  pred.speed = SPEED;
  const server = { x: 5, y: 5, target: null as Pt | null };
  const inbox: { at: number; cmd: { type: 'move'; x: number; y: number } | { type: 'stop' } }[] = [];
  const deliveries: { at: number; x: number; y: number; stunned: boolean }[] = [];
  let interp = { x: 5, y: 5 };
  let lastMoveAt = -Infinity;
  let nextTick = 0;
  const drawn: { t: number; x: number; y: number }[] = [];
  let sentMoveAt = -1;
  for (let t = 0; t <= opts.until; t += FRAME) {
    // Server ticks up to now.
    while (nextTick <= t) {
      for (const c of inbox.filter((c) => c.at + opts.oneWay <= nextTick)) {
        server.target = c.cmd.type === 'move' ? { x: c.cmd.x, y: c.cmd.y } : null;
        inbox.splice(inbox.indexOf(c), 1);
      }
      const stunned = opts.stunFrom !== undefined && nextTick >= opts.stunFrom;
      if (server.target && !stunned) {
        const dx = server.target.x - server.x;
        const dy = server.target.y - server.y;
        const d = Math.hypot(dx, dy);
        const step = (SPEED * TICK) / 1000;
        if (d <= step) {
          server.x = server.target.x;
          server.y = server.target.y;
          server.target = null;
        } else {
          server.x += (dx / d) * step;
          server.y += (dy / d) * step;
        }
      }
      if (opts.offsetAt && nextTick === opts.offsetAt.t) server.y += opts.offsetAt.dy;
      deliveries.push({ at: nextTick + opts.oneWay, x: server.x, y: server.y, stunned });
      nextTick += TICK;
    }
    for (const d of deliveries.filter((d) => d.at <= t)) {
      pred.snapshot({ x: d.x, y: d.y, alive: true, stunned: d.stunned }, d.at);
      interp = { x: d.x, y: d.y };
      deliveries.splice(deliveries.indexOf(d), 1);
    }
    // Joystick.
    const held = t >= opts.pressAt && t < opts.releaseAt;
    if (held && t - lastMoveAt >= 100) {
      const from = pred.drawn ?? interp;
      const cmd = { type: 'move' as const, x: from.x + 2.5, y: from.y };
      inbox.push({ at: t, cmd });
      pred.move(cmd, t);
      if (sentMoveAt < 0) sentMoveAt = t;
      lastMoveAt = t;
    }
    if (!held && lastMoveAt > -Infinity && t >= opts.releaseAt && lastMoveAt !== Infinity) {
      inbox.push({ at: t, cmd: { type: 'stop' } });
      pred.stop(t);
      lastMoveAt = Infinity;
    }
    pred.frame(t, FRAME);
    const p = pred.resolve(interp);
    drawn.push({ t, x: p.x, y: p.y });
  }
  return { pred, drawn, server, sentMoveAt };
}

describe('HeroPredictor', () => {
  for (const oneWay of [2, 60]) {
    it(`draws the hero moving on the first frame and walks smoothly (${oneWay * 2} ms round trip)`, () => {
      const { drawn, sentMoveAt, server, pred } = play({ oneWay, pressAt: 200, releaseAt: 1400, until: 3500 });
      const i = drawn.findIndex((d) => d.t === sentMoveAt);
      // It moves in the very frame the move was sent.
      expect(drawn[i]!.x).toBeGreaterThan(drawn[i - 1]!.x + 0.02);
      // Never faster than 1.6× its speed, never stalls while the stick is held, and never goes back
      // more than the server's last tick of walking (it may stop a little short), slowly.
      let back = 0;
      for (let k = i + 1; k < drawn.length; k++) {
        const step = drawn[k]!.x - drawn[k - 1]!.x;
        expect(step).toBeGreaterThan(-0.01);
        back += Math.max(0, -step);
        expect(step).toBeLessThan((SPEED * FRAME * 1.6) / 1000);
        if (drawn[k]!.t < 1400) expect(step).toBeGreaterThan((SPEED * FRAME * 0.5) / 1000);
      }
      expect(back).toBeLessThan((SPEED * TICK) / 1000);
      // It ends where the server has the hero, and drawing is handed back to interpolation.
      const last = drawn.at(-1)!;
      expect(last.x).toBeCloseTo(server.x, 2);
      expect(pred.active).toBe(false);
      // The lag was measured from the start: a round trip plus up to a tick.
      expect(pred.lagMs).toBeGreaterThanOrEqual(oneWay * 2);
      expect(pred.lagMs).toBeLessThanOrEqual(oneWay * 2 + TICK);
    });
  }

  it('blends a small disagreement in smoothly', () => {
    const { drawn, server } = play({ oneWay: 30, pressAt: 100, releaseAt: 2000, until: 3000, offsetAt: { t: 800, dy: 0.6 } });
    // The server's hero is suddenly 0.6 tiles lower: no frame jumps more than a quarter of that...
    const y0 = drawn.find((d) => d.t >= 800)!.y;
    for (let k = 1; k < drawn.length; k++) expect(Math.abs(drawn[k]!.y - drawn[k - 1]!.y)).toBeLessThan(0.15);
    // ...the drawn hero follows it down within about half a second, and both agree in the end.
    expect(drawn.find((d) => d.t >= 1400)!.y - y0).toBeGreaterThan(0.2);
    expect(drawn.at(-1)!.y).toBeCloseTo(server.y, 2);
  });

  it(`jumps when the server is more than ${PREDICT.snapTiles} tiles away`, () => {
    const { drawn } = play({ oneWay: 30, pressAt: 100, releaseAt: 2000, until: 2200, offsetAt: { t: 800, dy: 3 } });
    const jump = drawn.findIndex((d, k) => k > 0 && d.y - drawn[k - 1]!.y > 2.5);
    expect(jump).toBeGreaterThan(0);
  });

  it('stops predicting while the hero is stunned and settles where the server has it', () => {
    const { drawn, server } = play({ oneWay: 30, pressAt: 100, releaseAt: 3000, until: 3400, stunFrom: 600 });
    // Stunned at 600 ms (seen ~80 ms later): the drawn hero stops close to the server's.
    const at = drawn.find((d) => d.t >= 1200)!;
    expect(Math.abs(at.x - server.x)).toBeLessThan(0.1);
  });

  it('follows the path the sim would take', () => {
    // Around a wall: first up, then right.
    const pred = new HeroPredictor((from, to) => [{ x: from.x, y: from.y - 2 }, to]);
    pred.speed = 4;
    pred.resolve({ x: 0, y: 0 });
    pred.move({ x: 2, y: -2 }, 0);
    for (let t = 16; t <= 480; t += 16) pred.frame(t, 16);
    const p = pred.resolve({ x: 0, y: 0 });
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeLessThan(-1.5);
    expect(p.facing).toBeCloseTo(-Math.PI / 2);
    for (let t = 496; t <= 1200; t += 16) pred.frame(t, 16);
    const q = pred.resolve({ x: 0, y: 0 });
    expect(q.x).toBeCloseTo(2, 5);
    expect(q.y).toBeCloseTo(-2, 5);
  });

  it('hands back to the server when another order moves the hero', () => {
    const pred = new HeroPredictor(straight);
    pred.resolve({ x: 0, y: 0 });
    pred.move({ x: 3, y: 0 }, 0);
    for (let t = 16; t <= 160; t += 16) pred.frame(t, 16);
    const moved = pred.resolve({ x: 0, y: 0 }).x;
    expect(moved).toBeGreaterThan(0.3);
    pred.cancel();
    // Blends over to the interpolated position instead of jumping.
    pred.frame(176, 16);
    const x1 = pred.resolve({ x: 0, y: 0 }).x;
    expect(x1).toBeGreaterThan(moved * 0.7);
    for (let t = 192; t <= 1500; t += 16) pred.frame(t, 16);
    expect(pred.resolve({ x: 0, y: 0 }).x).toBeCloseTo(0, 2);
    expect(pred.active).toBe(false);
  });

  it('lets go when the hero dies', () => {
    const pred = new HeroPredictor(straight);
    pred.resolve({ x: 0, y: 0 });
    pred.move({ x: 3, y: 0 }, 0);
    pred.frame(16, 16);
    pred.snapshot({ x: 0, y: 0, alive: false, stunned: false }, 20);
    expect(pred.active).toBe(false);
    expect(pred.resolve({ x: 7, y: 7 })).toEqual({ x: 7, y: 7, facing: null });
  });
});
