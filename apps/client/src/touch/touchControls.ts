// Touch controls (docs/MOBILE.md §5): a fixed joystick and Q/W/E/R buttons drawn
// over the map, tap-to-select on the map with snapping and a tie picker, a radial
// build menu around pads and a radial ring around your towers. The rules are
// pure functions in `gestures.ts`; this file wires them to pointer events and DOM.
//
// Mouse input on the canvas stays with the desktop `Controls`; this class handles
// touch and pen on the canvas, and any pointer on its own buttons.

import {
  TOWER_KINDS,
  type Command,
  type HeroSnap,
  type PlayerId,
  type SkillSlot,
  type SkillSnap,
  type Snapshot,
  type TowerKind,
  type TowerSnap,
} from '@tdt/protocol';
import { getMap, TILE_PX, TUNING } from '@tdt/sim';
import { HERO_INFO, SMART_CAST } from '../heroInfo';
import { pulse } from '../hud/press';
import { buildCost, nextPriority, upgradeChip, upgradeCost, PRIORITY_NAMES } from '../hud/towerInfo';
import type { Camera } from '../input/camera';
import { clamp, type Layout, type Rect } from '../layout';
import { padStatus } from '../padInfo';
import { COLORS, CREEP_NAMES, TOWER_NAMES } from '../render/palette';
import type { WorldRenderer } from '../render/world';
import type { UiState } from '../uiState';
import {
  aimPoint,
  arrowTo,
  holdProgress,
  inOverlay,
  isCancelRelease,
  isDrag,
  placeRadial,
  radialSpots,
  resolveTap,
  shouldResendMove,
  smartCast,
  stickMoveTarget,
  stickVector,
  type Candidate,
  type Pt,
  type Scored,
  type StickVec,
} from './gestures';

/** Radial menus: ring radius and button diameter (px). */
const BUILD_RING_R = 72;
const BUILD_BTN = 58;
const TOWER_RING_R = 64;
const TOWER_BTN = 60;
/** Height reserved above a ring for its info chip (px). */
const CHIP_H = 30;
const SLOTS = ['Q', 'W', 'E', 'R'] as const;

export interface TouchActions {
  send(cmd: Command): void;
  latest(): Snapshot | undefined;
  me(): PlayerId | null;
  toast(text: string): void;
  learn(slot: SkillSlot): void;
  /** Clears the selection and closes every menu (desktop popups too). */
  clearSelection(): void;
}

interface SkillEl {
  wrap: HTMLElement;
  btn: HTMLButtonElement;
  learn: HTMLButtonElement;
  cd: HTMLElement;
  cdText: HTMLElement;
  pips: HTMLElement;
  key: string;
}

const FIRED_PULSE: Keyframe[] = [
  { boxShadow: '0 0 0 0 rgba(255, 255, 255, 0.95)', transform: 'scale(0.9)' },
  { boxShadow: '0 0 0 14px rgba(255, 255, 255, 0)', transform: 'none' },
];

type Menu = { type: 'build'; padId: number } | { type: 'tower'; towerId: number } | null;

export class TouchControls {
  private layout: Layout | null = null;
  private readonly overlay: HTMLElement;
  private readonly joy: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly respawn: HTMLElement;
  private readonly radial: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly skills = new Map<SkillSlot, SkillEl>();

  /** The joystick finger and its knob offset. */
  private stick: { id: number; vec: StickVec } | null = null;
  private lastMoveDir: number | null = null;
  private lastMoveAt = 0;
  /** A finger on a skill button: a tap (smart cast) or, once dragged, a manual aim. */
  private press: { slot: SkillSlot; id: number; start: Pt; drag: boolean; button: HTMLButtonElement } | null = null;
  /** A finger on the map: a tap unless it moves. */
  private mapTouch: { id: number; start: Pt; drag: boolean } | null = null;
  /** Hold-to-sell in progress. */
  private sellHold: { id: number; start: number; towerId: number; button: HTMLElement } | null = null;

  private menu: Menu = null;
  private menuKey = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly ui: UiState,
    private readonly renderer: WorldRenderer,
    private readonly actions: TouchActions,
  ) {
    const hud = document.getElementById('hud')!;
    const div = (className: string, parent: HTMLElement) => {
      const e = document.createElement('div');
      e.className = className;
      parent.appendChild(e);
      return e;
    };
    this.overlay = div('touch-overlay', hud);
    this.overlay.id = 'touch-overlay';
    this.joy = div('joy', this.overlay);
    this.joy.id = 'joystick';
    this.knob = div('joy-knob', this.joy);
    this.respawn = div('t-respawn hidden', this.overlay);
    for (const slot of SLOTS) this.skills.set(slot, this.createSkill(slot));
    this.radial = div('radial hidden', hud);
    this.radial.id = 'radial';
    this.chip = div('radial-chip hidden', hud);
    this.chip.id = 'radial-chip';
    this.picker = div('popup picker hidden', hud);
    this.picker.id = 'picker';

    this.joy.addEventListener('pointerdown', (e) => this.onStickDown(e));
    this.joy.addEventListener('pointermove', (e) => this.onStickMove(e));
    this.joy.addEventListener('pointerup', (e) => this.onStickUp(e));
    this.joy.addEventListener('pointercancel', (e) => this.onStickUp(e));
    this.joy.addEventListener('lostpointercapture', (e) => this.onStickUp(e));

    canvas.addEventListener('pointerdown', (e) => this.onMapDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMapMove(e));
    canvas.addEventListener('pointerup', (e) => this.onMapUp(e));
    canvas.addEventListener('pointercancel', () => (this.mapTouch = null));
    // No synthesized click after a map tap: it would land on the radial menu the tap just opened.
    canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    // Keep popups' touches away from the canvas below.
    for (const el of [this.radial, this.picker, this.overlay]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  setLayout(layout: Layout): void {
    this.layout = layout;
    const c = layout.controls;
    this.overlay.classList.toggle('hidden', !c);
    if (!c) {
      this.releaseStick(false);
      return;
    }
    const put = (el: HTMLElement, x: number, y: number, size: number) => {
      el.style.left = `${Math.round(x - size / 2)}px`;
      el.style.top = `${Math.round(y - size / 2)}px`;
      el.style.width = el.style.height = `${size}px`;
    };
    put(this.joy, c.joystick.x, c.joystick.y, c.joystick.r * 2);
    for (const slot of SLOTS) {
      const circle = c.skills[slot];
      put(this.skills.get(slot)!.wrap, circle.x, circle.y, circle.r * 2);
    }
    this.respawn.style.left = `${Math.round(c.joystick.x)}px`;
    this.respawn.style.top = `${Math.round(c.top - 24)}px`;
    this.menuKey = '';
  }

  /** A skill of my hero fired: its button flashes (Phase 4b feedback). */
  pulseSkill(slot: SkillSlot): void {
    const el = this.skills.get(slot);
    if (el && this.active) pulse(el.btn, FIRED_PULSE, 320);
  }

  /** The touch overlay is showing (phones, touch tablets). */
  get active(): boolean {
    return !!this.layout?.controls;
  }

  // -------------------------------------------------------------------------
  // Per frame
  // -------------------------------------------------------------------------

  update(now: number): void {
    const snap = this.actions.latest();
    const hero = this.myHero(snap);
    if (this.active && hero) this.updateSkills(hero, snap!.tickRate);
    this.driveStick(hero, now);
    this.updateHold(now);
    this.updateMenu(snap);
  }

  // -------------------------------------------------------------------------
  // Joystick
  // -------------------------------------------------------------------------

  private onStickDown(e: PointerEvent): void {
    e.preventDefault();
    if (this.stick) return;
    this.joy.setPointerCapture?.(e.pointerId);
    this.stick = { id: e.pointerId, vec: { dx: 0, dy: 0, mag: 0 } };
    this.lastMoveDir = null;
    this.joy.classList.add('held');
    this.onStickMove(e);
  }

  private onStickMove(e: PointerEvent): void {
    if (!this.stick || e.pointerId !== this.stick.id) return;
    const r = this.joy.getBoundingClientRect();
    const radius = r.width / 2;
    const v = stickVector({ x: r.left + radius, y: r.top + radius }, { x: e.clientX, y: e.clientY }, radius);
    this.stick.vec = v;
    this.knob.style.transform = `translate(${v.dx}px, ${v.dy}px)`;
  }

  private onStickUp(e: PointerEvent): void {
    if (!this.stick || e.pointerId !== this.stick.id) return;
    this.releaseStick(true);
  }

  private releaseStick(stop: boolean): void {
    const was = this.stick;
    this.stick = null;
    this.knob.style.transform = '';
    this.joy.classList.remove('held');
    // Stop walking; the hero keeps shooting whatever is in range.
    if (was && stop && this.lastMoveDir !== null) this.actions.send({ type: 'stop' });
    this.lastMoveDir = null;
  }

  private driveStick(hero: HeroSnap | undefined, now: number): void {
    const s = this.stick;
    if (!s || !hero?.alive) return;
    const r = this.joy.getBoundingClientRect().width / 2 || 50;
    const target = stickMoveTarget(hero, s.vec, r);
    if (!target) return;
    const dir = Math.atan2(s.vec.dy, s.vec.dx);
    if (!shouldResendMove(this.lastMoveDir, dir, this.lastMoveAt, now)) return;
    this.lastMoveDir = dir;
    this.lastMoveAt = now;
    this.actions.send({ type: 'move', x: target.x, y: target.y });
  }

  // -------------------------------------------------------------------------
  // Skill buttons: tap = smart cast, drag = manual aim, back on the button = cancel
  // -------------------------------------------------------------------------

  private createSkill(slot: SkillSlot): SkillEl {
    const wrap = document.createElement('div');
    wrap.className = `tskill${slot === 'E' ? ' badge' : ''}`;
    wrap.dataset.slot = slot;
    const btn = document.createElement('button');
    btn.className = 'tskill-btn';
    btn.innerHTML = `<span class="cd"></span><span class="letter">${slot}</span><span class="cd-text"></span><span class="pips"></span>`;
    const learn = document.createElement('button');
    learn.className = 'learn hidden';
    learn.textContent = '+';
    learn.setAttribute('aria-label', `Learn ${slot}`);
    wrap.append(btn, learn);
    this.overlay.appendChild(wrap);

    learn.addEventListener('pointerdown', (e) => e.stopPropagation());
    learn.addEventListener('click', () => this.actions.learn(slot));
    btn.addEventListener('pointerdown', (e) => this.onSkillDown(e, slot, btn));
    btn.addEventListener('pointermove', (e) => this.onSkillMove(e));
    btn.addEventListener('pointerup', (e) => this.onSkillUp(e, true));
    btn.addEventListener('pointercancel', (e) => this.onSkillUp(e, false));
    return {
      wrap,
      btn,
      learn,
      cd: btn.querySelector('.cd')!,
      cdText: btn.querySelector('.cd-text')!,
      pips: btn.querySelector('.pips')!,
      key: '',
    };
  }

  private updateSkills(hero: HeroSnap, tickRate: number): void {
    for (const skill of hero.skills) {
      const el = this.skills.get(skill.slot);
      if (!el) continue;
      const locked = skill.rank === 0;
      const noMana = !locked && !skill.passive && hero.mana < skill.manaCost;
      const cdFrac = skill.cooldownTotal > 0 ? skill.cooldown / skill.cooldownTotal : 0;
      const cdText = skill.cooldown > 0 ? String(Math.ceil(skill.cooldown / tickRate)) : '';
      const key = `${hero.kind}|${skill.rank}|${skill.maxRank}|${skill.learnable}|${noMana}|${hero.alive}|${cdText}|${Math.round(cdFrac * 50)}`;
      if (key === el.key) continue;
      el.key = key;
      el.wrap.classList.toggle('locked', locked);
      el.wrap.classList.toggle('no-mana', noMana);
      el.wrap.classList.toggle('dead', !hero.alive);
      el.wrap.classList.toggle('cooling', skill.cooldown > 0);
      el.learn.classList.toggle('hidden', !skill.learnable);
      el.cd.style.setProperty('--cd', `${cdFrac * 360}deg`);
      el.cdText.textContent = cdText;
      el.pips.innerHTML = Array.from({ length: skill.maxRank }, (_, i) => `<i class="${i < skill.rank ? 'on' : ''}"></i>`).join('');
      const text = HERO_INFO[hero.kind].skills[skill.slot];
      el.btn.setAttribute('aria-label', `${text.name} (${skill.slot})`);
      el.btn.title = `${text.name} — ${text.desc}`;
    }
    this.respawn.classList.toggle('hidden', hero.alive);
    if (!hero.alive) this.respawn.textContent = `Respawning in ${Math.ceil(hero.respawnIn / tickRate)}s`;
  }

  /** The skill if it can be cast now; otherwise shakes the button, says why and returns null. */
  private castable(slot: SkillSlot, button: HTMLElement): { hero: HeroSnap; skill: SkillSnap } | null {
    const hero = this.myHero(this.actions.latest());
    const skill = hero?.skills.find((s) => s.slot === slot);
    if (!hero || !skill) return null;
    const fail = (why: string) => {
      this.shake(button);
      this.actions.toast(why);
      return null;
    };
    if (skill.passive) return fail(`${HERO_INFO[hero.kind].skills[slot].name}: passive, always on`);
    if (!hero.alive) return fail('Hero is dead');
    if (skill.rank === 0) return fail(skill.nextRankLevel > hero.level ? `Unlocks at level ${skill.nextRankLevel}` : 'Tap + to learn it');
    if (skill.cooldown > 0) return fail('On cooldown');
    if (hero.mana < skill.manaCost) return fail('Not enough mana');
    return { hero, skill };
  }

  private shake(el: HTMLElement): void {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  private onSkillDown(e: PointerEvent, slot: SkillSlot, button: HTMLButtonElement): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.press) return;
    button.setPointerCapture?.(e.pointerId);
    this.press = { slot, id: e.pointerId, start: { x: e.clientX, y: e.clientY }, drag: false, button };
  }

  private onSkillMove(e: PointerEvent): void {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    const now = { x: e.clientX, y: e.clientY };
    if (!p.drag && isDrag(p.start, now)) {
      p.drag = true;
      if (!this.castable(p.slot, p.button)) {
        this.press = null;
        return;
      }
    }
    if (!p.drag) return;
    const hero = this.myHero(this.actions.latest());
    const skill = hero?.skills.find((s) => s.slot === p.slot);
    if (!hero || !skill) return;
    const r = p.button.getBoundingClientRect();
    const centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const at = aimPoint(hero, skill.range, { x: now.x - centre.x, y: now.y - centre.y });
    const cancel = isCancelRelease(now, r);
    this.ui.aim = { slot: p.slot, x: at.x, y: at.y, cancel };
    p.button.classList.toggle('cancel', cancel);
  }

  private onSkillUp(e: PointerEvent, released: boolean): void {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    const aim = this.ui.aim;
    this.ui.aim = null;
    p.button.classList.remove('cancel');
    if (!released) return;
    if (!p.drag) return this.smartCastSlot(p.slot, p.button);
    if (!aim || aim.cancel) return;
    const ok = this.castable(p.slot, p.button);
    if (!ok) return;
    if (ok.skill.targeted) {
      this.actions.send({ type: 'cast', slot: p.slot, x: aim.x, y: aim.y });
      this.marker(aim.x, aim.y, COLORS.root);
    } else {
      this.actions.send({ type: 'cast', slot: p.slot });
    }
  }

  /** Tap on a skill: instant skills fire, point skills hit the densest group in range, self-buffs cast on the hero. */
  private smartCastSlot(slot: SkillSlot, button: HTMLElement): void {
    const ok = this.castable(slot, button);
    if (!ok) return;
    const { hero, skill } = ok;
    const rule = SMART_CAST[hero.kind][slot] ?? { air: true };
    const creeps = (this.actions.latest()?.creeps ?? []).map((c) => ({ x: c.x, y: c.y, flying: TUNING.creeps[c.kind].flying }));
    const result = smartCast(hero, skill, rule, creeps, getMap().heart);
    if (result.type === 'none') {
      this.shake(button);
      this.actions.toast('Nothing in range');
    } else if (result.type === 'instant') {
      this.actions.send({ type: 'cast', slot });
    } else {
      this.actions.send({ type: 'cast', slot, x: result.x, y: result.y });
      this.marker(result.x, result.y, COLORS.root);
    }
  }

  // -------------------------------------------------------------------------
  // Map taps (touch and pen only; the mouse belongs to the desktop Controls)
  // -------------------------------------------------------------------------

  private onMapDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || this.mapTouch) return;
    this.mapTouch = { id: e.pointerId, start: this.screenPt(e), drag: false };
  }

  private onMapMove(e: PointerEvent): void {
    const t = this.mapTouch;
    if (!t || e.pointerId !== t.id) return;
    t.drag = isDrag(t.start, this.screenPt(e), t.drag);
  }

  private onMapUp(e: PointerEvent): void {
    const t = this.mapTouch;
    if (!t || e.pointerId !== t.id) return;
    this.mapTouch = null;
    if (!t.drag) this.tap(this.screenPt(e));
  }

  /** A tap selects: your pad → build menu, your tower → ring, an enemy → focus target. It never moves the hero. */
  tap(p: Pt): void {
    const c = this.layout?.controls;
    if (c && inOverlay(p, c.rects, this.layout?.kind === 'tall' ? c.top : null)) return;
    if (this.menu || !this.picker.classList.contains('hidden')) {
      // Tap anywhere else closes the open menu.
      this.actions.clearSelection();
      return;
    }
    const result = resolveTap(p, this.candidates());
    if (result.type === 'none') this.actions.clearSelection();
    else if (result.type === 'pick') this.select(result.pick);
    else this.showPicker(p, result.picks);
  }

  /** Pads of this match without a tower, towers and creeps, as tap candidates in screen px. */
  private candidates(): Candidate[] {
    const snap = this.actions.latest();
    if (!snap) return [];
    const map = getMap();
    const px = this.camera.zoom * TILE_PX;
    const out: Candidate[] = [];
    const built = new Set(snap.towers.map((t) => t.padId));
    for (const p of snap.pads) {
      const pad = map.pads[p.id];
      if (!pad || built.has(p.id)) continue;
      out.push({ kind: 'pad', id: p.id, at: this.toScreen(pad.x, pad.y), half: (map.padSize / 2) * px, shape: 'box' });
    }
    for (const t of this.renderer.drawnTowerList()) {
      out.push({ kind: 'tower', id: t.id, at: this.toScreen(t.x, t.y), half: (map.padSize / 2) * px, shape: 'box' });
    }
    for (const cr of this.renderer.drawnCreepList()) {
      const r = TUNING.creeps[cr.kind].radius * px * this.renderer.entityScale;
      out.push({ kind: 'creep', id: cr.id, at: this.toScreen(cr.x, cr.y), half: r, shape: 'circle' });
    }
    return out;
  }

  private select(pick: Candidate): void {
    if (pick.kind === 'pad') this.selectPad(pick.id);
    else if (pick.kind === 'tower') this.selectTower(pick.id);
    else {
      const creep = this.renderer.drawnCreepList().find((c) => c.id === pick.id);
      if (!creep) return;
      this.actions.clearSelection();
      this.actions.send({ type: 'attack', targetId: creep.id });
      this.marker(creep.x, creep.y, COLORS.bad);
    }
  }

  private selectPad(padId: number): void {
    const status = padStatus(this.actions.latest(), this.actions.me(), padId);
    this.actions.clearSelection();
    if (status.kind === 'teammate') return this.actions.toast(`That pad belongs to ${status.owner}`);
    if (status.kind !== 'mine') return;
    this.ui.selectedPadId = padId;
    this.openBuild(padId);
  }

  private selectTower(towerId: number): void {
    const snap = this.actions.latest();
    const tower = snap?.towers.find((t) => t.id === towerId);
    this.actions.clearSelection();
    if (!snap || !tower) return;
    this.ui.selectedTowerId = tower.id;
    if (tower.owner === this.actions.me()) {
      this.openTower(tower.id);
    } else {
      const owner = snap.players.find((p) => p.id === tower.owner)?.name ?? 'a teammate';
      this.actions.toast(`${owner}'s ${TOWER_NAMES[tower.kind]} tower (tier ${tower.tier})`);
    }
  }

  /** A tiny list next to the tap when two targets are equally close. */
  private showPicker(p: Pt, picks: Scored[]): void {
    this.actions.clearSelection();
    this.picker.innerHTML = '';
    const snap = this.actions.latest();
    for (const pick of picks) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${arrowTo(p, pick.at)} ${this.label(pick, snap)}`;
      b.addEventListener('click', () => {
        this.closePicker();
        this.select(pick);
      });
      this.picker.appendChild(b);
    }
    this.picker.classList.remove('hidden');
    const w = this.picker.offsetWidth;
    const h = this.picker.offsetHeight;
    const b = this.bounds();
    const bottom = this.layout?.kind === 'tall' && this.layout.controls ? this.layout.controls.top : b.bottom;
    this.picker.style.left = `${Math.round(clamp(p.x + 16, b.left + 4, b.right - w - 4))}px`;
    this.picker.style.top = `${Math.round(clamp(p.y - h / 2, b.top + 4, bottom - h - 8))}px`;
  }

  private label(pick: Candidate, snap: Snapshot | undefined): string {
    if (pick.kind === 'pad') return 'Build pad';
    if (pick.kind === 'tower') {
      const t = snap?.towers.find((x) => x.id === pick.id);
      return t ? `${TOWER_NAMES[t.kind]} tower` : 'Tower';
    }
    const c = this.renderer.drawnCreepList().find((x) => x.id === pick.id);
    return c ? CREEP_NAMES[c.kind] : 'Enemy';
  }

  private closePicker(): void {
    this.picker.classList.add('hidden');
    this.picker.innerHTML = '';
  }

  // -------------------------------------------------------------------------
  // Radial menus
  // -------------------------------------------------------------------------

  /** Radial build menu around a pad: the 5 towers with costs. First tap previews, second builds. */
  openBuild(padId: number): void {
    this.closeMenus();
    this.ui.selectedPadId = padId;
    this.menu = { type: 'build', padId };
  }

  /** Radial ring around your tower: Upgrade, Priority, Sell (hold). */
  openTower(towerId: number): void {
    this.closeMenus();
    this.ui.selectedTowerId = towerId;
    this.menu = { type: 'tower', towerId };
  }

  closeMenus(): void {
    this.menu = null;
    this.menuKey = '';
    this.ui.preview = null;
    this.sellHold = null;
    this.radial.classList.add('hidden');
    this.radial.innerHTML = '';
    this.chip.classList.add('hidden');
    this.closePicker();
  }

  get menuOpen(): boolean {
    return this.menu !== null;
  }

  private updateMenu(snap: Snapshot | undefined): void {
    const m = this.menu;
    if (!m) return;
    if (!snap) return this.actions.clearSelection();
    const gold = snap.players.find((p) => p.id === this.actions.me())?.gold ?? 0;
    const map = getMap();
    let anchor: { x: number; y: number };
    let extent: number;
    let chip = '';
    if (m.type === 'build') {
      const pad = map.pads[m.padId];
      if (!pad || this.ui.selectedPadId !== m.padId || snap.towers.some((t) => t.padId === m.padId)) return this.actions.clearSelection();
      if (padStatus(snap, this.actions.me(), m.padId).kind !== 'mine') return this.actions.clearSelection();
      anchor = pad;
      extent = BUILD_RING_R + BUILD_BTN / 2;
      const key = `b:${m.padId}:${this.ui.preview?.tower ?? ''}:${TOWER_KINDS.map((k) => gold >= buildCost(k)).join()}`;
      if (key !== this.menuKey) {
        this.menuKey = key;
        this.renderBuild(m.padId, gold);
      }
      const preview = this.ui.preview?.tower;
      chip = preview ? `${TOWER_NAMES[preview]}: tap again to build` : 'Build a tower';
    } else {
      const tower = snap.towers.find((t) => t.id === m.towerId);
      if (!tower || tower.owner !== this.actions.me() || this.ui.selectedTowerId !== m.towerId) return this.actions.clearSelection();
      anchor = tower;
      extent = TOWER_RING_R + TOWER_BTN / 2;
      const next = upgradeCost(tower.kind, tower.tier);
      const key = `t:${tower.id}:${tower.tier}:${tower.priority}:${next !== null && gold >= next}`;
      if (key !== this.menuKey) {
        this.menuKey = key;
        this.renderTowerRing(tower, gold);
      }
      const adds = upgradeChip(tower.kind, tower.tier);
      chip = `${TOWER_NAMES[tower.kind]} T${tower.tier}: ${adds || 'max tier'}`;
    }
    const at = placeRadial(this.toScreen(anchor.x, anchor.y), extent, CHIP_H, this.bounds());
    this.radial.style.left = `${Math.round(at.x)}px`;
    this.radial.style.top = `${Math.round(at.y)}px`;
    this.radial.classList.remove('hidden');
    if (this.chip.textContent !== chip) this.chip.textContent = chip;
    this.chip.classList.remove('hidden');
    // Centred over the ring, but never off screen.
    const half = this.chip.offsetWidth / 2;
    this.chip.style.left = `${Math.round(clamp(at.x, half + 4, this.camera.viewW - half - 4))}px`;
    this.chip.style.top = `${Math.round(at.y - extent - CHIP_H / 2 - 2)}px`;
  }

  private renderBuild(padId: number, gold: number): void {
    this.radial.innerHTML = '';
    this.radial.dataset.menu = 'build';
    const spots = radialSpots(TOWER_KINDS.length, BUILD_RING_R);
    TOWER_KINDS.forEach((kind, i) => {
      const cost = buildCost(kind);
      const armed = this.ui.preview?.padId === padId && this.ui.preview.tower === kind;
      const b = this.ringButton(spots[i]!, BUILD_BTN, `<span class="name">${TOWER_NAMES[kind]}</span><span class="cost">${cost}</span>`);
      b.dataset.tower = kind;
      b.classList.toggle('poor', gold < cost);
      b.classList.toggle('armed', armed);
      b.addEventListener('click', () => this.pickTower(padId, kind, b));
    });
  }

  private pickTower(padId: number, kind: TowerKind, button: HTMLElement): void {
    const armed = this.ui.preview?.padId === padId && this.ui.preview.tower === kind;
    if (!armed) {
      // First tap: preview the tower's range on the pad.
      this.ui.preview = { padId, tower: kind };
      this.menuKey = '';
      return;
    }
    const gold = this.actions.latest()?.players.find((p) => p.id === this.actions.me())?.gold ?? 0;
    if (gold < buildCost(kind)) {
      this.shake(button);
      this.actions.toast('Not enough gold');
      return;
    }
    this.actions.send({ type: 'build', padId, tower: kind });
    this.actions.clearSelection();
  }

  private renderTowerRing(tower: TowerSnap, gold: number): void {
    this.radial.innerHTML = '';
    this.radial.dataset.menu = 'tower';
    const [up, prio, sell] = [
      { x: 0, y: -TOWER_RING_R },
      { x: -TOWER_RING_R * 0.87, y: TOWER_RING_R * 0.5 },
      { x: TOWER_RING_R * 0.87, y: TOWER_RING_R * 0.5 },
    ];
    const next = upgradeCost(tower.kind, tower.tier);
    const upgrade = this.ringButton(
      up!,
      TOWER_BTN,
      next === null ? '<span class="name">Max</span><span class="cost">tier</span>' : `<span class="name">Upgrade</span><span class="cost">${next}</span>`,
    );
    upgrade.dataset.action = 'upgrade';
    upgrade.disabled = next === null;
    upgrade.classList.toggle('poor', next !== null && gold < next);
    upgrade.addEventListener('click', () => {
      if (next !== null && gold < next) {
        this.shake(upgrade);
        return this.actions.toast('Not enough gold');
      }
      this.actions.send({ type: 'upgrade', towerId: tower.id });
    });

    const priority = this.ringButton(prio!, TOWER_BTN, `<span class="cap">Target</span><span class="name">${PRIORITY_NAMES[tower.priority]}</span>`);
    priority.dataset.action = 'priority';
    priority.addEventListener('click', () => this.actions.send({ type: 'setPriority', towerId: tower.id, priority: nextPriority(tower.priority) }));

    const refund = Math.floor(tower.spent * TUNING.economy.sellRefund);
    const sellBtn = this.ringButton(sell!, TOWER_BTN, `<span class="hold"></span><span class="name">Sell</span><span class="cost">${refund}</span>`);
    sellBtn.dataset.action = 'sell';
    sellBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sellBtn.setPointerCapture?.(e.pointerId);
      this.sellHold = { id: e.pointerId, start: performance.now(), towerId: tower.id, button: sellBtn };
      sellBtn.classList.add('holding');
    });
    const release = (e: PointerEvent) => {
      if (!this.sellHold || this.sellHold.id !== e.pointerId) return;
      this.sellHold = null;
      sellBtn.classList.remove('holding');
      sellBtn.style.setProperty('--hold', '0deg');
      this.actions.toast('Hold Sell to sell');
    };
    sellBtn.addEventListener('pointerup', release);
    sellBtn.addEventListener('pointercancel', release);
  }

  private updateHold(now: number): void {
    const h = this.sellHold;
    if (!h) return;
    const { progress, done } = holdProgress(h.start, now);
    h.button.style.setProperty('--hold', `${progress * 360}deg`);
    if (!done) return;
    this.sellHold = null;
    this.actions.send({ type: 'sell', towerId: h.towerId });
    this.actions.clearSelection();
  }

  private ringButton(at: Pt, size: number, html: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'radial-btn';
    b.style.width = b.style.height = `${size}px`;
    b.style.left = `${Math.round(at.x - size / 2)}px`;
    b.style.top = `${Math.round(at.y - size / 2)}px`;
    b.innerHTML = html;
    this.radial.appendChild(b);
    return b;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Where popups may go: under the top bar, on screen, clear of the controls. */
  private bounds(): { left: number; top: number; right: number; bottom: number; avoid: readonly Rect[] } {
    const l = this.layout;
    return {
      left: 0,
      top: l?.kind === 'tall' ? l.topBarBottom : 0,
      right: this.camera.viewW,
      bottom: this.camera.viewH,
      avoid: l?.controls ? [...l.controls.rects, ...(l.kind === 'tall' ? [{ left: 0, top: l.controls.top, right: this.camera.viewW, bottom: this.camera.viewH }] : [])] : [],
    };
  }

  private myHero(snap: Snapshot | undefined): HeroSnap | undefined {
    const me = this.actions.me();
    return snap?.heroes.find((h) => h.owner === me);
  }

  private toScreen(x: number, y: number): Pt {
    return this.camera.worldToScreen(x * TILE_PX, y * TILE_PX);
  }

  private screenPt(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private marker(x: number, y: number, color: number): void {
    this.ui.markers.push({ x, y, color, born: performance.now() });
  }
}
