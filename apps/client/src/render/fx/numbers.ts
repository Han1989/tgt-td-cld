// Floating-number layout (pure, tested): numbers are drawn as one particle per glyph from the
// effects atlas, so they cost no text rendering and never rebuild the scene's draw list.

/** Glyphs the atlas has. */
export const GLYPHS = '0123456789+-!';

/** x offsets (in glyph pixels) that centre `text` on 0; unknown characters are skipped. */
export function layoutGlyphs(text: string, advance: (ch: string) => number): { ch: string; x: number }[] {
  const chars = [...text].filter((ch) => GLYPHS.includes(ch));
  const widths = chars.map(advance);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  return chars.map((ch, i) => {
    const w = widths[i]!;
    const out = { ch, x: x + w / 2 };
    x += w;
    return out;
  });
}

/** A damage number's text: whole, capped at 5 digits (the atlas has digits only), crits end in "!". */
export function damageText(damage: number, crit: boolean): string {
  const n = Math.max(0, Math.min(99_999, Math.round(damage)));
  return crit ? `${n}!` : String(n);
}
