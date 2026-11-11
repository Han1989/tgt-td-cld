import { describe, expect, it } from 'vitest';
import { hpLine, hpNow, manaLine, manaNow, maxWhole, whole } from '../src/hud/num';

describe('HUD whole numbers', () => {
  it('max HP rounds to the nearest', () => {
    expect(maxWhole(949.2799999999999)).toBe(949);
    expect(maxWhole(991.16)).toBe(991);
    expect(maxWhole(991.5)).toBe(992);
    expect(hpLine(271, 949.2799999999999)).toBe('271 / 949');
  });
  it('current HP rounds up, so a living hero or tower never reads 0', () => {
    expect(hpNow(0.4, 500)).toBe(1);
    expect(hpNow(260.2, 991.16)).toBe(261);
    expect(hpNow(0, 500)).toBe(0);
    expect(hpLine(0.4, 500)).toBe('1 / 500');
  });
  it('current never reads above max', () => {
    // A full hero at 949.28 would round up to 950 against a max of 949.
    expect(hpNow(949.2799999999999, 949.2799999999999)).toBe(949);
    expect(hpLine(949.2799999999999, 949.2799999999999)).toBe('949 / 949');
    expect(manaNow(332.4, 332.4)).toBe(332);
  });
  it('whole values are unchanged, float noise aside', () => {
    expect(hpNow(300, 300)).toBe(300);
    expect(hpNow(300.0000000001, 600)).toBe(300);
    expect(manaNow(34.99999999999, 100)).toBe(35);
  });
  it('mana rounds down, so a skill that reads affordable is affordable', () => {
    const cost = 35;
    const mana = 34.9;
    expect(manaNow(mana, 332)).toBe(34);
    expect(manaNow(mana, 332) >= cost).toBe(mana >= cost);
    expect(manaLine(34.9, 332)).toBe('34 / 332');
    expect(manaLine(35, 332)).toBe('35 / 332');
  });
  it('other numbers round to the nearest', () => {
    expect(whole(17.92)).toBe(18);
    expect(whole(12345.6)).toBe(12346);
  });
});
