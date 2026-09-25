// Portrait spike (?map=spire on a phone held upright): touch controls, a
// radial build menu and a Hero button. Throwaway exploration code.
//
// It listens on `window` in the capture phase and swallows canvas touches, so
// the desktop Controls never see them while the portrait layout is active.

import { TOWER_KINDS, type Command, type PlayerId, type SkillSlot, type Snapshot } from '@tdt/protocol';
import { getMap, padAtTile, TILE_PX } from '@tdt/sim';
import type { Hud } from '../hud/hud';
import { buildCost } from '../hud/towerInfo';
import { MIN_ZOOM, type Camera } from '../input/camera';
import type { Controls } from '../input/controls';
import { COLORS, TOWER_NAMES } from '../render/palette';
import type { WorldRenderer } from '../render/world';
import type { UiState } from '../uiState';

/** Finger travel (screen px) before a tap becomes a pan or an aim. */
const TAP_SLOP = 10;
/** Aim point sits this far above the finger so it stays visible. */
const AIM_OFFSET = 56;
/** Touch pick tolerance in screen px. */
const PICK_PX = 22;
const RADIAL_R = 74;

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

export class PortraitMode {
  active = false;
  private readonly pointers = new Map<number, Pt>();
  private gesture: 'none' | 'tap' | 'pan' | 'pinch' = 'none';
  private tapStart: Pt = { x: 0, y: 0 };
  private pinchDist = 1;
  private pinchMid: Pt = { x: 0, y: 0 };
  private aim: { slot: SkillSlot; id: number; start: Pt; moved: boolean } | null = null;
  private radialPad: number | null = null;
  private radialKey = '';
  /** Set by the first pan or pinch; until then the camera follows bar-size changes to keep the hero framed. */
  private touched = false;
  private readonly radial: HTMLElement;
  private readonly heroBtn: HTMLButtonElement;
  private readonly heroPanel = document.getElementById('hero-panel')!;

  constructor(private readonly d: PortraitDeps) {
    document.body.classList.add('spire');

    this.radial = document.createElement('div');
    this.radial.id = 'radial';
    this.radial.className = 'radial hidden';
    document.getElementById('hud')!.appendChild(this.radial);

    this.heroBtn = document.createElement('button');
    this.heroBtn.id = 'hero-btn';
    this.heroBtn.className = 'btn portrait-only';
    this.heroBtn.textContent = 'Hero';
    this.heroBtn.addEventListener('click', () => d.controls.centerOnHero());
    this.heroPanel.querySelector('.hero-head')!.appendChild(this.heroBtn);
    document.getElementById('portrait')!.addEventListener('click', () => d.controls.centerOnHero());

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
      const fit = cam.viewW / cam.worldW;
      cam.minZoom = Math.min(MIN_ZOOM, fit);
      this.measureBars();
      if (!this.active) {
        cam.zoom = fit;
        this.d.controls.centerOnHero();
      }
      cam.zoom = Math.max(cam.zoom, cam.minZoom);
      cam.clamp();
    } else if (this.active) {
      cam.minZoom = MIN_ZOOM;
      cam.insets = null;
      this.d.controls.heroOffsetY = 0;
      cam.zoom = Math.max(cam.zoom, MIN_ZOOM);
      cam.clamp();
      this.closeRadial();
    }
    this.active = on;
  }

  /** Tells the camera how much screen the top and bottom bars cover. Returns true if that changed. */
  private measureBars(): boolean {
    const top = document.querySelector('.topbar')!.getBoundingClientRect().bottom;
    const bottom = window.innerHeight - this.barTop();
    const cam = this.d.camera;
    if (cam.insets && Math.abs(cam.insets.top - top) < 1 && Math.abs(cam.insets.bottom - bottom) < 1) return false;
    cam.insets = { top, bottom };
    this.d.controls.heroOffsetY = (bottom - top) / 2;
    return true;
  }

  /** Called every frame: tracks the bar sizes, keeps the radial menu on its pad and in step with gold. */
  update(): void {
    if (!this.active) return;
    // The hero panel grows once the first snapshot fills in the skills.
    if (this.measureBars()) {
      if (!this.touched) this.d.controls.centerOnHero();
      this.d.camera.clamp();
    }
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

  private barTop(): number {
    return this.heroPanel.getBoundingClientRect().top;
  }

  private toTiles(p: Pt): Pt {
    const w = this.d.camera.screenToWorld(p.x, p.y);
    return { x: w.x / TILE_PX, y: w.y / TILE_PX };
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
    const p = this.screenPt(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.gesture = 'tap';
      this.tapStart = p;
    } else if (this.pointers.size === 2) {
      this.gesture = 'pinch';
      this.touched = true;
      this.startPinch();
    }
  }

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()] as [Pt, Pt];
    this.pinchDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    e.stopPropagation();
    this.pointers.set(e.pointerId, p);
    const cam = this.d.camera;
    if (this.gesture === 'tap' && Math.hypot(p.x - this.tapStart.x, p.y - this.tapStart.y) > TAP_SLOP) {
      this.gesture = 'pan';
      this.touched = true;
      cam.pan(this.tapStart.x - p.x, this.tapStart.y - p.y);
    } else if (this.gesture === 'pan' && this.pointers.size === 1) {
      cam.pan(prev.x - p.x, prev.y - p.y);
    } else if (this.gesture === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [Pt, Pt];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam.zoomAt(dist / this.pinchDist, mid.x, mid.y);
      cam.pan(this.pinchMid.x - mid.x, this.pinchMid.y - mid.y);
      this.pinchDist = dist;
      this.pinchMid = mid;
    }
  }

  private onUp(e: PointerEvent): void {
    if (!this.active) return;
    const p = this.screenPt(e);
    if (this.aim && e.pointerId === this.aim.id) {
      e.stopPropagation();
      const { slot, moved } = this.aim;
      this.aim = null;
      if (!moved) return; // A plain tap: stay in targeting mode, the next ground tap casts.
      const aimed = { x: p.x, y: p.y - AIM_OFFSET };
      if (e.type === 'pointerup' && p.y < this.barTop()) {
        const at = this.toTiles(aimed);
        this.d.send({ type: 'cast', slot, x: at.x, y: at.y });
        this.marker(at.x, at.y, COLORS.root);
      }
      this.d.controls.setMode({ type: 'none' });
      this.d.ui.hover = null;
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    e.stopPropagation();
    this.pointers.delete(e.pointerId);
    if (this.gesture === 'tap' && e.type === 'pointerup') this.tap(p);
    if (this.pointers.size === 0) this.gesture = 'none';
    else if (this.gesture === 'pinch') this.gesture = 'pan';
  }

  private tap(p: Pt): void {
    const { ui, controls, renderer, hud } = this.d;
    const at = this.toTiles(p);
    if (ui.mode.type === 'target') {
      this.d.send({ type: 'cast', slot: ui.mode.slot, x: at.x, y: at.y });
      this.marker(at.x, at.y, COLORS.root);
      controls.setMode({ type: 'none' });
      ui.hover = null;
      return;
    }
    // A tap outside an open menu just closes it.
    if (ui.selectedPadId !== null || ui.selectedTowerId !== null) {
      controls.clearSelection();
      this.closeRadial();
      return;
    }
    const slack = Math.min(1.5, PICK_PX / this.d.camera.zoom / TILE_PX);
    const tower = renderer.pickTower(at.x, at.y, 1 + slack / 2);
    if (tower) {
      ui.selectedTowerId = tower.id;
      hud.openTowerPanel(tower.id);
      return;
    }
    const snap = this.d.latest();
    const pad = padAtTile(getMap(), Math.floor(at.x), Math.floor(at.y));
    if (pad && !snap?.towers.some((t) => t.padId === pad.id)) {
      ui.selectedPadId = pad.id;
      this.radialPad = pad.id;
      this.radialKey = '';
      return;
    }
    const creep = renderer.pickCreep(at.x, at.y, slack);
    if (creep) {
      this.d.send({ type: 'attack', targetId: creep.id });
      this.marker(creep.x, creep.y, COLORS.bad);
      return;
    }
    this.d.send({ type: 'move', x: at.x, y: at.y });
    this.marker(at.x, at.y, COLORS.good);
  }
}
