// Portrait spike (?map=spire on a phone held upright): a control strip under
// the map with a fixed joystick and a skill arc (one thumb, or two thumbs
// either way round), smart casting, tap-to-select with snapping and a radial
// build menu. Throwaway exploration code.
//
// It listens on `window` in the capture phase and swallows canvas / control
// touches, so the desktop Controls never see them while the layout is active.

import type { Command, HeroSnap, PlayerId, SkillSlot, SkillSnap, Snapshot } from '@tdt/protocol';
import { TOWER_KINDS } from '@tdt/protocol';
import { getMap, TILE_PX, TUNING } from '@tdt/sim';
import type { Hud } from '../hud/hud';
import { buildCost } from '../hud/towerInfo';
import { MIN_ZOOM, type Camera } from '../input/camera';
import type { Controls } from '../input/controls';
import { COLORS, CREEP_NAMES, TOWER_NAMES } from '../render/palette';
import type { WorldRenderer } from '../render/world';
import type { UiState } from '../uiState';

/** Finger travel (screen px) before a touch counts as a drag. */
const TAP_SLOP = 10;
/** Skill drag distance (px) that aims at the skill's full range. */
const AIM_DRAG_PX = 90;
/** Taps snap to the nearest pad / tower / creep within this many screen px. */
const SNAP_PX = 44;
/** Two candidates closer than this (px) to each other's distance count as a tie: show the picker. */
const TIE_PX = 6;
const RADIAL_R = 74;
/** Joystick knob travel (px), dead zone (px), move point lookahead (tiles) and resend interval. */
const STICK_R = 42;
const STICK_DEAD = 8;
const STICK_AHEAD = 2.5;
const STICK_RESEND_MS = 100;
/** Creeps, towers and heroes are drawn this much larger in the portrait layout. */
const ENTITY_SCALE = 1.6;
/** Skill button and E badge diameters (px). */
const SKILL_PX = 64;
const BADGE_PX = 40;
/** Instant skills that buff the hero: smart cast always fires them. */
const SELF_BUFFS = new Set(['warden.R']);

export type ThumbLayout = 'one' | 'two' | 'twoLeft';
const LAYOUT_KEY = 'tdt.spike.layout';
const LAYOUT_NAMES: Record<ThumbLayout, string> = {
  one: 'One thumb',
  two: 'Two thumbs',
  twoLeft: 'Two thumbs, left-handed',
};

export interface PortraitDeps {
  canvas: HTMLCanvasElement;
  camera: Camera;
  ui: UiState;
  renderer: WorldRenderer;
  controls: Controls;
  hud: Hud;
  latest(): Snapshot | undefined;
  me(): PlayerId | null;
  send(cmd: Command): void;
}

interface Pt {
  x: number;
  y: number;
}

/** A tap candidate; `at` is its centre on screen, `d` the distance from the tap to its edge. */
type Pick =
  | { type: 'pad'; id: number; d: number; label: string; at: Pt }
  | { type: 'tower'; id: number; d: number; label: string; at: Pt }
  | { type: 'creep'; id: number; d: number; label: string; at: Pt; x: number; y: number };

/** Arrow pointing from the tap towards a candidate, so tied picker rows can be told apart. */
function arrowTo(from: Pt, to: Pt): string {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]!;
}

function loadLayout(): ThumbLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    if (v === 'one' || v === 'two' || v === 'twoLeft') return v;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'one';
}

export class PortraitMode {
  active = false;
  private layoutKind: ThumbLayout = loadLayout();
  /** A map touch: a tap unless it moves. */
  private mapTouch: { id: number; start: Pt; moved: boolean } | null = null;
  /** The joystick touch; `vec` is the knob offset from the base centre (px). */
  private stick: { id: number; vec: Pt } | null = null;
  private lastSend = 0;
  private lastDir = 0;
  /** A skill-button touch: a tap (smart cast) or, once dragged, a manual aim. */
  private aim: { slot: SkillSlot; id: number; start: Pt; moved: boolean; button: HTMLElement } | null = null;
  private radialPad: number | null = null;
  private radialKey = '';
  private placedKey = '';
  private readonly radial: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly joyBase: HTMLElement;
  private readonly joyKnob: HTMLElement;
  private readonly strip = document.getElementById('hero-panel')!;

  constructor(private readonly d: PortraitDeps) {
    document.body.classList.add('spire');
    const hud = document.getElementById('hud')!;
    const el = (id: string, className: string, parent: HTMLElement = hud) => {
      const e = document.createElement('div');
      e.id = id;
      e.className = className;
      parent.appendChild(e);
      return e;
    };
    this.radial = el('radial', 'radial hidden');
    this.picker = el('picker', 'picker popup hidden');
    this.settings = el('settings', 'settings popup hidden');
    this.joyBase = el('joy-base', 'joy', this.strip);
    this.joyKnob = el('joy-knob', 'joy-knob', this.joyBase);

    const gear = document.createElement('button');
    gear.id = 'settings-btn';
    gear.className = 'btn';
    gear.textContent = '⚙';
    gear.title = 'Settings';
    gear.addEventListener('click', () => this.toggleSettings());
    document.querySelector('.topbar')!.appendChild(gear);
    this.applyLayout(this.layoutKind);

    const opts = { capture: true, passive: false } as const;
    window.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    window.addEventListener('pointermove', (e) => this.onMove(e), opts);
    window.addEventListener('pointerup', (e) => this.onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    // Skill buttons are driven from pointer events here; drop their click so nothing fires twice.
    window.addEventListener(
      'click',
      (e) => {
        if (this.active && (e.target as Element | null)?.closest?.('#skills .skill')) e.stopPropagation();
      },
      true,
    );
    // No synthesized clicks from canvas / control touches: they would land on whatever a tap just opened.
    window.addEventListener(
      'touchstart',
      (e) => {
        const t = e.target as Element | null;
        if (this.active && (t === d.canvas || t?.closest?.('#skills .skill, #joy-base'))) e.preventDefault();
      },
      opts,
    );
    // iOS Safari ignores user-scalable=no; block its pinch-zoom gestures directly.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  // -------------------------------------------------------------------------
  // Layout, camera, settings
  // -------------------------------------------------------------------------

  /** Switches the portrait layout on or off with the phone's orientation. */
  private layout(): void {
    const on = window.innerHeight > window.innerWidth;
    const cam = this.d.camera;
    document.body.classList.toggle('portrait', on);
    if (on) {
      this.d.renderer.entityScale = ENTITY_SCALE;
      this.placedKey = '';
    } else if (this.active) {
      cam.minZoom = MIN_ZOOM;
      cam.insets = null;
      cam.zoom = Math.max(cam.zoom, MIN_ZOOM);
      cam.clamp();
      this.d.renderer.entityScale = 1;
      this.releaseStick();
      this.closeRadial();
      this.closePicker();
    }
    this.active = on;
  }

  /** The whole map, never under the top bar or the control strip: fit width and height. */
  private fitCamera(): void {
    const cam = this.d.camera;
    const top = document.querySelector('.topbar')!.getBoundingClientRect().bottom + 4;
    const bottom = window.innerHeight - this.strip.getBoundingClientRect().top + 4;
    const fit = Math.min(cam.viewW / cam.worldW, Math.max(1, cam.viewH - top - bottom) / cam.worldH);
    cam.minZoom = Math.min(MIN_ZOOM, fit);
    cam.zoom = fit;
    cam.insets = { top, bottom };
    cam.clamp();
  }

  private applyLayout(kind: ThumbLayout): void {
    this.layoutKind = kind;
    try {
      localStorage.setItem(LAYOUT_KEY, kind);
    } catch {
      // Not remembered; fine for a spike.
    }
    this.placedKey = '';
    this.renderSettings();
  }

  private toggleSettings(): void {
    this.settings.classList.toggle('hidden');
    this.renderSettings();
  }

  private renderSettings(): void {
    this.settings.innerHTML = '<h3>Layout</h3>';
    for (const kind of ['one', 'two', 'twoLeft'] as const) {
      const b = document.createElement('button');
      b.className = `btn${kind === this.layoutKind ? ' active' : ''}`;
      b.textContent = LAYOUT_NAMES[kind];
      b.addEventListener('click', () => {
        this.applyLayout(kind);
        this.settings.classList.add('hidden');
      });
      this.settings.appendChild(b);
    }
  }

  /** Positions the joystick, the skill arc and the E badge inside the strip for the chosen layout. */
  private placeControls(): void {
    const w = this.strip.clientWidth;
    const h = this.strip.clientHeight - parseFloat(getComputedStyle(this.strip).paddingBottom || '0');
    const wraps = new Map<SkillSlot, HTMLElement>();
    for (const b of this.strip.querySelectorAll<HTMLElement>('#skills .skill')) {
      const wrap = b.parentElement;
      if (wrap) wraps.set(b.dataset.slot as SkillSlot, wrap);
    }
    // The HUD rebuilds the skill buttons when the hero changes, so check each wrap, not just the key.
    const key = `${this.layoutKind}:${w}:${h}`;
    if (key === this.placedKey && [...wraps.values()].every((x) => x.dataset.placed === key)) return;
    this.placedKey = key;

    let stick: Pt;
    let spots: Record<SkillSlot, Pt>;
    if (this.layoutKind === 'one') {
      // Joystick bottom-centre; Q / W / R in an arc just above it, E as a badge to the right.
      stick = { x: w / 2, y: h - 66 };
      const r = 104;
      const at = (deg: number) => ({ x: stick.x + r * Math.cos((deg * Math.PI) / 180), y: stick.y - r * Math.sin((deg * Math.PI) / 180) });
      spots = { Q: at(155), W: at(90), R: at(25), E: { x: stick.x + 150, y: stick.y - 118 } };
    } else {
      // Joystick in one bottom corner, skills arcing around the other thumb.
      const mirror = this.layoutKind === 'twoLeft';
      const X = (x: number) => (mirror ? w - x : x);
      stick = { x: X(88), y: h - 82 };
      const pivot = { x: w - 42, y: h - 46 };
      const r = 118;
      const at = (deg: number) => ({ x: X(pivot.x + r * Math.cos((deg * Math.PI) / 180)), y: pivot.y - r * Math.sin((deg * Math.PI) / 180) });
      spots = { Q: at(180), W: at(135), R: at(90), E: { x: X(pivot.x), y: pivot.y } };
    }
    this.joyBase.style.left = `${stick.x}px`;
    this.joyBase.style.top = `${stick.y}px`;
    for (const [slot, wrap] of wraps) {
      const size = slot === 'E' ? BADGE_PX : SKILL_PX;
      const p = spots[slot];
      wrap.style.left = `${Math.round(p.x - size / 2)}px`;
      wrap.style.top = `${Math.round(p.y - size / 2)}px`;
      wrap.classList.toggle('badge', slot === 'E');
      wrap.dataset.placed = key;
    }
  }

  /** Called every frame: layout, camera, joystick commands and the radial menu. */
  update(): void {
    if (!this.active) return;
    this.placeControls();
    this.fitCamera();
    this.driveStick();
    this.updateRadial();
  }

  // -------------------------------------------------------------------------
  // Joystick
  // -------------------------------------------------------------------------

  private driveStick(): void {
    const s = this.stick;
    if (!s) return;
    const len = Math.hypot(s.vec.x, s.vec.y);
    if (len < STICK_DEAD) return;
    const hero = this.myHero();
    if (!hero?.alive) return;
    const dir = Math.atan2(s.vec.y, s.vec.x);
    const now = performance.now();
    const turned = Math.abs(Math.atan2(Math.sin(dir - this.lastDir), Math.cos(dir - this.lastDir))) > 0.25;
    if (!turned && now - this.lastSend < STICK_RESEND_MS) return;
    this.lastSend = now;
    this.lastDir = dir;
    this.d.send({ type: 'move', x: hero.x + (s.vec.x / len) * STICK_AHEAD, y: hero.y + (s.vec.y / len) * STICK_AHEAD });
  }

  private moveStick(e: PointerEvent): void {
    const r = this.joyBase.getBoundingClientRect();
    let vx = e.clientX - (r.left + r.width / 2);
    let vy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(vx, vy);
    if (len > STICK_R) {
      vx = (vx / len) * STICK_R;
      vy = (vy / len) * STICK_R;
    }
    this.stick!.vec = { x: vx, y: vy };
    this.joyKnob.style.transform = `translate(${vx}px, ${vy}px)`;
  }

  private releaseStick(): void {
    this.stick = null;
    this.joyKnob.style.transform = '';
    this.joyBase.classList.remove('held');
  }

  // -------------------------------------------------------------------------
  // Skills: tap = smart cast, drag = manual aim
  // -------------------------------------------------------------------------

  /** The skill if it can be cast now; otherwise shakes the button, says why and returns null. */
  private castable(slot: SkillSlot, button: HTMLElement): { hero: HeroSnap; skill: SkillSnap } | null {
    const hero = this.myHero();
    const skill = hero?.skills.find((s) => s.slot === slot);
    const fail = (why: string) => {
      this.shake(button);
      this.d.hud.toast(why);
      return null;
    };
    if (!hero || !skill) return null;
    if (!hero.alive) return fail('Hero is dead');
    if (skill.rank === 0) return fail(skill.nextRankLevel > hero.level ? `Unlocks at level ${skill.nextRankLevel}` : 'Tap + to learn');
    if (skill.passive) return fail('Passive — always active');
    if (skill.cooldown > 0) return fail('On cooldown');
    if (hero.mana < skill.manaCost) return fail('Not enough mana');
    return { hero, skill };
  }

  private shake(button: HTMLElement): void {
    button.classList.remove('shake');
    void button.offsetWidth;
    button.classList.add('shake');
  }

  /** Tap: instant skills fire, point skills hit the densest group in range, self-buffs cast on self. */
  private smartCast(slot: SkillSlot, button: HTMLElement): void {
    const ok = this.castable(slot, button);
    if (!ok) return;
    const { hero, skill } = ok;
    if (SELF_BUFFS.has(`${hero.kind}.${slot}`)) {
      this.d.send({ type: 'cast', slot });
      return;
    }
    const creeps = this.d.latest()?.creeps ?? [];
    const reach = (c: { kind: keyof typeof TUNING.creeps }) => TUNING.creeps[c.kind].radius;
    if (!skill.targeted) {
      const range = skill.range > 0 ? skill.range : skill.radius;
      const any = creeps.some((c) => Math.hypot(c.x - hero.x, c.y - hero.y) <= range + reach(c));
      if (any) this.d.send({ type: 'cast', slot });
      else this.shake(button);
      return;
    }
    const inRange = creeps.filter((c) => Math.hypot(c.x - hero.x, c.y - hero.y) <= skill.range);
    if (inRange.length === 0) return this.shake(button);
    const area = Math.max(1, skill.radius);
    let best = inRange[0]!;
    let bestCount = -1;
    for (const c of inRange) {
      const count = creeps.filter((o) => Math.hypot(o.x - c.x, o.y - c.y) <= area).length;
      if (count > bestCount) {
        best = c;
        bestCount = count;
      }
    }
    this.d.send({ type: 'cast', slot, x: best.x, y: best.y });
    this.marker(best.x, best.y, COLORS.root);
  }

  /** While dragging a point skill: the aim point, from the drag vector scaled to the skill's range. */
  private aimPoint(hero: HeroSnap, skill: SkillSnap, drag: Pt): Pt {
    const len = Math.hypot(drag.x, drag.y);
    const k = len > 0 ? (Math.min(1, len / AIM_DRAG_PX) * skill.range) / len : 0;
    return { x: hero.x + drag.x * k, y: hero.y + drag.y * k };
  }

  // -------------------------------------------------------------------------
  // Pointer input
  // -------------------------------------------------------------------------

  private onDown(e: PointerEvent): void {
    if (!this.active) return;
    const target = e.target as Element | null;
    if (!target?.closest?.('#settings, #settings-btn')) this.settings.classList.add('hidden');
    const skillBtn = target?.closest?.('#skills .skill') as HTMLElement | null;
    if (skillBtn) {
      e.stopPropagation();
      e.preventDefault();
      const slot = skillBtn.dataset.slot as SkillSlot | undefined;
      if (!slot || this.aim) return;
      const r = skillBtn.getBoundingClientRect();
      this.aim = { slot, id: e.pointerId, start: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, moved: false, button: skillBtn };
      return;
    }
    if (target?.closest?.('#joy-base')) {
      e.stopPropagation();
      e.preventDefault();
      if (this.stick) return;
      this.stick = { id: e.pointerId, vec: { x: 0, y: 0 } };
      this.lastSend = 0;
      this.joyBase.classList.add('held');
      this.moveStick(e);
      return;
    }
    if (target !== this.d.canvas) return;
    e.stopPropagation();
    e.preventDefault();
    if (this.mapTouch) return;
    this.mapTouch = { id: e.pointerId, start: this.screenPt(e), moved: false };
  }

  private onMove(e: PointerEvent): void {
    if (!this.active) return;
    // Keep touches away from the desktop Controls (edge scrolling, hover).
    if (e.pointerType !== 'mouse') e.stopPropagation();
    if (this.stick && e.pointerId === this.stick.id) {
      e.stopPropagation();
      this.moveStick(e);
      return;
    }
    const a = this.aim;
    if (a && e.pointerId === a.id) {
      e.stopPropagation();
      const drag = { x: e.clientX - a.start.x, y: e.clientY - a.start.y };
      if (!a.moved && Math.hypot(drag.x, drag.y) > TAP_SLOP) {
        if (!this.castable(a.slot, a.button)) {
          this.aim = null;
          return;
        }
        a.moved = true;
      }
      if (!a.moved) return;
      const hero = this.myHero();
      const skill = hero?.skills.find((s) => s.slot === a.slot);
      if (!hero || !skill) return;
      if (skill.targeted) {
        // Range ring around the hero and the area at the aim point (drawn by the renderer's targeting overlay).
        this.d.controls.setMode({ type: 'target', slot: a.slot });
        this.d.ui.hover = this.aimPoint(hero, skill, drag);
      }
      a.button.classList.toggle('cancel', this.overButton(e, a.button));
      return;
    }
    const t = this.mapTouch;
    if (t && e.pointerId === t.id) {
      e.stopPropagation();
      const p = this.screenPt(e);
      if (Math.hypot(p.x - t.start.x, p.y - t.start.y) > TAP_SLOP) t.moved = true;
    }
  }

  private overButton(e: PointerEvent, button: HTMLElement): boolean {
    const r = button.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  private onUp(e: PointerEvent): void {
    if (!this.active) return;
    if (this.stick && e.pointerId === this.stick.id) {
      e.stopPropagation();
      this.releaseStick();
      // Stop walking; the idle hero keeps shooting the nearest enemy in range.
      this.d.send({ type: 'stop' });
      return;
    }
    const a = this.aim;
    if (a && e.pointerId === a.id) {
      e.stopPropagation();
      this.aim = null;
      a.button.classList.remove('cancel');
      const hover = this.d.ui.hover;
      this.d.controls.setMode({ type: 'none' });
      this.d.ui.hover = null;
      if (e.type !== 'pointerup') return;
      if (!a.moved) return this.smartCast(a.slot, a.button);
      // Dragged back onto the button: cancel.
      if (this.overButton(e, a.button)) return;
      const hero = this.myHero();
      const skill = hero?.skills.find((s) => s.slot === a.slot);
      if (!skill) return;
      if (skill.targeted && hover) {
        this.d.send({ type: 'cast', slot: a.slot, x: hover.x, y: hover.y });
        this.marker(hover.x, hover.y, COLORS.root);
      } else if (!skill.targeted) {
        this.d.send({ type: 'cast', slot: a.slot });
      }
      return;
    }
    const t = this.mapTouch;
    if (t && e.pointerId === t.id) {
      e.stopPropagation();
      this.mapTouch = null;
      if (!t.moved && e.type === 'pointerup') this.tap(this.screenPt(e));
    }
  }

  // -------------------------------------------------------------------------
  // Map taps: select only
  // -------------------------------------------------------------------------

  /** A tap only selects: pad → build menu, own tower → tower panel, enemy → focus. It never moves the hero. */
  private tap(p: Pt): void {
    const { controls } = this.d;
    controls.clearSelection();
    this.closeRadial();
    this.closePicker();
    const picks = this.candidates(p);
    const first = picks[0];
    if (!first) return;
    const second = picks[1];
    if (second && second.d - first.d < TIE_PX) this.showPicker(p, picks.filter((c) => c.d - first.d < TIE_PX).slice(0, 4));
    else this.select(first);
  }

  /** Pads, own towers and creeps within SNAP_PX of the tap, nearest first (distance to their edge, screen px). */
  private candidates(p: Pt): Pick[] {
    const snap = this.d.latest();
    const me = this.d.me();
    const map = getMap();
    const zoomPx = this.d.camera.zoom * TILE_PX;
    const picks: Pick[] = [];
    const boxDist = (c: Pt, half: number) => {
      const h = half * zoomPx;
      return Math.hypot(Math.max(0, Math.abs(p.x - c.x) - h), Math.max(0, Math.abs(p.y - c.y) - h));
    };
    const built = new Set(snap?.towers.map((t) => t.padId));
    for (const pad of map.pads) {
      if (built.has(pad.id)) continue;
      const at = this.toScreen(pad.x, pad.y);
      const d = boxDist(at, map.padSize / 2);
      if (d <= SNAP_PX) picks.push({ type: 'pad', id: pad.id, d, label: 'Build pad', at });
    }
    for (const t of this.d.renderer.drawnTowerList()) {
      if (t.owner !== me) continue;
      const at = this.toScreen(t.x, t.y);
      const d = boxDist(at, map.padSize / 2);
      if (d <= SNAP_PX) picks.push({ type: 'tower', id: t.id, d, label: `${TOWER_NAMES[t.kind]} tower`, at });
    }
    for (const c of this.d.renderer.drawnCreepList()) {
      const at = this.toScreen(c.x, c.y);
      const r = TUNING.creeps[c.kind].radius * zoomPx * ENTITY_SCALE;
      const d = Math.max(0, Math.hypot(p.x - at.x, p.y - at.y) - r);
      if (d <= SNAP_PX) picks.push({ type: 'creep', id: c.id, d, label: CREEP_NAMES[c.kind], at, x: c.x, y: c.y });
    }
    return picks.sort((a, b) => a.d - b.d);
  }

  private select(pick: Pick): void {
    const { ui, hud } = this.d;
    if (pick.type === 'pad') {
      ui.selectedPadId = pick.id;
      this.radialPad = pick.id;
      this.radialKey = '';
    } else if (pick.type === 'tower') {
      ui.selectedTowerId = pick.id;
      hud.openTowerPanel(pick.id);
    } else {
      this.d.send({ type: 'attack', targetId: pick.id });
      this.marker(pick.x, pick.y, COLORS.bad);
    }
  }

  /** A tiny list next to the tap when two targets are equally close. */
  private showPicker(p: Pt, picks: Pick[]): void {
    this.picker.innerHTML = '';
    for (const pick of picks) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${arrowTo(p, pick.at)} ${pick.label}`;
      b.addEventListener('click', () => {
        this.closePicker();
        this.select(pick);
      });
      this.picker.appendChild(b);
    }
    this.picker.classList.remove('hidden');
    const w = this.picker.offsetWidth;
    const h = this.picker.offsetHeight;
    const x = Math.max(8, Math.min(this.d.camera.viewW - w - 8, p.x + 16));
    const y = Math.max(50, Math.min(this.stripTop() - h - 8, p.y - h / 2));
    this.picker.style.left = `${Math.round(x)}px`;
    this.picker.style.top = `${Math.round(y)}px`;
  }

  private closePicker(): void {
    this.picker.classList.add('hidden');
    this.picker.innerHTML = '';
  }

  // -------------------------------------------------------------------------
  // Radial build menu
  // -------------------------------------------------------------------------

  private updateRadial(): void {
    if (this.radialPad === null) return;
    const snap = this.d.latest();
    const pad = getMap().pads[this.radialPad];
    if (!snap || !pad || this.d.ui.selectedPadId !== pad.id || snap.towers.some((t) => t.padId === pad.id)) {
      this.closeRadial();
      return;
    }
    const gold = snap.players.find((p) => p.id === this.d.me())?.gold ?? 0;
    const key = `${pad.id}:${TOWER_KINDS.map((k) => gold >= buildCost(k)).join()}`;
    if (key !== this.radialKey) {
      this.radialKey = key;
      this.radial.innerHTML = '';
      TOWER_KINDS.forEach((kind, i) => {
        const a = -Math.PI / 2 + (i / TOWER_KINDS.length) * Math.PI * 2;
        const b = document.createElement('button');
        b.className = 'radial-btn';
        b.disabled = gold < buildCost(kind);
        b.style.transform = `translate(${Math.cos(a) * RADIAL_R}px, ${Math.sin(a) * RADIAL_R}px)`;
        b.innerHTML = `<span>${TOWER_NAMES[kind]}</span><span class="cost">${buildCost(kind)}</span>`;
        b.addEventListener('click', () => {
          this.d.send({ type: 'build', padId: pad.id, tower: kind });
          this.d.controls.clearSelection();
          this.closeRadial();
        });
        this.radial.appendChild(b);
      });
    }
    const cam = this.d.camera;
    const p = this.toScreen(pad.x, pad.y);
    const m = RADIAL_R + 34;
    const x = Math.max(m, Math.min(cam.viewW - m, p.x));
    const y = Math.max(m + 40, Math.min(this.stripTop() - m, p.y));
    this.radial.style.left = `${Math.round(x)}px`;
    this.radial.style.top = `${Math.round(y)}px`;
    this.radial.classList.remove('hidden');
  }

  private closeRadial(): void {
    this.radialPad = null;
    this.radialKey = '';
    this.radial.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private stripTop(): number {
    return this.strip.getBoundingClientRect().top;
  }

  private myHero(): HeroSnap | undefined {
    const me = this.d.me();
    return this.d.latest()?.heroes.find((h) => h.owner === me);
  }

  private toScreen(x: number, y: number): Pt {
    return this.d.camera.worldToScreen(x * TILE_PX, y * TILE_PX);
  }

  private screenPt(e: PointerEvent): Pt {
    const r = this.d.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private marker(x: number, y: number, color: number): void {
    this.d.ui.markers.push({ x, y, color, born: performance.now() });
  }
}
