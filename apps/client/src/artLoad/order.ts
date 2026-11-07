// How the match's pictures load (docs/ART.md §15, Han, 17 Oct 2026; V-07d; V-08b load-all). As soon as the first
// screen is interactive, all at once at low priority behind the shell (track.ts `fetchSheet`), so the line is never
// idle while one decodes: the map plate, the HUD's rendered frames, the towers', Heart's and portals' pages, every
// creep's sheet (asked for in the order the home card's mode brings them) and the heroes'; then the plate's dusk and
// night (V-08a: bytes only, decoded when the match turns to them). A match starts only once every picture it draws is
// in (gate.ts), so the order no longer decides what a player sees; one after another (V-07d's chain) cost Slow 4G 17 s
// of decodes and round trips among the creeps alone. Time in the lobby counts. The picked hero's sheet starts the moment the home
// card shows him (and a room's heroes as its seats fill), and a match about to start moves its own pictures to the
// front (`wantSheets`).
//
// `<html data-plate>` ("ready" or "failed"), `data-ui` (the frames' CSS switches on it), `data-structures`,
// `data-creep-sheets` and `data-hero-sheets` say they are in; `tdt:ui`, `tdt:structures`, `tdt:creep-sheets` and
// `tdt:hero-sheets` mark when (npm run first-load).

import { CREEP_KINDS, HERO_KINDS, type CreepKind, type HeroKind } from '@tdt/protocol';
import { TUNING, tuningForMode } from '@tdt/sim';
import { loadUiFrames } from '../hud/frames';
import { storedMode } from '../lobby/modePicker';
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
  structurePageUrls,
} from '../render/art3d';
import { fetchPlateLights, loadPlate } from '../render/plate';
import { creepKinds, matchSheets, type SheetId } from './rules';
import { sheetOff, sheetProgress } from './track';

let chain: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lights: string[] = [];

/** Browser-test builds: `?towers2d` keeps the 2D towers, Heart and portals, `?creeps2d` the 2D creeps, `?ui2d` the CSS frames. */
function keep2d(what: 'towers2d' | 'creeps2d' | 'ui2d'): boolean {
  return import.meta.env.MODE === 'e2e' && new URLSearchParams(location.search).has(what);
}

/** Starts the chain `ms` from now (the first screen is up), unless it has started. */
export function scheduleArt(ms: number): void {
  if (chain || timer) return;
  timer = setTimeout(() => void startArt(), ms);
}

/** Starts the chain now (once). */
export function startArt(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  chain ??= run();
  return chain;
}

async function run(): Promise<void> {
  if (keep2d('towers2d')) sheetOff('structures');
  if (keep2d('creeps2d')) for (const k of CREEP_KINDS) sheetOff(`creep:${k}`);
  if (keep2d('ui2d')) sheetOff('ui');
  // The creeps in the order the home card's mode brings them (its first wave's kinds first).
  if (!keep2d('creeps2d')) preferCreeps(creepKinds(matchSheets(tuningForMode(TUNING, storedMode()), [])));
  await Promise.all([
    loadOne('plate'),
    loadOne('ui'),
    loadOne('structures'),
    (keep2d('creeps2d') ? Promise.resolve() : loadCreepSheets()).then(() => marked('creepSheets', 'tdt:creep-sheets')),
    loadHeroSheets().then(() => marked('heroSheets', 'tdt:hero-sheets')),
  ]);
  // Last, the plate's dusk and night (V-08a: bytes only, decoded when a match turns to them; a match starts in the
  // afternoon, so they are not waited for).
  lights = await fetchPlateLights();
  document.documentElement.dataset.plateLights = lights.length > 0 ? 'ready' : 'failed';
  performance.mark('tdt:plate-lights');
  keepAll();
}

/** `<html data-…>` and its performance mark, the first time. */
function marked(flag: 'structures' | 'creepSheets' | 'heroSheets', mark: string): void {
  const html = document.documentElement.dataset;
  if (html[flag] === 'ready') return;
  html[flag] = 'ready';
  performance.mark(mark);
}

/** Loads one picture (its loader runs once, again after a failure) and says so on `<html>`. */
async function loadOne(id: SheetId): Promise<void> {
  const html = document.documentElement.dataset;
  if (id === 'plate') {
    html.plate = (await loadPlate()) ? 'ready' : 'failed';
  } else if (id === 'ui') {
    if (keep2d('ui2d')) return;
    html.ui = (await loadUiFrames()) ? 'ready' : 'failed';
    performance.mark('tdt:ui');
  } else if (id === 'structures') {
    if (!keep2d('towers2d')) await loadStructureSheet();
    if (sheetProgress('structures').status !== 'failed') marked('structures', 'tdt:structures');
  } else if (id.startsWith('creep:')) {
    if (!keep2d('creeps2d')) await loadCreepSheet(id.slice(6) as CreepKind);
  } else {
    await loadHeroSheet(id.slice(5) as HeroKind);
  }
}

/**
 * The service worker keeps what came in for the next visit and offline solo: the structures' pages (precached, but a
 * first visit's worker leaves them to the page so they are not downloaded twice), and the creeps' and heroes' sheets
 * and the plate's other lights (kept on first use).
 */
function keepAll(): void {
  keepSheets([
    ...structurePageUrls(),
    ...CREEP_KINDS.filter((k) => creepFrames(k)).map((k) => CREEP_SHEETS[k]),
    ...HERO_KINDS.filter((k) => heroFrames(k)).flatMap((k) => HERO_SHEETS[k] ?? []),
    ...lights,
  ]);
}

/** The home card shows this hero, or a room's seat holds him: his match sheet starts now (V-07d). */
export function wantHero(kind: HeroKind): void {
  void loadHeroSheet(kind);
}

/**
 * A match is about to start (Play solo was tapped, a room's card is up): its pictures that are not in yet move to the
 * front (its first wave's creep kinds first among the creeps, its heroes at once), and the chain carries on with the rest.
 */
export function wantSheets(ids: readonly SheetId[]): void {
  if (!keep2d('creeps2d')) preferCreeps(creepKinds(ids));
  void startArt();
  for (const id of ids) {
    if (id === 'plate' || id === 'structures' || id === 'ui') void loadOne(id);
    else if (id.startsWith('hero:')) void loadOne(id);
  }
}

/** The wait's Retry: every picture of `ids` that failed is asked for again (each with its own retries). */
export function retryArt(ids: readonly SheetId[]): void {
  const failed = ids.filter((id) => sheetProgress(id).status === 'failed');
  void Promise.all(failed.map(loadOne)).then(() => {
    if (chain) void chain.then(keepAll);
  });
}

/** Every picture a room's match draws: all three heroes (a hero changed in the room sends nobody back to loading). */
export function roomSheets(): SheetId[] {
  return matchSheets(TUNING, HERO_KINDS);
}
