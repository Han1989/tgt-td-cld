// The order the match's pictures load in (docs/ART.md §15, Han, 17 Oct 2026; V-07d). After the first screen, one
// after another: the map plate, the HUD's rendered frames (a small sheet), the towers', Heart's and portals' sheet,
// the creeps' sheets (one kind after another, in the order they first come in the waves), then the heroes'. Two
// pictures jump the queue: the picked hero's sheet starts the moment the home card shows him (and a room's heroes as
// its seats fill), and when a match starts, everything its first wave shows that is not in yet starts at once
// (`wantFirstWave`), its creep kinds first among the creeps. The painted ground, the 2D art and the CSS frames cover
// each until its picture is in.
//
// `<html data-plate>` ("ready" or "failed"), `data-ui` (the frames' CSS switches on it), `data-structures`,
// `data-creep-sheets` and `data-hero-sheets` say they are in (browser tests start a match after them to see the 3D
// art and the plate); `tdt:ui`, `tdt:structures`, `tdt:creep-sheets` and `tdt:hero-sheets` mark when
// (npm run first-load).

import { CREEP_KINDS, HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { loadUiFrames } from '../hud/frames';
import { keepSheets } from '../platform/pwa';
import {
  CREEP_SHEETS,
  creepFrames,
  HERO_SHEETS,
  heroFrames,
  loadCreepSheet,
  loadCreepSheets,
  loadHeroSheet,
  loadHeroSheets,
  loadStructureSheet,
  preferCreeps,
} from '../render/art3d';
import { loadPlate } from '../render/plate';
import { creepKinds, type SheetId } from './rules';
import { sheetOff } from './track';

let chain: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Browser-test builds: `?towers2d` keeps the 2D towers, Heart and portals, `?creeps2d` the 2D creeps, `?ui2d` the CSS frames. */
function keep2d(what: 'towers2d' | 'creeps2d' | 'ui2d'): boolean {
  return import.meta.env.MODE === 'e2e' && new URLSearchParams(location.search).has(what);
}

/** Starts the chain `ms` from now (the first screen is up: a second later, never in its way), unless it has started. */
export function scheduleArt(ms: number): void {
  if (chain || timer) return;
  timer = setTimeout(() => void startArt(), ms);
}

/** Starts the chain now (once): a match is starting, so the first screen is done with the line. */
export function startArt(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  chain ??= run();
  return chain;
}

async function run(): Promise<void> {
  const html = document.documentElement.dataset;
  if (keep2d('towers2d')) sheetOff('structures');
  if (keep2d('creeps2d')) for (const k of CREEP_KINDS) sheetOff(`creep:${k}`);
  const plate = await loadPlate();
  html.plate = plate ? 'ready' : 'failed';
  if (!keep2d('ui2d')) {
    html.ui = (await loadUiFrames()) ? 'ready' : 'failed';
    performance.mark('tdt:ui');
  }
  if (!keep2d('towers2d')) await loadStructureSheet();
  html.structures = 'ready';
  performance.mark('tdt:structures');
  if (!keep2d('creeps2d')) await loadCreepSheets();
  html.creepSheets = 'ready';
  performance.mark('tdt:creep-sheets');
  await loadHeroSheets();
  html.heroSheets = 'ready';
  performance.mark('tdt:hero-sheets');
  // The service worker keeps the creeps' and heroes' sheets that came in, for offline solo (they are not precached).
  keepSheets([
    ...CREEP_KINDS.filter((k) => creepFrames(k)).map((k) => CREEP_SHEETS[k]),
    ...HERO_KINDS.filter((k) => heroFrames(k)).flatMap((k) => HERO_SHEETS[k] ?? []),
  ]);
}

/** The home card shows this hero, or a room's seat holds him: his match sheet starts now (V-07d). */
export function wantHero(kind: HeroKind): void {
  void loadHeroSheet(kind);
}

/**
 * A match is starting: every picture its first wave shows (`firstWaveSheets`) that is not in yet starts at once, and
 * the chain carries on with the rest after them.
 */
export function wantFirstWave(ids: readonly SheetId[]): void {
  const kinds = creepKinds(ids);
  if (!keep2d('creeps2d')) preferCreeps(kinds);
  void startArt();
  for (const id of ids) {
    if (id === 'plate') void loadPlate();
    else if (id === 'structures') {
      if (!keep2d('towers2d')) void loadStructureSheet();
    } else if (id.startsWith('hero:')) void loadHeroSheet(id.slice(5) as HeroKind);
  }
  if (!keep2d('creeps2d')) for (const k of kinds) void loadCreepSheet(k);
}
