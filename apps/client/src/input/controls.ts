// Mouse and keyboard controls (desktop). Turns input into protocol commands
// and client-only UI state; it never edits game state. Touch and pen input on
// the canvas belongs to `touch/touchControls.ts`, so this class ignores it.

import { TOWER_KINDS, type Command, type PlayerId, type SkillSlot, type Snapshot, type TowerKind } from '@tdt/protocol';
import { getMap, padAtTile, TILE_PX } from '@tdt/sim';
import { padStatus } from '../padInfo';
import { COLORS } from '../render/palette';
import type { WorldRenderer } from '../render/world';
import type { UiState } from '../uiState';
import type { Camera } from './camera';

const EDGE_PX = 12;
const PAN_SPEED = 900; // screen px per second
const WHEEL_ZOOM = 0.0015;

export interface ControlActions {
  send(cmd: Command): void;
  latest(): Snapshot | undefined;
  me(): PlayerId | null;
  openPadMenu(padId: number): void;
  openTowerPanel(towerId: number): void;
  closeMenus(): void;
  toast(text: string): void;
}

export class Controls {
  private keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private dragging = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly ui: UiState,
    private readonly renderer: WorldRenderer,
    private readonly actions: ControlActions,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointerup', (e) => {
      if (e.button === 1) this.dragging = false;
    });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    // Stop edge-scrolling once the pointer leaves the window.
    document.addEventListener('mouseout', (e) => {
      if (e.relatedTarget) return;
      this.pointer = null;
      this.ui.hover = null;
    });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
      this.pointer = null;
    });
  }

  /** Per-frame camera movement from arrow keys and screen edges. */
  update(dtMs: number): void {
    const step = (PAN_SPEED * dtMs) / 1000;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= step;
    if (this.keys.has('ArrowRight')) dx += step;
    if (this.keys.has('ArrowUp')) dy -= step;
    if (this.keys.has('ArrowDown')) dy += step;
    const p = this.pointer;
    if (p && !this.dragging) {
      if (p.x <= EDGE_PX) dx -= step;
      if (p.x >= this.camera.viewW - EDGE_PX) dx += step;
      if (p.y <= EDGE_PX) dy -= step;
      if (p.y >= this.camera.viewH - EDGE_PX) dy += step;
    }
    if (dx !== 0 || dy !== 0) this.camera.pan(dx, dy);
    // The world moves under a still pointer, so refresh the hover point.
    if (p) this.ui.hover = this.toTiles(p.x, p.y);
  }

  centerOnHero(): void {
    const hero = this.myHero();
    if (hero) this.camera.centerOn(hero.x * TILE_PX, hero.y * TILE_PX);
  }

  private myHero() {
    const snap = this.actions.latest();
    const me = this.actions.me();
    return snap?.heroes.find((h) => h.owner === me);
  }

  private toTiles(sx: number, sy: number): { x: number; y: number } {
    const w = this.camera.screenToWorld(sx, sy);
    return { x: w.x / TILE_PX, y: w.y / TILE_PX };
  }

  private marker(x: number, y: number, color: number): void {
    this.ui.markers.push({ x, y, color, born: performance.now() });
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const rect = this.canvas.getBoundingClientRect();
    const overCanvas = e.target === this.canvas;
    if (this.dragging) this.camera.pan(-e.movementX, -e.movementY);
    this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.ui.hover = overCanvas ? this.toTiles(this.pointer.x, this.pointer.y) : null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(Math.exp(-e.deltaY * WHEEL_ZOOM), e.clientX - rect.left, e.clientY - rect.top);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const rect = this.canvas.getBoundingClientRect();
    const at = this.toTiles(e.clientX - rect.left, e.clientY - rect.top);
    if (e.button === 1) {
      e.preventDefault();
      this.dragging = true;
      return;
    }
    if (e.button === 2) {
      this.onRightClick(at);
      return;
    }
    if (e.button === 0) this.onLeftClick(at);
  }

  private onRightClick(at: { x: number; y: number }): void {
    if (this.ui.mode.type !== 'none') {
      this.setMode({ type: 'none' });
      return;
    }
    const creep = this.renderer.pickCreep(at.x, at.y);
    if (creep) {
      this.actions.send({ type: 'attack', targetId: creep.id });
      this.marker(creep.x, creep.y, COLORS.bad);
    } else {
      this.actions.send({ type: 'move', x: at.x, y: at.y });
      this.marker(at.x, at.y, COLORS.good);
    }
  }

  private onLeftClick(at: { x: number; y: number }): void {
    const mode = this.ui.mode;
    if (mode.type === 'attackMove') {
      this.actions.send({ type: 'attackMove', x: at.x, y: at.y });
      this.marker(at.x, at.y, COLORS.bad);
      this.setMode({ type: 'none' });
      return;
    }
    if (mode.type === 'target') {
      this.actions.send({ type: 'cast', slot: mode.slot, x: at.x, y: at.y });
      this.marker(at.x, at.y, COLORS.root);
      this.setMode({ type: 'none' });
      return;
    }
    if (mode.type === 'build') {
      const pad = padAtTile(getMap(), Math.floor(at.x), Math.floor(at.y));
      const status = pad && padStatus(this.actions.latest(), this.actions.me(), pad.id);
      if (status?.kind === 'teammate') this.actions.toast(`That pad belongs to ${status.owner}`);
      else if (pad && status?.kind === 'mine') this.actions.send({ type: 'build', padId: pad.id, tower: mode.tower });
      else this.actions.toast('Towers go on build pads');
      this.setMode({ type: 'none' });
      return;
    }
    this.setMode({ type: 'none' });

    const snap = this.actions.latest();
    const tower = this.renderer.pickTower(at.x, at.y);
    if (tower) {
      this.ui.selectedPadId = null;
      this.ui.selectedTowerId = tower.id;
      this.actions.openTowerPanel(tower.id);
      return;
    }
    const pad = padAtTile(getMap(), Math.floor(at.x), Math.floor(at.y));
    const status = pad && padStatus(snap, this.actions.me(), pad.id);
    if (status?.kind === 'teammate') {
      this.clearSelection();
      this.actions.toast(`That pad belongs to ${status.owner}`);
      return;
    }
    if (pad && status?.kind === 'mine' && !snap?.towers.some((t) => t.padId === pad.id)) {
      this.ui.selectedTowerId = null;
      this.ui.selectedPadId = pad.id;
      this.actions.openPadMenu(pad.id);
      return;
    }
    this.clearSelection();
  }

  clearSelection(): void {
    this.ui.selectedPadId = null;
    this.ui.selectedTowerId = null;
    this.actions.closeMenus();
  }

  setMode(mode: UiState['mode']): void {
    this.ui.mode = mode;
  }

  /** Q/W/E/R: instant skills cast now, targeted skills wait for a left-click. */
  pressSkill(slot: SkillSlot): void {
    const hero = this.myHero();
    const skill = hero?.skills.find((s) => s.slot === slot);
    if (!hero || !skill) return;
    if (!hero.alive) return this.actions.toast('Hero is dead');
    if (skill.rank === 0) {
      const locked = skill.nextRankLevel > hero.level;
      return this.actions.toast(locked ? `Unlocks at level ${skill.nextRankLevel}` : 'Skill not learned — Shift+' + slot);
    }
    if (skill.passive) return this.actions.toast('Passive skill — always active');
    if (skill.cooldown > 0) return this.actions.toast('Skill on cooldown');
    if (hero.mana < skill.manaCost) return this.actions.toast('Not enough mana');
    if (skill.targeted) this.setMode({ type: 'target', slot });
    else this.actions.send({ type: 'cast', slot });
  }

  /** Shift+Q/W/E/R (or the HUD "+"): spend a skill point. The host re-checks everything. */
  learnSkill(slot: SkillSlot): void {
    const hero = this.myHero();
    const skill = hero?.skills.find((s) => s.slot === slot);
    if (!hero || !skill) return;
    if (!skill.learnable) {
      if (hero.skillPoints === 0) return this.actions.toast('No skill points');
      if (skill.rank >= skill.maxRank) return this.actions.toast('Skill at max rank');
      return this.actions.toast(`Needs hero level ${skill.nextRankLevel}`);
    }
    this.actions.send({ type: 'learn', slot });
  }

  /** Build hotkeys: build on the selected pad, or pick a tower to place. */
  pressBuild(tower: TowerKind): void {
    if (this.ui.selectedPadId !== null) {
      this.actions.send({ type: 'build', padId: this.ui.selectedPadId, tower });
      this.clearSelection();
      return;
    }
    this.setMode({ type: 'build', tower });
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      this.keys.add(e.key);
      return;
    }
    const key = e.key.toLowerCase();
    const mode = this.ui.mode;
    if (key >= '1' && key <= '9') {
      const tower = TOWER_KINDS[Number(key) - 1];
      if (tower && (mode.type === 'buildMenu' || mode.type === 'build' || this.ui.selectedPadId !== null)) {
        this.pressBuild(tower);
      }
      return;
    }
    switch (key) {
      case 'escape':
        this.setMode({ type: 'none' });
        this.clearSelection();
        break;
      case 'a':
        this.setMode({ type: 'attackMove' });
        break;
      case 'q':
      case 'w':
      case 'e':
      case 'r':
        if (e.shiftKey) this.learnSkill(key.toUpperCase() as SkillSlot);
        else this.pressSkill(key.toUpperCase() as SkillSlot);
        break;
      case 'b':
        this.setMode({ type: 'buildMenu' });
        break;
      case 's':
        this.actions.send({ type: 'stop' });
        break;
      case 'u':
        // Upgrade the selected tower (the sim rejects it if it isn't ours).
        if (this.ui.selectedTowerId !== null) this.actions.send({ type: 'upgrade', towerId: this.ui.selectedTowerId });
        break;
      case ' ':
        e.preventDefault();
        this.centerOnHero();
        break;
    }
  }
}
