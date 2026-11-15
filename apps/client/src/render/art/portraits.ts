// The heroes' faces (q13, docs/ART.md §12 "The heroes' faces"): head and shoulders cut from each hero's own stage
// poster by `npm run hero-portraits -w @tdt/client` (scripts/heroPortraits.ts), committed, on a clear background. The
// one exception to "UI icons are drawn in code": everywhere the game shows a hero's icon (`heroIcon`, published as
// `--icon-hero-<kind>` by icons.ts's `installIcons`) it shows this picture. Bundled by Vite with the first screen, so
// the service worker precaches them with the shell. `eyes`: where each glowing eye is, as fractions of the picture
// (measured on the cut), for the hero buttons' eye glow (lobby/heroPicker.ts).

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import arcanist from './portraits/arcanist.webp';
import layout from './portraits/portraits.json';
import ranger from './portraits/ranger.webp';
import warden from './portraits/warden.webp';

export interface Portrait {
  /** The picture's URL (a hashed asset). */
  url: string;
  /** Its side, px (square). */
  side: number;
  /** The two eyes' centres, as fractions of the picture, left then right. */
  eyes: readonly { x: number; y: number }[];
}

const URLS: Record<HeroKind, string> = { ranger, warden, arcanist };

export const HERO_PORTRAITS: Readonly<Record<HeroKind, Portrait>> = Object.fromEntries(
  HERO_KINDS.map((kind) => {
    const l = (layout as Record<string, { side: number; eyes: { x: number; y: number }[] }>)[kind]!;
    return [kind, { url: URLS[kind], side: l.side, eyes: l.eyes }];
  }),
) as unknown as Record<HeroKind, Portrait>;
