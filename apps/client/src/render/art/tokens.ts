// Runelight palette tokens (docs/ART.md §2). Every colour an art file uses comes from here, so the
// whole look can be tuned in one place. Effect colours stay in ../palette.ts (they are shared with
// the shapes and the HUD).
//
// Runelight: twilight moss and packed-earth lanes under moonlight; ink outlines, a cool rim light on
// the upper left, bodies darkening downwards, and small glowing accents (runes, embers, eyes).

export const RL = {
  // Line and light
  /** Outline ink for every part. */
  ink: 0x100c16,
  /** Moonlight: the rim on the upper-left edge of every part. */
  moon: 0xcfe6ff,
  /** Shadow colour (contact shadows, ground vignette). */
  night: 0x000008,

  // Ground
  moss: 0x2a473b,
  mossDark: 0x1d3329,
  mossLight: 0x3b5f4d,
  fern: 0x12241c,
  lane: 0x5a4c3a,
  laneLight: 0xbcab85,
  pebble: 0x7f6d53,
  forest: 0x172416,
  tree: 0x21381f,

  // Props (trees, rocks, mushrooms, runestones)
  canopy: 0x2e5a3c,
  canopyLight: 0x4a7a4e,
  pine: 0x1f4a3e,
  mushroom: 0xd8c6ae,

  // Build pads: cool carved stone, lighter than the moss so they read as "build here"
  padStone: 0x6b7189,
  padStoneDark: 0x3c4052,
  padGroove: 0x2a2d3b,

  // Materials
  wood: 0x8f5d38,
  woodDark: 0x5c3a22,
  stone: 0x8f8ba2,
  stoneDark: 0x58556d,
  iron: 0x444b5b,
  ironDark: 0x262b36,
  gold: 0xe8b94a,
  bone: 0xe6dac0,
  string: 0xdfe8f0,
  /** Deep hole / void (cannon mouths, visor slits). */
  hole: 0x0d0a10,
  /** Ice crystal (Frost towers), its shadowed facets, and snow caps. */
  ice: 0xa9d8f0,
  iceDark: 0x4f7fa6,
  snow: 0xe8f4fb,
  /** Dressed violet-grey stone and dull amethyst (Arcane towers). */
  arcaneStone: 0x4b3f63,
  amethyst: 0x6a4a8c,
  /** Pale crystal (Prism). */
  crystal: 0xd8e4f4,
  /** Obsidian (Void). */
  obsidian: 0x1e1a2a,
  /** Light blue-grey gun metal and sandbags (Flak towers). */
  steel: 0x6c7a8a,
  steelDark: 0x3a4452,
  sandbag: 0xa08e66,

  // Heroes
  leaf: 0x2fb06c,
  leafDark: 0x165c3a,
  cloth: 0x2a8a8a,
  hoodShadow: 0x13201a,
  gloveDark: 0x3a2a22,

  // Creeps
  grunt: 0xe0503f,
  gruntBelly: 0xe8a070,
  brute: 0x8c3440,

  // UI icons
  /** The arcane gem and the Arcanist's hat in icons (a body colour; `arcane` is its glow). */
  amethyst: 0x9a62e6,
  mana: 0x4a8cff,

  // Glow accents (painter.accent: they glow)
  rune: 0x7ffcd8,
  ember: 0xffa24a,
  /** Creature eyes. */
  eye: 0xffd24a,
  /** Hero eyes under the hood. */
  heroEye: 0xb6ff9e,
  /** Armoured eyes (visors). */
  visorEye: 0xff5a3a,
  /** Frost magic: frost tower runes and cores. */
  frost: 0x9fe8ff,
  /** Arcane magic: arcane tower runes and orbs. */
  arcane: 0xd68cff,
  /** The Void branch's hot magenta rim. */
  voidGlow: 0xff5fd2,
  /** Flak muzzles and runes (hotter and redder than ember). */
  flare: 0xff6a3d,
  heart: 0xff3a60,
  heartFacet: 0x5a0a20,
  portal: 0x8a4fe0,
  portalLight: 0x7ffcd8,
  void: 0x0a0616,
} as const;

export type Tokens = typeof RL;

/** Settings → Display. Bright lifts the ground and the shadows for outdoor play. */
export type Display = 'normal' | 'bright';

/** How the painter and the ground painter light things for a display mode. */
export interface Lighting {
  /** How far a part's body gradient darkens towards its bottom (0..1). */
  bodyDarken: number;
  /** Contact-shadow opacity at its centre. */
  shadowAlpha: number;
  /** Ground lift: a "screen" wash of this colour and opacity over the painted ground (0 = none). */
  groundLift: { color: number; alpha: number };
  /** Vignette opacity at the map's edges. */
  vignette: number;
}

export const LIGHTING: Record<Display, Lighting> = {
  normal: { bodyDarken: 0.42, shadowAlpha: 0.6, groundLift: { color: 0x9fb8c8, alpha: 0 }, vignette: 0.35 },
  bright: { bodyDarken: 0.28, shadowAlpha: 0.38, groundLift: { color: 0x9fb8c8, alpha: 0.32 }, vignette: 0.12 },
};

/** A colour as the ground shows it in a display mode (Bright's "screen" lift), e.g. for DOM swatches. */
export function liftColor(hex: number, display: Display): number {
  const { color, alpha } = LIGHTING[display].groundLift;
  const ch = (s: number) => {
    const a = ((hex >> s) & 0xff) / 255;
    const b = (((color >> s) & 0xff) / 255) * alpha;
    return Math.round((1 - (1 - a) * (1 - b)) * 255) << s;
  };
  return ch(16) | ch(8) | ch(0);
}
