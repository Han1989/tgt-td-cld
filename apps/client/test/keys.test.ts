import { describe, expect, it } from 'vitest';
import { CANCEL_HINT, CANCEL_KEYS, isCancelKey } from '../src/input/keys';

describe('cancel keys (q8)', () => {
  it('X cancels, and Escape still does where the page receives it', () => {
    expect(isCancelKey('x')).toBe(true);
    expect(isCancelKey('X')).toBe(true);
    expect(isCancelKey('Escape')).toBe(true);
    expect(CANCEL_KEYS).toContain('x');
  });

  it('no key that already does something else cancels', () => {
    for (const k of ['a', 'b', 'c', 'e', 'f', 'q', 'r', 's', 'u', 'w', '1', '5', ' ', 'ArrowUp']) expect(isCancelKey(k), k).toBe(false);
  });

  it('the hint names X and right-click, never Escape', () => {
    expect(CANCEL_HINT).toContain('<kbd>X</kbd>');
    expect(CANCEL_HINT).toContain('right-click');
    expect(CANCEL_HINT).not.toMatch(/esc/i);
  });
});
