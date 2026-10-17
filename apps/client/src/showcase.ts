// `?showcase`: a dev page listing every entity registered in render/art/entities/ (docs/ART.md §9),
// with no match running. Each entity gets a card per variant (tower tiers and branches, pad zone
// tints…), animated by its real rig, at a big size and at the size a phone shows it in a match. The heroes and creeps
// made in 3D (docs/ART.md §15) get cards of their own too, played from their match sheets by the match's Hero3DRig and
// Creep3DRig next to their 2D rigs' cards, and each hero's lobby stage loop (its video over its poster) gets a card
// at the size a phone's home card shows it. Normal / Bright switches the Display. Kinds that have no art yet (they
// keep their shapes) are listed at the end. Cards are DOM (so the page scrolls natively); one fixed Pixi canvas on
// top draws the entities where their cards are.

import {
  CREEP_KINDS,
  HERO_KINDS,
  type CreepKind,
  type CreepSnap,
  TOWER_BRANCHES,
  TOWER_KINDS,
  type HeroKind,
  type SkillSlot,
  type TowerBranch,
  type TowerKind,
} from '@tdt/protocol';
import { towerStats, TUNING } from '@tdt/sim';
import { Application, Container, type Sprite } from 'pixi.js';
import { createAudio } from './audio';
import type { MusicScene } from './audio/score';
import { MUSIC_FILES } from './audio/files';
import { Takes } from './audio/mix';
import { SOUND_IDS, SOUNDS, type SoundId } from './audio/sounds';
import { soundSeconds } from './audio/synth';
import { ICONS, installIcons } from './render/art/icons';
import { ArtKit } from './render/art/kit';
import {
  allArt,
  creepArt,
  heartArt,
  heroArt,
  portalArt,
  PROJECTILE_STYLES,
  projectileArt,
  towerArt,
  trapArt,
  type ArtEntry,
  type HeroRig,
} from './render/art/registry';
import { CreepRig, DEATH, HIT_FLASH, TowerRig, type TowerRigBase } from './render/art/rigs';
import { StageBackdrop } from './lobby/stageBackdrop';
import {
  creepRig3d,
  heartView3d,
  heroRig3d,
  loadCreepSheets,
  loadHeroSheets,
  loadStructureSheet,
  PORTAL_FLARE,
  PORTAL_OPENING,
  portalView3d,
  towerRig3d,
  type Creep3DRig,
  type Heart3DView,
  type Portal3DView,
} from './render/art3d';
import { CREEP_3D } from './render/art3d/creepData';
import { HERO_3D, type StageBox } from './render/art3d/layout';
import { liftColor, RL, type Display } from './render/art/tokens';
import { createFxAtlas, type FxAtlas } from './render/fx/atlas';
import { Effects } from './render/fx/effects';
import { mixColor, PLAYER_COLORS, toCss } from './render/palette';

/** How big a phone draws things in a match (Spire on a 412 px-wide phone: 15.85 px tiles, entities × 1.58, towers × 1.2). */
const PHONE = { world: 15.85 / 32, entity: (15.85 / 32) * 1.58, tower: (15.85 / 32) * 1.2 };
const ICE = 0xbfeaff;
/**
 * The lobby's hero stage on a 412 × 839 phone (docs/ART.md §15, the stage loop), as heroStage.ts measures it: the
 * home card's stage inside its border (CSS px), the feet line 34 px over its bottom, the title's bottom (68.9 px) less
 * the 8 px a figure may reach behind it. A stage card crops and scales the video as the lobby does.
 */
const LOBBY_STAGE: StageBox = { w: 378, h: 319, ground: 319 - 34, top: 61, side: 14 };

interface Card {
  el: HTMLElement;
  stage: HTMLElement;
  big: Container;
  small: Container;
  /** The phone-size copy's bottom-right extent (px), to keep it inside the card. */
  smallEdge: { x: number; y: number };
  shown: boolean;
  animate(now: number, dtMs: number): void;
}

/** One animated copy of an entity (the card shows two: big and phone size). */
interface Actor {
  view: Container;
  animate(now: number, dtMs: number): void;
}

export async function runShowcase(): Promise<void> {
  let display: Display = 'normal';
  const kit = new ArtKit(display);
  const root = document.createElement('div');
  root.id = 'showcase';
  root.innerHTML = `<style>${CSS}</style>`;
  document.body.appendChild(root);

  const header = document.createElement('header');
  const entries = allArt().filter((e) => e.category !== 'common');
  const counts = document.createElement('p');
  const count = (heroes3d: number, creeps3d: number, stages: number, structures = 0) => {
    counts.textContent =
      `${entries.length} registered entities (render/art/entities/); in 3D (render/art3d/, docs/ART.md §15) ` +
      `${heroes3d} heroes, ${creeps3d} creeps, ${structures} towers and buildings and ${stages} stage loops. ` +
      `Style guide: docs/ART.md. ` +
      `Each card shows the entity large and, bottom right, at a phone's in-match size.`;
  };
  header.innerHTML = `<h1>Runelight art showcase</h1>`;
  header.appendChild(counts);
  count(0, 0, 0);
  const displayRow = document.createElement('div');
  displayRow.className = 'sc-display';
  header.appendChild(displayRow);
  root.appendChild(header);

  const app = new Application();
  await app.init({ backgroundAlpha: 0, resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
  app.canvas.classList.add('sc-canvas');
  root.appendChild(app.canvas);

  const cards: Card[] = [];
  const stages: { stage: HTMLElement; ground: 'moss' | 'lane' }[] = [];
  /** A section at the end of the page, or right after `after`'s section. */
  const section = (title: string, after?: HTMLElement) => {
    const s = document.createElement('section');
    s.innerHTML = `<h2>${title}</h2><div class="sc-grid"></div>`;
    if (after?.parentElement) after.parentElement.after(s);
    else root.insertBefore(s, app.canvas);
    return s.querySelector('.sc-grid') as HTMLElement;
  };
  const addCard = (
    grid: HTMLElement,
    e: ArtEntry,
    variant: string,
    ground: 'moss' | 'lane',
    make: () => Actor,
    bigScale: number,
    smallScale: number,
    art3d?: string,
  ) => {
    const el = document.createElement('div');
    el.className = 'sc-card';
    // A 3D card is the kind's, not the art file's (?showcase lists every art file once in `data-art`).
    if (art3d) el.dataset.art3d = art3d;
    else el.dataset.art = e.id;
    el.dataset.variant = variant;
    el.innerHTML = `<div class="sc-stage"></div><div class="sc-label"><b>${e.name}</b><span>${variant}</span></div>`;
    grid.appendChild(el);
    const stage = el.querySelector('.sc-stage') as HTMLElement;
    stages.push({ stage, ground });
    const a = make();
    const b = make();
    a.view.scale.set(bigScale);
    b.view.scale.set(smallScale);
    a.view.visible = b.view.visible = false;
    app.stage.addChild(a.view, b.view);
    const bounds = b.view.getLocalBounds();
    cards.push({
      el,
      stage,
      big: a.view,
      small: b.view,
      smallEdge: { x: bounds.maxX * smallScale, y: bounds.maxY * smallScale },
      shown: false,
      animate: (now, dt) => {
        a.animate(now, dt);
        b.animate(now, dt);
      },
    });
  };

  const names: Record<string, string> = {
    hero: 'Heroes',
    creep: 'Creeps',
    tower: 'Towers',
    projectile: 'Projectiles',
    trap: 'Traps',
    heart: 'The Heart',
    portal: 'Portals',
    pad: 'Build pads',
    prop: 'Props (painted into the ground)',
  };
  const grids = new Map<string, HTMLElement>();
  const gridFor = (category: string) => {
    let g = grids.get(category);
    if (!g) grids.set(category, (g = section(names[category] ?? category)));
    return g;
  };

  for (const e of entries) {
    const grid = gridFor(e.category);
    switch (e.category) {
      case 'hero':
        addCard(grid, e, `hero 2D · ${e.kind}`, 'lane', () => heroActor(e.rig(kit, true), e.kind), 2, PHONE.entity);
        // Melee heroes: a card that fights a Grunt, to check the swing, the smear, the impact and the knockback.
        if (!TUNING.hero[e.kind].ranged) {
          const dummy = creepArt('grunt');
          if (dummy) addCard(grid, e, `hero 2D · ${e.kind} · melee vs Grunt`, 'lane', () => meleeActor(e.rig(kit, true), e.kind, new CreepRig(kit, dummy)), 1.6, PHONE.entity);
        }
        break;
      case 'creep': {
        // Bosses are drawn smaller so they fit their card.
        const big = TUNING.creeps[e.kind].boss ? 1.3 : 2;
        for (const frame of ['body', ...(e.variants?.frames ?? [])]) {
          const label = frame === 'body' ? `creep · ${e.kind}` : `creep · ${e.kind} · ${frame}`;
          addCard(grid, e, label, 'lane', () => creepActor(new CreepRig(kit, e), frame), big, PHONE.entity);
        }
        break;
      }
      case 'tower': {
        const variants: [number, TowerBranch | null, string][] = [
          [1, null, 'tier 1'],
          [2, null, 'tier 2'],
          [3, null, 'tier 3'],
          ...TOWER_BRANCHES[e.kind].map((b): [number, TowerBranch, string] => [
            4,
            b,
            kit.has(e.id, `${b}.base`) ? `branch · ${b}` : `branch · ${b} (tier 3 art)`,
          ]),
        ];
        for (const [tier, branch, label] of variants) {
          addCard(grid, e, label, 'moss', () => towerActor(new TowerRig(kit, e), e.kind, tier, branch), 1.2, PHONE.tower);
        }
        break;
      }
      case 'projectile':
        addCard(grid, e, `projectile · ${e.kind}`, 'lane', () => projectileActor(kit, e.id), 2.2, PHONE.entity);
        break;
      case 'trap': {
        // The ring is scaled to the root radius in a match; the phone copy uses that, not the raw frame.
        const rootPx = TUNING.hero.ranger.snareTrap.rootRadius * 32;
        const ringPhone = PHONE.world * (rootPx / e.ringRadius);
        addCard(grid, e, 'idle · arming', 'lane', () => frameActor(kit, e.id, 'idle', false), 2, PHONE.entity);
        addCard(grid, e, 'armed', 'lane', () => frameActor(kit, e.id, 'armed', true), 2, PHONE.entity);
        addCard(grid, e, 'root ring', 'lane', () => frameActor(kit, e.id, 'ring', false), 1.35, ringPhone);
        break;
      }
      case 'heart':
        for (const [label, stage] of [
          ['the Heart', 0],
          ['under 60% HP: cracked', 1],
          ['under 30% HP: split open', 2],
        ] as const) {
          addCard(grid, e, label, 'moss', () => heartActor(kit, e.id, e.baseY, e.gemScale, e.gemY, e.floatPx, stage), 1, PHONE.world);
        }
        break;
      case 'portal':
        addCard(grid, e, 'portal', 'moss', () => portalActor(kit, e.id, false), 1, PHONE.world);
        addCard(grid, e, 'wave start: flare', 'moss', () => portalActor(kit, e.id, true), 1, PHONE.world);
        break;
      case 'prop':
        for (const frame of Object.keys(e.frames)) {
          addCard(grid, e, `${e.where} · ${frame}`, 'moss', () => propActor(kit, e.id, frame), 2, PHONE.world);
        }
        break;
      case 'pad': {
        const variants: [string, number, number, number][] = [
          ['solo / open', RL.moon, 0.35, 0],
          ...PLAYER_COLORS.map((c, i): [string, number, number, number] => [`yours · seat ${i + 1}`, c, 0.95, 0.2]),
          ['a teammate’s', PLAYER_COLORS[1], 0.5, 0.08],
        ];
        for (const [label, tint, rim, wash] of variants) addCard(grid, e, label, 'moss', () => padActor(kit, e.id, tint, rim, wash), 1, PHONE.world);
        break;
      }
    }
  }

  // The heroes made in 3D (docs/ART.md §15): their sheets, then a card each right after the 2D heroes, played by the
  // match's 3D rig; then each hero's lobby stage loop.
  await loadHeroSheets();
  const heroes3d: HeroKind[] = [];
  const heroGrid3d = section('Heroes in 3D (rendered ahead of time)', grids.get('hero'));
  for (const kind of Object.keys(HERO_3D) as HeroKind[]) {
    const e = heroArt(kind);
    if (!e || !heroRig3d(kind, kit, true)) continue;
    addCard(heroGrid3d, e, `hero 3D · ${kind}`, 'lane', () => hero3dActor(heroRig3d(kind, kit, true)!, kind), 2, PHONE.entity, kind);
    heroes3d.push(kind);
  }
  const stageGrid = section('Stage', heroGrid3d);
  stageGrid.classList.add('sc-stage-grid');
  const stagesShown: HeroKind[] = [];
  for (const kind of Object.keys(HERO_3D) as HeroKind[]) {
    const e = heroArt(kind);
    if (!e) continue;
    stageCard(stageGrid, kind, e.name);
    stagesShown.push(kind);
  }

  // The creeps made in 3D (docs/ART.md §15): their sheets, then a card each, played by the match's 3D rig.
  await loadCreepSheets();
  const shown3d: string[] = [];
  const grid3d = section('Creeps in 3D (rendered ahead of time)');
  for (const kind of Object.keys(CREEP_3D) as CreepKind[]) {
    const e = creepArt(kind);
    if (!e || !creepRig3d(kind, kit)) continue;
    const big = TUNING.creeps[kind].boss ? 1.3 : 2;
    const looks = kind === 'shardback' ? (['stone', 'ether'] as const) : ([null] as const);
    for (const hide of looks) {
      const label = `creep 3D · ${kind}${hide ? ` · ${hide} hide` : ''}`;
      addCard(grid3d, e, label, 'lane', () => creep3dActor(creepRig3d(kind, kit)!, hide === 'ether'), big, PHONE.entity, kind);
    }
    shown3d.push(kind);
  }
  const creeps3dShown = shown3d.length;
  count(heroes3d.length, creeps3dShown, stagesShown.length);

  // The towers, the Heart and the portals made in 3D (docs/ART.md §15, V-05d): the structures sheet, then a card for
  // every tier and branch, each damage stage and the portal, next to the 2D cards above (the 2D art is the fallback).
  await loadStructureSheet();
  const gridBuildings = section('Towers, the Heart and the portals in 3D (rendered ahead of time)');
  for (const kind of TOWER_KINDS) {
    const e = towerArt(kind);
    if (!e || !towerRig3d(kind, kit)) continue;
    const variants: [number, TowerBranch | null, string][] = [
      [1, null, 'tier 1'],
      [2, null, 'tier 2'],
      [3, null, 'tier 3'],
      ...TOWER_BRANCHES[kind].map((b): [number, TowerBranch, string] => [4, b, `branch · ${b}`]),
    ];
    for (const [tier, branch, label] of variants) {
      addCard(gridBuildings, e, `tower 3D · ${label}`, 'moss', () => towerActor(towerRig3d(kind, kit)!, kind, tier, branch), 1.2, PHONE.tower, e.id);
    }
    shown3d.push(e.id);
  }
  const heart = heartArt();
  if (heartView3d()) {
    for (const [label, stage] of [
      ['the Heart', 0],
      ['under 60% HP: cracked', 1],
      ['under 30% HP: ruined, burning', 2],
    ] as const) {
      addCard(gridBuildings, heart, `heart 3D · ${label}`, 'moss', () => heart3dActor(heartView3d()!, stage), 0.6, PHONE.world, heart.id);
    }
    shown3d.push(heart.id);
  }
  const portal = portalArt();
  if (portalView3d()) {
    addCard(gridBuildings, portal, 'portal 3D', 'moss', () => portal3dActor(kit, portal.id, portalView3d()!, false), 1, PHONE.world, portal.id);
    addCard(gridBuildings, portal, 'portal 3D · wave start: flare', 'moss', () => portal3dActor(kit, portal.id, portalView3d()!, true), 1, PHONE.world, portal.id);
    shown3d.push(portal.id);
  }
  count(heroes3d.length, creeps3dShown, stagesShown.length, shown3d.length - creeps3dShown);

  // Kinds with no art yet keep their shapes in the game.
  const missing = [
    ...HERO_KINDS.filter((k) => !heroArt(k)).map((k) => `hero · ${k}`),
    ...CREEP_KINDS.filter((k) => !creepArt(k)).map((k) => `creep · ${k}`),
    ...TOWER_KINDS.filter((k) => !towerArt(k)).map((k) => `tower · ${k}`),
    ...PROJECTILE_STYLES.filter((s) => !projectileArt(s)).map((s) => `projectile · ${s}`),
    ...(trapArt('snare') ? [] : ['trap · snare']),
  ];
  const todo = document.createElement('section');
  todo.className = 'sc-todo';
  todo.innerHTML = `<h2>Still shapes (${missing.length})</h2><p>${missing.map((m) => `<span>${m}</span>`).join(' ')}</p>`;
  root.insertBefore(todo, app.canvas);

  // UI icons (render/art/icons.ts), baked to CSS images: big, and at the size the HUD shows them.
  installIcons();
  const icons = document.createElement('section');
  icons.className = 'sc-icons';
  icons.innerHTML =
    `<h2>UI icons (${ICONS.size})</h2><div class="sc-icon-grid">` +
    [...ICONS.keys()]
      .map((id) => `<div class="sc-icon" data-icon="${id}"><i style="--ico: var(--icon-${id})"></i><i class="small" style="--ico: var(--icon-${id})"></i><span>${id}</span></div>`)
      .join('') +
    `</div>`;
  root.insertBefore(icons, app.canvas);

  // Sounds (docs/ART.md §13): every effect and the music scenes. Tap to play (the first tap starts audio).
  // Each tap is a new take (another variant, pitch, level, timing and room), as in a match; "×4" plays
  // four in a row, to hear that no two are the same. Effects and music from recorded files are marked.
  const audio = createAudio();
  audio.engine.setMix({ music: 0.5, sfx: 0.8, muted: false });
  const takes = new Takes(Date.now() & 0xffff);
  const sounds = document.createElement('section');
  sounds.className = 'sc-sounds';
  const scenes: MusicScene[] = ['lobby', 'build', 'waves', 'boss', 'none'];
  const files = audio.engine.files;
  const musicFiles = MUSIC_FILES.filter((m) => files.music[m]);
  sounds.innerHTML =
    `<h2>Sounds (${SOUND_IDS.length})</h2><p>Made in code (src/audio/): a lobby in a Japanese garden, matches in a war epic. ` +
    `Tap one to hear it at its in-game level; every tap is a new take. Recorded files (docs/SOUND_FILES.md): ` +
    `${musicFiles.length ? `music ${musicFiles.join(', ')}` : 'no music'}, ${Object.keys(files.sfx).length} effects.</p>` +
    `<div class="sc-display sc-music">Music: ${scenes.map((m) => `<button data-scene="${m}">${m === 'none' ? 'Stop' : m}</button>`).join('')}` +
    `<span class="sc-music-now" id="sc-music-now"></span></div>` +
    `<div class="sc-display">Play: <button data-repeat="1" class="active">×1</button><button data-repeat="4">×4</button></div>` +
    `<div class="sc-sound-grid">${SOUND_IDS.map(
      (id) => `<button data-sound="${id}">${id}${files.sfx[id] ? ' <b>file</b>' : ''}<small>${SOUNDS[id].variants} take${SOUNDS[id].variants > 1 ? 's' : ''}</small></button>`,
    ).join('')}</div>`;
  let repeat = 1;
  const playTake = (id: SoundId, after: number) => {
    const spec = SOUNDS[id];
    const t = takes.next(id, spec);
    audio.engine.play(id, { gain: spec.volume * t.gain, rate: t.rate, variant: t.variant, delay: after + t.delay, wet: t.wet });
  };
  sounds.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    const id = b.dataset.sound as SoundId | undefined;
    if (id) for (let i = 0; i < repeat; i++) playTake(id, i * Math.min(1.2, Math.max(0.35, soundSeconds(SOUNDS[id].def) * 0.6)));
    if (b.dataset.repeat) {
      repeat = Number(b.dataset.repeat);
      for (const x of sounds.querySelectorAll('[data-repeat]')) x.classList.toggle('active', x === b);
    }
    const scene = b.dataset.scene as MusicScene | undefined;
    if (scene) {
      audio.music.setScene(scene);
      for (const x of sounds.querySelectorAll('[data-scene]')) x.classList.toggle('active', x === b && scene !== 'none');
    }
  });
  const now = sounds.querySelector('#sc-music-now')!;
  setInterval(() => {
    const src = audio.music.source;
    now.textContent = src === 'none' ? '' : src === 'code' ? '· code-made' : `· ${src}.mp3`;
  }, 400);
  root.insertBefore(sounds, app.canvas);

  const paintStages = () => {
    for (const { stage, ground } of stages) stage.style.background = toCss(liftColor(ground === 'lane' ? RL.lane : RL.moss, display));
  };
  const renderDisplayRow = () => {
    displayRow.innerHTML = 'Display: ';
    for (const d of ['normal', 'bright'] as const) {
      const b = document.createElement('button');
      b.textContent = d === 'normal' ? 'Normal' : 'Bright';
      b.dataset.value = d;
      b.className = d === display ? 'active' : '';
      b.addEventListener('click', () => {
        display = d;
        kit.setDisplay(d);
        paintStages();
        renderDisplayRow();
      });
      displayRow.appendChild(b);
    }
  };
  paintStages();
  renderDisplayRow();

  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(100, now - last);
    last = now;
    const vh = window.innerHeight;
    for (const c of cards) {
      const r = c.stage.getBoundingClientRect();
      const on = r.bottom > 0 && r.top < vh;
      // Only toggled when a card scrolls in or out (visibility changes rebuild Pixi's draw list).
      if (on !== c.shown) c.shown = c.big.visible = c.small.visible = on;
      if (!on) continue;
      c.big.position.set(r.left + r.width * 0.44, r.top + r.height * 0.5);
      c.small.position.set(r.right - 6 - c.smallEdge.x, r.bottom - 6 - c.smallEdge.y);
      c.animate(now, dt);
    }
  });

  (window as unknown as { __showcase: unknown }).__showcase = {
    ids: entries.map((e) => e.id),
    ids3d: shown3d,
    heroes3d,
    stages: stagesShown,
    cards: () => cards.length,
    display: () => kit.display,
  };
}

// ---------------------------------------------------------------------------
// Actors: each rig driven by fake input
// ---------------------------------------------------------------------------

/** Hero cycle (ms): walks 2 s (turning round each time), fights 2 s (shoots, gets hit), casts two skills, dies. */
const HERO_CYCLE = 7200;
const CASTS: SkillSlot[] = ['Q', 'W', 'R'];

function heroActor(rig: HeroRig, kind: HeroKind): Actor {
  const pose = { x: 0, y: 0, facing: 0, stunned: false, engaged: false };
  let shotAt = -Infinity;
  let hitAt = -Infinity;
  let cast = -1;
  const speed = TUNING.hero[kind].speed;
  const cooldown = TUNING.hero[kind].attackCooldown * 1000;
  return {
    view: rig.body,
    animate(now, dt) {
      const cycle = now % HERO_CYCLE;
      const n = Math.floor(now / HERO_CYCLE);
      const lap = n % 2;
      const facing = lap === 0 ? 0 : Math.PI;
      // Fighting: an enemy is in reach (a melee hero winds up before each swing).
      pose.engaged = cycle >= 1700 && cycle < 4000;
      if (cycle < 2000) {
        pose.facing = facing;
        pose.x += (lap === 0 ? 1 : -1) * speed * (dt / 1000);
      } else if (cycle < 4000) {
        pose.facing = facing + Math.sin(now / 700) * 0.7;
        if (now - shotAt > cooldown) {
          shotAt = now;
          rig.shot(now);
        }
        if (now - hitAt > 650) {
          hitAt = now;
          rig.hit(now);
        }
      } else if (cycle < 5800) {
        pose.facing = facing + 0.3;
        const k = cycle < 4900 ? 0 : 1;
        if (cast !== n * 2 + k) {
          cast = n * 2 + k;
          rig.cast(now, CASTS[(n + k) % CASTS.length]!);
        }
      }
      if (cycle >= 5800) rig.die(Math.min(1, (cycle - 5800) / DEATH.hero.ms));
      else rig.update(pose, now, dt);
    },
  };
}

/**
 * A melee hero fighting a Grunt a tile away, with the match's effects: it winds up before each swing
 * (every attack cooldown), and on the blow the Grunt flashes, is knocked back and throws the impact.
 */
function meleeActor(rig: HeroRig, kind: HeroKind, grunt: CreepRig): Actor {
  const view = new Container();
  const fx = new Effects(fxAtlas());
  const gx = 34;
  grunt.reset(-1);
  const target = new Container();
  target.x = gx;
  target.addChild(grunt.body, grunt.flash);
  fx.attach(view, view);
  view.addChildAt(rig.body, 0);
  view.addChildAt(target, 1);
  // The rig is centred on the hero; shift the pair so the card shows both.
  view.pivot.x = gx / 2;
  const pose = { x: 0, y: 0, facing: 0, stunned: false, engaged: true };
  const cooldown = TUNING.hero[kind].attackCooldown * 1000;
  let shotAt = -Infinity;
  let landAt = Infinity;
  let landedAt = -Infinity;
  return {
    view,
    animate(now, dt) {
      if (now - shotAt >= cooldown) {
        shotAt = now;
        landAt = now + rig.shot(now, 0);
      }
      if (now >= landAt) {
        landedAt = now;
        landAt = Infinity;
        fx.meleeImpact(gx / 32, -0.2, 0);
        grunt.knock(now, 1, 0);
      }
      grunt.setFlash(now - landedAt < HIT_FLASH.ms ? HIT_FLASH.alpha : 0);
      grunt.update(0, 3, true, now);
      rig.update(pose, now, dt);
      fx.update(now, dt);
    },
  };
}

/**
 * A 3D hero's cycle (ms): stands, walks (turning round), fights (a blow or a shot every attack cooldown, an enemy in
 * reach), casts each active skill in turn (E is passive for every hero), is hit (the flinch and its flash), then dies
 * (the fall frames).
 */
const HERO3D = { walk: 1200, fight: 3600, cast: 6000, hit: 8700, die: 9800, cycle: 10800 } as const;
const HERO3D_CASTS: SkillSlot[] = ['Q', 'W', 'R'];
const HERO3D_CAST_EVERY = (HERO3D.hit - HERO3D.cast) / HERO3D_CASTS.length;
/** The first blow or shot comes this long into the fight (a Warden winds up first). */
const HERO3D_FIRST_SHOT = 300;

function hero3dActor(rig: HeroRig, kind: HeroKind): Actor {
  // The card scales this holder, as a match scales the rig's parent: the walk's cadence follows the drawn size.
  const view = new Container();
  view.addChild(rig.body);
  const pose = { x: 0, y: 0, facing: 0, stunned: false, engaged: false };
  const speed = TUNING.hero[kind].speed;
  const cooldown = TUNING.hero[kind].attackCooldown * 1000;
  let shot = -1;
  let cast = -1;
  let hitAt = -Infinity;
  return {
    view,
    animate(now, dt) {
      const n = Math.floor(now / HERO3D.cycle);
      const t = now % HERO3D.cycle;
      if (t >= HERO3D.die) {
        rig.die(Math.min(1, (t - HERO3D.die) / DEATH.hero.ms));
        return;
      }
      pose.engaged = t >= HERO3D.fight && t < HERO3D.cast;
      pose.facing = 0;
      if (t >= HERO3D.walk && t < HERO3D.fight) {
        const back = t >= (HERO3D.walk + HERO3D.fight) / 2;
        pose.facing = back ? Math.PI : 0;
        pose.x += (back ? -1 : 1) * speed * (dt / 1000);
      } else if (pose.engaged) {
        // The target moves a little, so the bow (or the swing) turns after it.
        pose.facing = Math.sin(now / 700) * 0.5;
        const k = Math.floor((t - HERO3D.fight - HERO3D_FIRST_SHOT) / cooldown);
        if (k >= 0 && shot !== n * 100 + k) {
          shot = n * 100 + k;
          rig.shot(now, pose.facing);
        }
      } else if (t >= HERO3D.cast && t < HERO3D.hit) {
        pose.facing = 0.3;
        const k = Math.floor((t - HERO3D.cast) / HERO3D_CAST_EVERY);
        if (cast !== n * HERO3D_CASTS.length + k) {
          cast = n * HERO3D_CASTS.length + k;
          rig.cast(now, HERO3D_CASTS[k]!);
        }
      } else if (t >= HERO3D.hit && now - hitAt > 450) {
        hitAt = now;
        rig.hit(now);
      }
      rig.update(pose, now, dt);
    },
  };
}

/**
 * A hero's lobby stage loop (docs/ART.md §15): the lobby's own backdrop (lobby/stageBackdrop.ts) on a stage the size
 * of a 412 px phone's home card, so it crops and scales the video as the lobby does. The poster shows at once, the
 * video (muted, looping, inline) fades in over it once it plays, and the poster stays when it can't (reduced
 * motion, data saver, autoplay blocked, an error). The stage says which it shows (`data-backdrop`).
 */
function stageCard(grid: HTMLElement, kind: HeroKind, name: string): void {
  const el = document.createElement('div');
  el.className = 'sc-card';
  el.dataset.stage = kind;
  el.innerHTML =
    `<div class="sc-hero-stage" style="width: ${LOBBY_STAGE.w}px; height: ${LOBBY_STAGE.h}px"></div>` +
    `<div class="sc-label"><b>${name}</b>` +
    `<span>stage · ${kind} · ${LOBBY_STAGE.w} × ${LOBBY_STAGE.h} (a 412 px phone's home card)</span></div>`;
  grid.appendChild(el);
  const backdrop = new StageBackdrop(el.querySelector('.sc-hero-stage') as HTMLElement, kind);
  backdrop.layout(LOBBY_STAGE);
  backdrop.start();
}

let sharedFxAtlas: FxAtlas | null = null;
function fxAtlas(): FxAtlas {
  return (sharedFxAtlas ??= createFxAtlas());
}

/** Creep cycle (ms): walks (turning round, flashing as if hit, frosted every other lap), then dies. */
const CREEP_WALK = 4500;
const CREEP_CYCLE = 5600;

function creepActor(rig: CreepRig, frame: string): Actor {
  const view = new Container();
  if (rig.shadow) view.addChild(rig.shadow);
  view.addChild(rig.body, rig.flash);
  let x = 0;
  let round = -1;
  return {
    view,
    animate(now, dt) {
      const n = Math.floor(now / CREEP_CYCLE);
      const cycle = now % CREEP_CYCLE;
      if (n !== round) {
        round = n;
        rig.reset();
        rig.setFrame(frame);
      }
      if (cycle >= CREEP_WALK) {
        rig.die(Math.min(1, (cycle - CREEP_WALK) / rig.deathMs));
        return;
      }
      x += (cycle < CREEP_WALK / 2 ? 1 : -1) * dt * 0.001;
      rig.update(x, 3, false, now);
      const f = cycle % 1400 < HIT_FLASH.ms ? HIT_FLASH.alpha : 0;
      rig.setFlash(f);
      rig.setTint(n % 2 === 1 ? mixColor(0xffffff, ICE, 0.8) : 0xffffff);
    },
  };
}

/**
 * A 3D creep's cycle (ms): walks (turning round, flashing as if hit, frosted every other lap), stops and fights, a boss
 * uses its ability, then it dies.
 */
const CREEP3D_WALK = 3000;
const CREEP3D_ABILITY = 4300;
const CREEP3D_DIE = 5600;
const CREEP3D_CYCLE = 6800;

function creep3dActor(rig: Creep3DRig, ether: boolean): Actor {
  const view = new Container();
  if (rig.shadow) view.addChild(rig.shadow);
  view.addChild(rig.body, rig.flash);
  // The Shardback's Ether hide raises its magic resist; that is all the rig reads.
  const hide = { magicResist: ether ? 1 : 0 } as CreepSnap;
  const speed = TUNING.creeps[rig.kind].speed;
  let x = 0;
  let round = -1;
  let used = -1;
  return {
    view,
    animate(now, dt) {
      const n = Math.floor(now / CREEP3D_CYCLE);
      const cycle = now % CREEP3D_CYCLE;
      if (n !== round) {
        round = n;
        rig.reset();
        rig.setVariant(hide);
      }
      if (cycle >= CREEP3D_DIE) {
        rig.die(Math.min(1, (cycle - CREEP3D_DIE) / rig.deathMs));
        return;
      }
      if (cycle < CREEP3D_WALK) x += (cycle < CREEP3D_WALK / 2 ? 1 : -1) * speed * dt * 0.001;
      if (cycle >= CREEP3D_ABILITY && used !== n) {
        used = n;
        rig.ability(now);
      }
      rig.setFlash(cycle % 1400 < HIT_FLASH.ms ? HIT_FLASH.alpha : 0);
      rig.setTint(n % 2 === 1 && cycle < CREEP3D_WALK ? mixColor(0xffffff, ICE, 0.8) : 0xffffff);
      rig.update(x, 3, false, now, 0);
    },
  };
}

/** The turret sweeps round and fires every 1.2 s: a recoil, or for a pulse (Blizzard) a swell all round. */
function towerActor(rig: TowerRigBase, kind: TowerKind, tier: number, branch: TowerBranch | null): Actor {
  rig.setTier(tier, branch);
  const pulses = towerStats(TUNING, kind, tier, branch).pulse;
  // The card scales the view after creating it; the pulse multiplies whatever that scale is.
  let scale0 = 0;
  return {
    view: rig.body,
    animate(now, dt) {
      rig.aim(Math.sin(now / 1500) * Math.PI, dt);
      if (pulses) {
        scale0 ||= rig.body.scale.x;
        const q = Math.min(1, (now % 1200) / 220);
        rig.body.scale.set(scale0 * (1 + Math.sin(q * Math.PI) * 0.12));
      } else {
        const r = Math.max(0, 1 - (now % 1200) / 140);
        rig.kick(r * r * 4.8);
      }
    },
  };
}

/** The Heart in a damage stage (0 whole, 1 cracked, 2 split open). */
function heartActor(kit: ArtKit, id: string, baseY: number, gemScale: number, gemY: number, floatPx: number, stage: number): Actor {
  const view = new Container();
  const base = kit.sprite(id, 'base');
  base.position.set(0, baseY);
  const gem = kit.sprite(id, 'gem');
  const cracks1 = kit.sprite(id, 'cracks1');
  const cracks2 = kit.sprite(id, 'cracks2');
  cracks1.alpha = stage >= 1 ? 1 : 0;
  cracks2.alpha = stage >= 2 ? 1 : 0;
  const flash = kit.sprite(id, 'gem.flash');
  view.addChild(base, gem, cracks1, cracks2, flash);
  const period = stage === 2 ? 650 : 1400;
  return {
    view,
    animate(now) {
      const t = (now % period) / period;
      const beat = Math.max(0, Math.sin(t * Math.PI * 4)) * (t < 0.25 ? 1 : t < 0.5 ? 0.6 : 0);
      const hit = Math.max(0, 1 - (now % 3000) / 420);
      for (const s of [gem, cracks1, cracks2, flash] as Sprite[]) {
        s.scale.set(gemScale * (1 + beat * 0.045 + hit * 0.12));
        s.y = gemY + Math.sin(now / 650) * floatPx;
      }
      flash.alpha = hit * 0.85;
    },
  };
}

/** The 3D Heart in a damage stage, beating, hit every 3 s, its flames flickering. */
function heart3dActor(view: Heart3DView, stage: number): Actor {
  view.setStage(stage);
  const period = stage === 2 ? 650 : 1400;
  return {
    view: view.root,
    animate(now) {
      const t = (now % period) / period;
      const beat = Math.max(0, Math.sin(t * Math.PI * 4)) * (t < 0.25 ? 1 : t < 0.5 ? 0.6 : 0);
      view.update(now, beat, Math.max(0, 1 - (now % 3000) / 420));
    },
  };
}

/** The 3D gatehouse with the 2D swirl in its opening, as in a match; with `flare`, it flares every 2 s. */
function portal3dActor(kit: ArtKit, id: string, gate: Portal3DView, flare: boolean): Actor {
  const view = new Container();
  const swirl = kit.sprite(id, 'swirl');
  const burst = kit.sprite(id, 'flare');
  burst.blendMode = 'add';
  burst.alpha = 0;
  for (const s of [swirl, burst]) s.position.set(gate.opening.x, gate.opening.y);
  swirl.scale.set(PORTAL_OPENING);
  view.addChild(gate.root, swirl, burst);
  return {
    view,
    animate: (now) => {
      swirl.rotation = -now / 500;
      gate.update(now, 0);
      if (!flare) return;
      const t = Math.min(1, (now % 2000) / 1100);
      burst.alpha = t >= 1 ? 0 : Math.min(1, t * 8) * (1 - t) * (1 - t);
      burst.scale.set((0.55 + t * 0.7) * PORTAL_FLARE);
      burst.rotation = t * 0.6;
    },
  };
}

/** A portal; with `flare`, it flares every 2 s as if a wave started. */
function portalActor(kit: ArtKit, id: string, flare: boolean): Actor {
  const view = new Container();
  const swirl = kit.sprite(id, 'swirl');
  const burst = kit.sprite(id, 'flare');
  burst.blendMode = 'add';
  burst.alpha = 0;
  view.addChild(kit.sprite(id, 'rim'), swirl, burst);
  return {
    view,
    animate: (now) => {
      swirl.rotation = -now / 500;
      if (!flare) return;
      const t = Math.min(1, (now % 2000) / 1100);
      burst.alpha = t >= 1 ? 0 : Math.min(1, t * 8) * (1 - t) * (1 - t);
      burst.scale.set(0.55 + t * 0.7);
      burst.rotation = t * 0.6;
    },
  };
}

/** A shot, weaving inside its card and facing the way it travels (the in-match aim). */
function projectileActor(kit: ArtKit, id: string): Actor {
  const view = new Container();
  const body = kit.sprite(id, 'body');
  view.addChild(body);
  return {
    view,
    animate(now) {
      const t = now / 520;
      const vx = Math.cos(t) * 16;
      const vy = Math.cos(t * 2) * 3;
      body.position.set(Math.sin(t) * 10, Math.sin(t * 2) * 3);
      body.rotation = Math.atan2(vy, vx);
    },
  };
}

/** One baked frame. `pulse` is the armed trap's glow breathing. */
function frameActor(kit: ArtKit, id: string, frame: string, pulse: boolean): Actor {
  const sprite = kit.sprite(id, frame);
  return {
    view: sprite,
    animate(now) {
      if (pulse) sprite.alpha = 0.84 + Math.sin(now / 260) * 0.16;
    },
  };
}

/** A prop frame (drawn into the ground in a match; a sprite here). */
function propActor(kit: ArtKit, id: string, frame: string): Actor {
  const view = new Container();
  view.addChild(kit.sprite(id, frame));
  return { view, animate: () => {} };
}

function padActor(kit: ArtKit, id: string, tint: number, rimAlpha: number, washAlpha: number): Actor {
  const view = new Container();
  const rim = kit.sprite(id, 'rim');
  const wash = kit.sprite(id, 'wash');
  rim.tint = wash.tint = tint;
  rim.alpha = rimAlpha;
  wash.alpha = washAlpha;
  view.addChild(kit.sprite(id, 'slab'), wash, rim);
  return { view, animate: () => {} };
}

const CSS = `
#showcase { position: fixed; inset: 0; z-index: 1000; overflow-y: auto; background: #0b0f14; color: #e8eef5;
  font: 14px system-ui, sans-serif; padding: 12px 12px 40px; touch-action: pan-y; user-select: none; }
#showcase h1 { font-size: 20px; margin: 4px 0; }
#showcase h2 { font-size: 16px; margin: 18px 0 8px; }
#showcase p { margin: 4px 0; color: #9fb0c2; }
#showcase .sc-canvas { position: fixed; inset: 0; pointer-events: none; z-index: 1001; }
#showcase .sc-display { margin: 8px 0; display: flex; gap: 6px; align-items: center; }
#showcase .sc-display button { font: inherit; padding: 6px 14px; border-radius: 16px; border: 1px solid #5a6b80; background: #16202b; color: #e8eef5; }
#showcase .sc-display button.active { background: #ffd24a; color: #111; border-color: #ffd24a; }
#showcase .sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
#showcase .sc-card { background: #16202b; border-radius: 10px; overflow: hidden; border: 1px solid #243242; }
#showcase .sc-stage { position: relative; height: 150px; }
#showcase .sc-label { padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
#showcase .sc-label span { color: #9fb0c2; font-size: 12px; }
#showcase .sc-stage-grid { grid-template-columns: repeat(auto-fill, ${LOBBY_STAGE.w}px); }
#showcase .sc-hero-stage { position: relative; overflow: hidden; background: #0f1d1a; }
#showcase .sc-hero-stage::after { content: attr(data-backdrop); position: absolute; right: 6px; bottom: 6px; z-index: 1;
  padding: 2px 8px; border-radius: 8px; background: rgba(11, 15, 20, 0.7); color: #c9d6e3; font-size: 11px; }
#showcase .sc-icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
#showcase .sc-icon { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 10px;
  background: linear-gradient(180deg, #1d2e28, #120f19); border: 1px solid #243242; }
#showcase .sc-icon i { width: 48px; height: 48px; background: var(--ico) center / contain no-repeat; flex: none; }
#showcase .sc-icon i.small { width: 24px; height: 24px; }
#showcase .sc-icon span { font-size: 11px; color: #9fb0c2; word-break: break-all; }
#showcase .sc-sound-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
#showcase .sc-sound-grid button { font: 12px system-ui, sans-serif; padding: 10px 6px; border-radius: 8px; border: 1px solid #243242;
  background: #16202b; color: #e8eef5; }
#showcase .sc-sound-grid button small { display: block; color: #7f91a4; font-size: 10px; margin-top: 2px; }
#showcase .sc-sound-grid button b { color: #f2c46d; font-weight: 600; font-size: 10px; }
#showcase .sc-music-now { color: #9fb0c2; font-size: 12px; margin-left: 6px; }
#showcase .sc-todo span { display: inline-block; padding: 3px 8px; margin: 2px; border-radius: 10px; background: #243242; color: #c9d6e3; }
`;
