// Portrait spike (?map=spire on a phone held upright): floating joystick,
// tap-to-select with snapping, a radial build menu and skill drag-aiming.
// Throwaway exploration code.
//
// It listens on `window` in the capture phase and swallows canvas touches, so
// the desktop Controls never see them while the portrait layout is active.

import { TOWER_KINDS, type Command, type PlayerId, type SkillSlot, type Snapshot } from '@tdt/protocol';
import { getMap, TILE_PX, TUNING } from '@tdt/sim';
import type { Hud } from '../hud/hud';
import { buildCost } from '../hud/towerInfo';
import { MIN_ZOOM, type Camera } from '../input/camera';
import type { Controls } from '../input/controls';
import { COLORS, CREEP_NAMES, TOWER_NAMES } from '../render/palette';
import type { WorldRenderer } from '../render/world';
import type { UiState } from '../uiState';

/** Finger travel (screen px) before a touch becomes a joystick or an aim. */
const TAP_SLOP = 10;
/** Aim point sits this far above the finger so it stays visible. */
const AIM_OFFSET = 56;
/** Taps snap to the nearest pad / tower / creep within this many screen px. */
const SNAP_PX = 44;
/** Two candidates closer than this (px) to each other's distance count as a tie: show the picker. */
const TIE_PX = 6;
const RADIAL_R = 74;
/** Joystick: knob travel radius, dead zone (px), how far ahead the move point is (tiles), resend interval. */
const STICK_R = 50;
const STICK_DEAD = 8;
const STICK_AHEAD = 2.5;
const STICK_RESEND_MS = 100;
/** Creeps, towers and heroes are drawn this much larger in the portrait layout. */
const ENTITY_SCALE = 1.6;

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

export class PortraitMode {
  active = false;
  /** The one canvas touch we track: a tap until it moves, then a joystick. */
  private touch: { id: number; start: Pt; base: Pt; at: Pt; stick: boolean } | null = null;
  private lastSend = 0;
  private lastDir = 0;
  private aim: { slot: SkillSlot; id: number; start: Pt; moved: boolean } | null = null;
  private radialPad: number | null = null;
  private radialKey = '';
  private readonly radial: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly joyBase: HTMLElement;
  private readonly joyKnob: HTMLElement;
  private readonly heroPanel = document.getElementById('hero-panel')!;

  constructor(private readonly d: PortraitDeps) {
    document.body.classList.add('spire');
    const hud = document.getElementById('hud')!;
    const el = (id: string, className: string) => {
      const e = document.createElement('div');
      e.id = id;
      e.className = className;
      hud.appendChild(e);
      return e;
    };
    this.radial = el('radial', 'radial hidden');
    this.picker = el('picker', 'picker popup hidden');
    this.joyBase = el('joy-base', 'joy hidden');
    this.joyKnob = el('joy-knob', 'joy-knob hidden');

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
    // No synthesized clicks from canvas / skill touches: they would land on the menu a tap just opened.
    window.addEventListener(
      'touchstart',
      (e) => {
        const t = e.target as Element | null;
        if (this.active && (t === d.canvas || t?.closest?.('#skills .skill'))) e.preventDefault();
      },
      opts,
    );
    // iOS Safari ignores user-scalable=no; block its pinch-zoom gestures directly.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** Switches the portrait layout on or off with the phone's orientation. */
  private layout(): void {
    const on = window.innerHeight > window.innerWidth;
    const cam = this.d.camera;
    document.body.classList.toggle('portrait', on);
    if (on) {
      // The map's full width, always; no zooming in portrait.
      const fit = cam.viewW / cam.worldW;
      cam.minZoom = Math.min(MIN_ZOOM, fit);
      cam.zoom = fit;
      this.measureBars();
      this.d.renderer.entityScale = ENTITY_SCALE;
    } else if (this.active) {
      cam.minZoom = MIN_ZOOM;
      cam.insets = null;
      this.d.controls.heroOffsetY = 0;
      cam.zoom = Math.max(cam.zoom, MIN_ZOOM);
      cam.clamp();
      this.d.renderer.entityScale = 1;
      this.endTouch();
      this.closeRadial();
      this.closePicker();
    }
    this.active = on;
  }

  /** Tells the camera how much screen the top and bottom bars cover. */
  private measureBars(): void {
    const top = document.querySelector('.topbar')!.getBoundingClientRect().bottom;
    const bottom = window.innerHeight - this.barTop();
    this.d.camera.insets = { top, bottom };
    this.d.controls.heroOffsetY = (bottom - top) / 2;
  }

  /**
   * Called every frame: camera (whole map when it fits, else follow the hero
   * vertically), joystick commands and the radial menu.
   */
  update(): void {
    if (!this.active) return;
    this.measureBars();
    // Centring on the hero only moves the camera vertically (the width always fits), and the camera
    // clamp keeps the whole map centred when it fits between the bars.
    this.d.controls.centerOnHero();
    this.d.camera.clamp();
    this.driveStick();
    this.updateRadial();
  }

  private driveStick(): void {
    const t = this.touch;
    if (!t?.stick) return;
    const vx = t.at.x - t.base.x;
    const vy = t.at.y - t.base.y;
    const len = Math.hypot(vx, vy);
    if (len < STICK_DEAD) return;
    const hero = this.myHero();
    if (!hero?.alive) return;
    const dir = Math.atan2(vy, vx);
    const now = performance.now();
    const turned = Math.abs(Math.atan2(Math.sin(dir - this.lastDir), Math.cos(dir - this.lastDir))) > 0.25;
    if (!turned && now - this.lastSend < STICK_RESEND_MS) return;
    this.lastSend = now;
    this.lastDir = dir;
    this.d.send({ type: 'move', x: hero.x + (vx / len) * STICK_AHEAD, y: hero.y + (vy / len) * STICK_AHEAD });
  }

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
    const p = cam.worldToScreen(pad.x * TILE_PX, pad.y * TILE_PX);
    const m = RADIAL_R + 34;
    const x = Math.max(m, Math.min(cam.viewW - m, p.x));
    const y = Math.max(m + 40, Math.min(this.barTop() - m, p.y));
    this.radial.style.left = `${Math.round(x)}px`;
    this.radial.style.top = `${Math.round(y)}px`;
    this.radial.classList.remove('hidden');
  }

  private closeRadial(): void {
    this.radialPad = null;
    this.radialKey = '';
    this.radial.classList.add('hidden');
  }

  private closePicker(): void {
    this.picker.classList.add('hidden');
    this.picker.innerHTML = '';
  }

  private barTop(): number {
    return this.heroPanel.getBoundingClientRect().top;
  }

  private myHero() {
    const me = this.d.me();
    return this.d.latest()?.heroes.find((h) => h.owner === me);
  }

  private toTiles(p: Pt): Pt {
    const w = this.d.camera.screenToWorld(p.x, p.y);
    return { x: w.x / TILE_PX, y: w.y / TILE_PX };
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

  private onDown(e: PointerEvent): void {
    if (!this.active) return;
    const target = e.target as Element | null;
    const skillBtn = target?.closest?.('#skills .skill') as HTMLElement | null;
    if (skillBtn) {
      e.stopPropagation();
      e.preventDefault();
      const slot = skillBtn.dataset.slot as SkillSlot | undefined;
      if (!slot || this.aim) return;
      // Instant skills cast right away; targeted ones enter targeting mode, which the drag then aims.
      this.d.controls.pressSkill(slot);
      const mode = this.d.ui.mode;
      if (mode.type === 'target' && mode.slot === slot) {
        this.aim = { slot, id: e.pointerId, start: this.screenPt(e), moved: false };
      }
      return;
    }
    if (target !== this.d.canvas) return;
    e.stopPropagation();
    e.preventDefault();
    if (this.touch) return; // One finger drives the map; extra fingers are ignored.
    const p = this.screenPt(e);
    this.touch = { id: e.pointerId, start: p, base: p, at: p, stick: false };
  }

  private onMove(e: PointerEvent): void {
    if (!this.active) return;
    // Keep touches away from the desktop Controls (edge scrolling, hover).
    if (e.pointerType !== 'mouse') e.stopPropagation();
    const p = this.screenPt(e);
    if (this.aim && e.pointerId === this.aim.id) {
      e.stopPropagation();
      if (Math.hypot(p.x - this.aim.start.x, p.y - this.aim.start.y) > TAP_SLOP) this.aim.moved = true;
      if (this.aim.moved) this.d.ui.hover = this.toTiles({ x: p.x, y: p.y - AIM_OFFSET });
      return;
    }
    const t = this.touch;
    if (!t || e.pointerId !== t.id) return;
    e.stopPropagation();
    t.at = p;
    if (!t.stick && Math.hypot(p.x - t.start.x, p.y - t.start.y) > TAP_SLOP) {
      t.stick = true;
      this.lastSend = 0;
      this.closePicker();
    }
    if (!t.stick) return;
    // Floating stick: the base trails the finger once it goes past the knob's reach.
    const vx = p.x - t.base.x;
    const vy = p.y - t.base.y;
    const len = Math.hypot(vx, vy);
    if (len > STICK_R) t.base = { x: p.x - (vx / len) * STICK_R, y: p.y - (vy / len) * STICK_R };
    this.showStick(t.base, p);
  }

  private showStick(base: Pt, knob: Pt): void {
    this.joyBase.classList.remove('hidden');
    this.joyKnob.classList.remove('hidden');
    this.joyBase.style.transform = `translate(${base.x}px, ${base.y}px)`;
    this.joyKnob.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
  }

  private endTouch(): void {
    this.touch = null;
    this.joyBase.classList.add('hidden');
    this.joyKnob.classList.add('hidden');
  }

  private onUp(e: PointerEvent): void {
    if (!this.active) return;
    const p = this.screenPt(e);
    if (this.aim && e.pointerId === this.aim.id) {
      e.stopPropagation();
      const { slot, moved } = this.aim;
      this.aim = null;
      if (!moved) return; // A plain tap: stay in targeting mode, the next ground tap casts.
      if (e.type === 'pointerup' && p.y < this.barTop()) {
        const at = this.toTiles({ x: p.x, y: p.y - AIM_OFFSET });
        this.d.send({ type: 'cast', slot, x: at.x, y: at.y });
        this.marker(at.x, at.y, COLORS.root);
      }
      this.d.controls.setMode({ type: 'none' });
      this.d.ui.hover = null;
      return;
    }
    const t = this.touch;
    if (!t || e.pointerId !== t.id) return;
    e.stopPropagation();
    this.endTouch();
    // Letting go of the stick stops the hero; an idle hero attacks the nearest enemy in range.
    if (t.stick) this.d.send({ type: 'stop' });
    else if (e.type === 'pointerup') this.tap(p);
  }

  /** A tap only selects: pad → build menu, own tower → tower panel, enemy → focus. It never moves the hero. */
  private tap(p: Pt): void {
    const { ui, controls } = this.d;
    if (ui.mode.type === 'target') {
      const at = this.toTiles(p);
      this.d.send({ type: 'cast', slot: ui.mode.slot, x: at.x, y: at.y });
      this.marker(at.x, at.y, COLORS.root);
      controls.setMode({ type: 'none' });
      ui.hover = null;
      return;
    }
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
    const y = Math.max(50, Math.min(this.barTop() - h - 8, p.y - h / 2));
    this.picker.style.left = `${Math.round(x)}px`;
    this.picker.style.top = `${Math.round(y)}px`;
  }
}
