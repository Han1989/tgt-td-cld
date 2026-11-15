// CrazyGames' label zone (q14, scripts/labelZone.ts): the covers' title against the corner the portal tags.

import { describe, expect, it } from 'vitest';
import { coverShape, LABEL_GAP, labelZone, zoneClash } from '../scripts/labelZone';

describe('the label zone', () => {
  it('has the measured share of each shape', () => {
    expect(coverShape(1920, 1080)).toBe('wide');
    expect(coverShape(800, 1200)).toBe('tall');
    expect(coverShape(800, 800)).toBe('square');
    const wide = labelZone(1920, 1080);
    expect(wide.x1).toBeCloseTo(768);
    expect(wide.y1).toBeCloseTo(221.4);
    const tall = labelZone(800, 1200);
    expect(tall.x1).toBeCloseTo(320);
    expect(tall.y1).toBeCloseTo(120);
    const sq = labelZone(800, 800);
    expect(sq.x1).toBeCloseTo(283.2);
    expect(sq.y1).toBeCloseTo(244);
  });

  it('lets a title below or to the right of it by the gap', () => {
    // Below the 16:9 zone, overlapping it in x.
    expect(zoneClash({ x0: 250, y0: 221.4 + LABEL_GAP, x1: 1000, y1: 500 }, 1920, 1080)).toBeNull();
    // Right of the 1:1 zone, overlapping it in y.
    expect(zoneClash({ x0: 283.2 + LABEL_GAP, y0: 40, x1: 780, y1: 200 }, 800, 800)).toBeNull();
    // Below the 2:3 zone.
    expect(zoneClash({ x0: 70, y0: 150, x1: 730, y1: 350 }, 800, 1200)).toBeNull();
  });

  it('stops a title in the zone or nearer than the gap', () => {
    // The kit of 14 Nov: the 16:9 title at the top, in the zone.
    expect(zoneClash({ x0: 250, y0: 170, x1: 1000, y1: 480 }, 1920, 1080)).toMatch(/label zone/);
    // 19 px below the 2:3 zone.
    expect(zoneClash({ x0: 70, y0: 139, x1: 730, y1: 350 }, 800, 1200)).toMatch(/under 20/);
    // The square's title centred at the top, across the zone.
    expect(zoneClash({ x0: 150, y0: 40, x1: 650, y1: 200 }, 800, 800)).not.toBeNull();
    // Diagonally off the corner but within the gap both ways is still too near.
    expect(zoneClash({ x0: 290, y0: 250, x1: 700, y1: 400 }, 800, 800)).not.toBeNull();
  });
});
