// Touch controls (docs/MOBILE.md §5): a floating stick (a drag anywhere on the map
// walks; the default) or a fixed joystick, Q/W/E/R buttons drawn over the map,
// tap-to-select on the map with snapping and a tie picker, a radial build menu
// around pads and a radial ring around your towers. Taps and holds are told apart
// by the events' own timestamps, so a stalled frame does not turn a tap into a
// hold. The rules are pure functions in `gestures.ts`; this file wires them to
// pointer events and DOM.
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
  type TowerBranch,
  type TowerKind,
  type TowerSnap,
} from '@tdt/protocol';
import { getMap, repairCost, TILE_PX, towerRangeScale, tuningForMode, TUNING } from '@tdt/sim';
import { HERO_INFO, SMART_CAST } from '../heroInfo';
import { pulse } from '../hud/press';
import { skillFace } from '../hud/skillFace';
import { skillSheetRows } from '../hud/skillSheet';
import { addUltCueParts, applyUltCues } from '../hud/ultFace';
import type { UltCues } from '../ult/cues';
import {
  BRANCH_BLURBS,
  branchChoices,
  branchOfferChip,
  buildCost,
  buildPreviewChip,
  nextPriority,
  towerName,
  upgradeChip,
  upgradeCost,
  PRIORITY_NAMES,
} from '../hud/towerInfo';
import type { Camera } from '../input/camera';
import { clamp, type Layout, type Rect } from '../layout';
import { padStatus } from '../padInfo';
import { iconVar, skillIcon, towerIcon, type IconId } from '../render/art/icons';
import { COLORS, CREEP_NAMES, TOWER_NAMES } from '../render/palette';
import type { WorldRenderer } from '../render/world';
import type { UiState } from '../uiState';
import {
  aimPoint,
  arrowTo,
  BUILD_PREVIEW_MS,
  buildPress,
  FLOAT_R,
  floatStick,
  holdProgress,
  holdReached,
  inOverlay,
  isCancelRelease,
  isDrag,
  mapPing,
  mapTouchKind,
  pingRelease,
  placeChip,
  placeRadial,
  pressLength,
  radialSpots,
  resolveTap,
  SELL_HOLD_MS,
  shouldResendMove,
  SKILL_INFO_MS,
  skillRelease,
  smartCast,
  STICK_FEELS,
  stickKnobOffset,
  stickMoveTarget,
  stickVector,
  type StickFeel,
  type StickFeelName,
  type Candidate,
  type MapTouchKind,
  type Pt,
  type Scored,
  type StickVec,
} from './gestures';

/** Radial menus: ring radius and button diameter (px). */
const BUILD_RING_R = 72;
const BUILD_BTN = 58;
const TOWER_RING_R = 64;
const TOWER_BTN = 60;
/** A damaged tower's Repair button sits below the ring, a little further out so it clears Target and Sell. */
const REPAIR_SPOT = { x: 0, y: Math.round(TOWER_RING_R * 1.1) };
const SLOTS = ['Q', 'W', 'E', 'R'] as const;

export interface TouchActions {
  send(cmd: Command): void;
  latest(): Snapshot | undefined;
  me(): PlayerId | null;
  toast(text: string): void;
  learn(slot: SkillSlot): void;
  /** Clears the selection and closes every menu (desktop popups too). */
  clearSelection(): void;
  /** Where your hero is drawn (predicted while it walks), if anywhere. */
  heroAt(): { x: number; y: number } | null;
}

interface SkillEl {
  wrap: HTMLElement;
  btn: HTMLButtonElement;
  learn: HTMLButtonElement;
  /** The skill's code-drawn icon (render/art/icons.ts). */
  ico: HTMLElement;
  cd: HTMLElement;
  cdText: HTMLElement;
  cost: HTMLElement;
  pips: HTMLElement;
  key: string;
}

/** An icon element for a radial button. */
const ico = (id: IconId) => `<i class="ico" style="--ico: ${iconVar(id)}"></i>`;

const FIRED_PULSE: Keyframe[] = [
  { boxShadow: '0 0 0 0 rgba(127, 252, 216, 0.9)', transform: 'scale(0.9)' },
  { boxShadow: '0 0 0 14px rgba(127, 252, 216, 0)', transform: 'none' },
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
  private readonly sheet: HTMLElement;

  /**
   * The finger steering the hero: its knob offset, the base radius (px) and, for the floating stick, where the base
   * is now (it appears where the drag started and trails the thumb). `base` is null on the fixed joystick.
   */
  private stick: { id: number; vec: StickVec; r: number; base: Pt | null } | null = null;
  private stickFeel: StickFeel = STICK_FEELS.normal;
  private lastMoveDir: number | null = null;
  private lastMoveAt = 0;
  /**
   * A finger on a skill button: a tap (smart cast), a drag aim, or a hold that opened the description. `at` is the
   * pointerdown's `timeStamp`; the release decides tap or hold from the pointerup's.
   */
  private press: {
    slot: SkillSlot;
    id: number;
    start: Pt;
    at: number;
    drag: boolean;
    info: boolean;
    sheetWasOpen: boolean;
    button: HTMLButtonElement;
  } | null = null;
  /**
   * A finger on the map: a tap unless it moves, a ping when lifted after a still hold, or (floating stick) the stick
   * once it moves. `start` is canvas px, `client` viewport px (where the stick's base goes), `at` the down `timeStamp`.
   */
  private mapTouch: { id: number; start: Pt; client: Pt; kind: MapTouchKind; at: number; dismiss: boolean } | null = null;
  /** The last frame's time, to tell a frame that follows a stall (a hold is not decided on it). */
  private lastFrame = 0;
  /** Grows under a still finger until the ping fires. */
  private readonly pingHold: HTMLElement;
  /** The open tower ring's Repair button (its cost changes as the tower takes hits; updated in place). */
  private repairBtn: HTMLButtonElement | null = null;
  /** Hold-to-sell in progress (`start` is the pointerdown's `timeStamp`). */
  private sellHold: { id: number; start: number; towerId: number; button: HTMLElement } | null = null;
  /** A finger on a build button: a quick tap builds; held, it previews the tower and lifting does not build (`start`: down `timeStamp`). */
  private buildHold: { id: number; start: number; startPt: Pt; drag: boolean; padId: number; kind: TowerKind; button: HTMLElement } | null = null;

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
    this.sheet = div('skill-sheet hidden', hud);
    this.sheet.id = 'skill-sheet';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-label', 'Skills');
    this.sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.radial = div('radial hidden', hud);
    this.radial.id = 'radial';
    this.chip = div('radial-chip hidden', hud);
    this.chip.id = 'radial-chip';
    this.picker = div('popup picker hidden', hud);
    this.picker.id = 'picker';
    this.pingHold = div('ping-hold hidden', hud);

    this.joy.addEventListener('pointerdown', (e) => this.onStickDown(e));
    this.joy.addEventListener('pointermove', (e) => this.onStickMove(e));
    this.joy.addEventListener('pointerup', (e) => this.onStickUp(e));
    this.joy.addEventListener('pointercancel', (e) => this.onStickUp(e));
    this.joy.addEventListener('lostpointercapture', (e) => this.onStickUp(e));

    canvas.addEventListener('pointerdown', (e) => this.onMapDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMapMove(e));
    canvas.addEventListener('pointerup', (e) => this.onMapUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onMapCancel(e));
    canvas.addEventListener('lostpointercapture', (e) => this.onMapCancel(e));
    // No synthesized click after a map tap: it would land on the radial menu the tap just opened.
    canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    // Keep popups' touches away from the canvas below.
    for (const el of [this.radial, this.picker, this.overlay]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /** How far the thumb travels before full speed, from ⚙ → Stick feel. */
  setStick(feel: StickFeelName): void {
    this.stickFeel = STICK_FEELS[feel];
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
    const c = layout.controls;
    this.overlay.classList.toggle('hidden', !c);
    if (!c) {
      this.releaseStick(false);
      this.closeSkillSheet();
      return;
    }
    // The floating stick's resting base is a hint: touches on it fall through to the map, where a drag steers.
    this.overlay.classList.toggle('floating', c.floating);
    if (this.stick && (this.stick.base !== null) !== c.floating) this.releaseStick(true);
    const put = (el: HTMLElement, x: number, y: number, size: number) => {
      el.style.left = `${Math.round(x - size / 2)}px`;
      el.style.top = `${Math.round(y - size / 2)}px`;
      el.style.width = el.style.height = `${size}px`;
    };
    if (!this.stick?.base) this.putJoy(c.joystick.x, c.joystick.y, c.joystick.r);
    for (const slot of SLOTS) {
      const circle = c.skills[slot];
      put(this.skills.get(slot)!.wrap, circle.x, circle.y, circle.r * 2);
    }
    this.respawn.style.top = `${Math.round(c.top - 24)}px`;
    this.menuKey = '';
  }

  private putJoy(x: number, y: number, r: number): void {
    const size = r * 2;
    this.joy.style.left = `${Math.round(x - size / 2)}px`;
    this.joy.style.top = `${Math.round(y - size / 2)}px`;
    this.joy.style.width = this.joy.style.height = `${size}px`;
    this.respawn.style.left = `${Math.round(x)}px`;
  }

  /** A skill of my hero fired: its button flashes (Phase 4b feedback). */
  pulseSkill(slot: SkillSlot): void {
    const el = this.skills.get(slot);
    if (el && this.active) pulse(el.btn, FIRED_PULSE, 320);
  }

  /** The R button's pulse (ready for 20 s of a wave) and "Combo!" ring (a teammate's ultimate fuses with yours). */
  setUltCues(cues: UltCues): void {
    const el = this.skills.get('R');
    if (el) applyUltCues(el.wrap, cues);
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
    // A frame long after the last one follows a stall: holds wait for the next frame, by when a queued lift has run.
    const gap = this.lastFrame > 0 ? now - this.lastFrame : 0;
    this.lastFrame = now;
    if (this.active && hero) this.updateSkills(hero, snap!.tickRate);
    this.driveStick(hero, now);
    this.updateHold(now, gap);
    this.updateBuildHold(now, gap);
    this.updatePing(now);
    this.updateSkillInfo(now, gap);
    this.updateMenu(snap);
  }

  // -------------------------------------------------------------------------
  // Joystick
  // -------------------------------------------------------------------------

  private onStickDown(e: PointerEvent): void {
    e.preventDefault();
    if (this.stick || this.layout?.controls?.floating) return;
    this.joy.setPointerCapture?.(e.pointerId);
    this.stick = { id: e.pointerId, vec: { dx: 0, dy: 0, mag: 0 }, r: this.layout?.controls?.joystick.r ?? 50, base: null };
    this.lastMoveDir = null;
    this.joy.classList.add('held');
    this.onStickMove(e);
  }

  private onStickMove(e: PointerEvent): void {
    if (!this.stick || e.pointerId !== this.stick.id || this.stick.base) return;
    const r = this.joy.getBoundingClientRect();
    const radius = r.width / 2;
    const v = stickVector({ x: r.left + radius, y: r.top + radius }, { x: e.clientX, y: e.clientY }, radius);
    this.stick.vec = v;
    const knob = stickKnobOffset(v, radius, this.stickFeel.full);
    this.knob.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
    // Steer at once rather than on the next frame: the move leaves now and the hero is drawn walking
    // from the next frame (own-hero prediction).
    this.driveStick(this.myHero(this.actions.latest()), performance.now());
  }

  private onStickUp(e: PointerEvent): void {
    if (!this.stick || e.pointerId !== this.stick.id || this.stick.base) return;
    this.releaseStick(true);
  }

  /**
   * A map touch moved past the tap slop with the floating stick: it steers from now on. The base appears where the
   * touch started (trailing the thumb if it is already further), an open ring or picker closes, and the touch is no
   * longer a tap or a ping. The map stays free for a second finger.
   */
  private startFloat(e: PointerEvent, t: { client: Pt }): void {
    this.mapTouch = null;
    this.pingHold.classList.add('hidden');
    if (this.menu || !this.picker.classList.contains('hidden') || this.ui.emoteOpen) this.actions.clearSelection();
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // The pointer is already gone; its pointerup ends the stick.
    }
    const { base, vec } = floatStick(t.client, { x: e.clientX, y: e.clientY }, FLOAT_R);
    this.stick = { id: e.pointerId, vec, r: FLOAT_R, base };
    this.lastMoveDir = null;
    this.joy.classList.add('held');
    this.drawFloat();
    this.driveStick(this.myHero(this.actions.latest()), performance.now());
  }

  private onFloatMove(e: PointerEvent): void {
    const s = this.stick;
    if (!s?.base) return;
    const next = floatStick(s.base, { x: e.clientX, y: e.clientY }, s.r);
    s.base = next.base;
    s.vec = next.vec;
    this.drawFloat();
    this.driveStick(this.myHero(this.actions.latest()), performance.now());
  }

  /** The floating base under the thumb, its knob towards the thumb (a full push looks full). */
  private drawFloat(): void {
    const s = this.stick;
    if (!s?.base) return;
    this.putJoy(s.base.x, s.base.y, s.r);
    const knob = stickKnobOffset(s.vec, s.r, this.stickFeel.full);
    this.knob.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
  }

  private releaseStick(stop: boolean): void {
    const was = this.stick;
    this.stick = null;
    this.knob.style.transform = '';
    this.joy.classList.remove('held');
    // Stop walking; the hero keeps shooting whatever is in range.
    if (was && stop && this.lastMoveDir !== null) this.actions.send({ type: 'stop' });
    this.lastMoveDir = null;
    // The floating base goes back to its resting place.
    const rest = this.layout?.controls?.joystick;
    if (was?.base && rest) this.putJoy(rest.x, rest.y, rest.r);
  }

  /** The joystick is held (the hero is being steered). */
  get steering(): boolean {
    return this.stick !== null;
  }

  /** Stick is past the dead zone, so its direction is the hero's whole velocity. */
  private stickSteers(): boolean {
    const s = this.stick;
    if (!s) return false;
    return stickMoveTarget({ x: 0, y: 0 }, s.vec, s.r, undefined, this.stickFeel) !== null;
  }

  /** A point cast stops the hero's walk in the sim: while steering, resend the move on the next frame. */
  private castAt(slot: SkillSlot, at: { x: number; y: number }): void {
    this.actions.send({ type: 'cast', slot, x: at.x, y: at.y });
    if (this.stick) this.lastMoveDir = null;
  }

  private driveStick(hero: HeroSnap | undefined, now: number): void {
    const s = this.stick;
    if (!s || !hero?.alive) return;
    // Aim from where the hero is drawn (ahead of the snapshots while it walks), so the prediction and
    // the server head for the same point.
    const target = stickMoveTarget(this.actions.heroAt() ?? hero, s.vec, s.r, undefined, this.stickFeel);
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
    wrap.className = `tskill${slot === 'E' ? ' badge' : slot === 'R' ? ' ult' : ''}`;
    wrap.dataset.slot = slot;
    const btn = document.createElement('button');
    btn.className = 'tskill-btn';
    btn.innerHTML = `<i class="ico"></i><span class="cd"></span><span class="letter">${slot}</span><span class="cd-text"></span><span class="pips"></span>`;
    const learn = document.createElement('button');
    learn.className = 'learn hidden';
    learn.textContent = '+';
    learn.setAttribute('aria-label', `Learn ${slot}`);
    // Q / W: the mana cost, a badge on the lower-left edge (the learn "+" sits on the upper right).
    const cost = document.createElement('span');
    cost.className = 'cost';
    wrap.append(btn, learn, cost);
    if (slot === 'R') addUltCueParts(wrap);
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
      ico: btn.querySelector('.ico')!,
      cd: btn.querySelector('.cd')!,
      cdText: btn.querySelector('.cd-text')!,
      cost,
      pips: btn.querySelector('.pips')!,
      key: '',
    };
  }

  private updateSkills(hero: HeroSnap, tickRate: number): void {
    for (const skill of hero.skills) {
      const el = this.skills.get(skill.slot);
      if (!el) continue;
      const f = skillFace(hero, skill, tickRate);
      const key =
        `${hero.kind}|${skill.rank}|${skill.maxRank}|${skill.learnable}|${f.noMana}|${f.cost}|${f.ready}|` +
        `${hero.alive}|${f.cdText}|${f.waitingMana}|${Math.round(f.cooldown * 50)}`;
      if (key === el.key) continue;
      el.key = key;
      el.ico.style.setProperty('--ico', iconVar(skillIcon(hero.kind, skill.slot)));
      el.wrap.classList.toggle('locked', f.locked);
      el.wrap.classList.toggle('no-mana', f.noMana);
      el.wrap.classList.toggle('dead', !hero.alive);
      el.wrap.classList.toggle('cooling', skill.cooldown > 0);
      el.wrap.classList.toggle('ready', f.ready);
      el.wrap.classList.toggle('waiting-mana', f.waitingMana);
      el.learn.classList.toggle('hidden', !skill.learnable);
      // Q / W: a dark sweep over the button. R: a ring that fills up as the cooldown runs out.
      el.cd.style.setProperty('--cd', `${(f.ultimate ? 1 - f.cooldown : f.cooldown) * 360}deg`);
      el.cdText.textContent = f.cdText;
      el.cost.textContent = f.cost;
      el.cost.classList.toggle('hidden', f.cost === '');
      el.pips.innerHTML = Array.from({ length: skill.maxRank }, (_, i) => `<i class="${i < skill.rank ? 'on' : ''}"></i>`).join('');
      const text = HERO_INFO[hero.kind].skills[skill.slot];
      // No title tooltip: a phone does not hover, and a long-press opens the sheet instead.
      el.btn.setAttribute('aria-label', `${text.name} (${skill.slot}). ${text.desc}. Hold to read.`);
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
    this.press = {
      slot,
      id: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      at: e.timeStamp,
      drag: false,
      info: false,
      sheetWasOpen: !this.sheet.classList.contains('hidden'),
      button,
    };
  }

  private onSkillMove(e: PointerEvent): void {
    const p = this.press;
    if (!p || e.pointerId !== p.id || p.info) return;
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
    // Tap or hold from the press's real length (the events' timestamps), not from when the frames ran.
    const what = skillRelease({
      pressMs: pressLength(p.at, e.timeStamp),
      drag: p.drag,
      sheetWasOpen: p.sheetWasOpen,
      infoOpened: p.info,
      cancel: !aim || aim.cancel,
    });
    if (what.type === 'none') return;
    if (what.type === 'read') {
      // A real hold whose frame never came (the page stalled): open the card now.
      if (!p.info) this.openSkillSheet(p.slot);
      return;
    }
    // The sheet is for reading. A tap on a skill while it is open switches the row and does not cast.
    if (what.type === 'showRow') return this.openSkillSheet(p.slot);
    if (what.type === 'cast') {
      // A late frame opened the card under a quick tap: close it, then cast.
      if (what.closeSheet) this.closeSkillSheet();
      return this.smartCastSlot(p.slot, p.button);
    }
    if (!aim) return;
    const ok = this.castable(p.slot, p.button);
    if (!ok) return;
    if (ok.skill.targeted) {
      this.castAt(p.slot, aim);
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
      this.castAt(slot, result);
      this.marker(result.x, result.y, COLORS.root);
    }
  }

  // -------------------------------------------------------------------------
  // Map taps (touch and pen only; the mouse belongs to the desktop Controls)
  // -------------------------------------------------------------------------

  private onMapDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || this.mapTouch) return;
    const start = this.screenPt(e);
    // An open menu is dismissed by the release; that press is not a ping.
    const dismiss = this.menu !== null || !this.picker.classList.contains('hidden') || this.ui.emoteOpen;
    this.mapTouch = { id: e.pointerId, start, client: { x: e.clientX, y: e.clientY }, kind: 'press', at: e.timeStamp, dismiss };
  }

  private onMapMove(e: PointerEvent): void {
    if (this.stick?.base && e.pointerId === this.stick.id) return this.onFloatMove(e);
    const t = this.mapTouch;
    if (!t || e.pointerId !== t.id) return;
    // Distance, not time, decides: past the tap slop the touch is the floating stick (or, with a fixed stick, a
    // drag that does nothing). Either way it never selects, pings or presses a button it passes over.
    t.kind = mapTouchKind(t.start, this.screenPt(e), t.kind, !!this.layout?.controls?.floating, this.stick === null);
    if (t.kind === 'stick') this.startFloat(e, t);
  }

  private onMapUp(e: PointerEvent): void {
    if (this.stick?.base && e.pointerId === this.stick.id) return this.releaseStick(true);
    const t = this.mapTouch;
    if (!t || e.pointerId !== t.id) return;
    this.cancelMap();
    if (t.kind !== 'press') return;
    // A still hold pings when the finger lifts, measured by the events' timestamps; anything shorter is a tap.
    if (!t.dismiss && pingRelease(pressLength(t.at, e.timeStamp), false)) return this.ping(t.start);
    this.tap(this.screenPt(e));
  }

  private onMapCancel(e: PointerEvent): void {
    if (this.stick?.base && e.pointerId === this.stick.id) this.releaseStick(true);
    if (this.mapTouch?.id === e.pointerId) this.cancelMap();
  }

  private cancelMap(): void {
    this.mapTouch = null;
    this.pingHold.classList.remove('ready');
    this.pingHold.classList.add('hidden');
  }

  /** A ping where a still hold was let go, unless it was in the control overlay. */
  private ping(at: Pt): void {
    const c = this.layout?.controls;
    if (c && inOverlay(at, c.rects, this.layout?.kind === 'tall' ? c.top : null)) return;
    const w = this.camera.screenToWorld(at.x, at.y);
    this.actions.send({ type: 'ping', x: w.x / TILE_PX, y: w.y / TILE_PX });
  }

  /** A still finger on the map grows a ring; once it is full, lifting pings. A drag or an open menu never pings. */
  private updatePing(now: number): void {
    const t = this.mapTouch;
    const c = this.layout?.controls;
    if (!t || t.dismiss || t.kind !== 'press' || (c && inOverlay(t.start, c.rects, this.layout?.kind === 'tall' ? c.top : null))) {
      this.pingHold.classList.add('hidden');
      return;
    }
    const { progress, ping } = mapPing(now - t.at, false);
    if (progress <= 0) {
      this.pingHold.classList.add('hidden');
      return;
    }
    this.pingHold.classList.remove('hidden');
    this.pingHold.classList.toggle('ready', ping);
    this.pingHold.style.left = `${t.start.x}px`;
    this.pingHold.style.top = `${t.start.y}px`;
    this.pingHold.style.setProperty('--p', String(0.35 + progress * 0.65));
  }

  /** A still hold on a skill opens the description sheet and does not cast (unless the release shows it was a tap). */
  private updateSkillInfo(now: number, gap: number): void {
    const p = this.press;
    if (!p || p.drag || p.info) return;
    if (!holdReached(p.at, now, gap, SKILL_INFO_MS)) return;
    p.info = true;
    this.ui.aim = null;
    p.button.classList.remove('cancel');
    this.openSkillSheet(p.slot);
  }

  /** The description sheet: every skill, readable at phone size. `slot` scrolls that row into view. */
  private openSkillSheet(slot: SkillSlot | null): void {
    const hero = this.myHero(this.actions.latest());
    if (!hero) return;
    const snap = this.actions.latest();
    const rows = skillSheetRows(hero.kind, hero.skills, snap?.tickRate ?? 20);
    const info = HERO_INFO[hero.kind];
    this.sheet.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'skill-sheet-head';
    const title = document.createElement('h2');
    title.textContent = `${info.name} skills`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.closeSkillSheet());
    head.append(title, close);
    this.sheet.appendChild(head);
    const list = document.createElement('div');
    list.className = 'skill-sheet-list';
    let focus: HTMLElement | null = null;
    for (const row of rows) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'skill-sheet-row';
      el.dataset.slot = row.slot;
      if (row.slot === slot) el.classList.add('on');
      el.innerHTML = `<span class="slot">${row.slot}</span><span class="name">${row.name}</span><span class="desc">${row.desc}</span><span class="meta">${row.meta}</span>`;
      el.addEventListener('click', () => this.openSkillSheet(row.slot));
      list.appendChild(el);
      if (row.slot === slot) focus = el;
    }
    this.sheet.appendChild(list);
    const hint = document.createElement('p');
    hint.className = 'skill-sheet-hint';
    hint.textContent = 'Hold a skill button to open this card. Close it, then tap a skill to cast or drag it to aim.';
    this.sheet.appendChild(hint);
    this.sheet.classList.remove('hidden');
    const top = this.layout?.kind === 'tall' ? this.layout.topBarBottom : 8;
    this.sheet.style.top = `${Math.round(top + 8)}px`;
    if (focus) list.scrollTop = Math.max(0, focus.offsetTop - 8);
  }

  private closeSkillSheet(): void {
    this.sheet.classList.add('hidden');
    this.sheet.innerHTML = '';
  }

  /** A tap selects: your pad → build menu, your tower → ring, an enemy → focus target. It never moves the hero. */
  tap(p: Pt): void {
    const c = this.layout?.controls;
    if (c && inOverlay(p, c.rects, this.layout?.kind === 'tall' ? c.top : null)) return;
    if (!this.sheet.classList.contains('hidden')) {
      this.closeSkillSheet();
      return;
    }
    if (this.menu || !this.picker.classList.contains('hidden') || this.ui.emoteOpen) {
      // Tap anywhere else closes the open menu (the build ring, the picker, or quick chat).
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
      // Stick past the dead zone owns movement. A tap must not start a chase that fights the stick.
      if (this.stickSteers()) return;
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
      this.actions.toast(`${owner}'s ${towerName(tower.kind, tower.branch, TOWER_NAMES)} tower (tier ${tower.tier})`);
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
      return t ? `${towerName(t.kind, t.branch, TOWER_NAMES)} tower` : 'Tower';
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

  /** Radial build menu around a pad: the 5 towers with costs. A tap builds; a hold previews the range. */
  openBuild(padId: number): void {
    this.closeMenus();
    this.ui.selectedPadId = padId;
    this.menu = { type: 'build', padId };
  }

  /** Radial ring around your tower: Upgrade, Priority, Sell (hold), and Repair while it is damaged. */
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
    this.repairBtn = null;
    this.buildHold = null;
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
      // Rendered once per pad: a re-render under a held finger would drop its press.
      const key = `b:${m.padId}`;
      if (key !== this.menuKey) {
        this.menuKey = key;
        this.renderBuild(m.padId);
      }
      for (const b of this.radial.querySelectorAll<HTMLElement>('.radial-btn[data-tower]')) {
        const kind = b.dataset.tower as TowerKind;
        b.classList.toggle('poor', gold < buildCost(kind));
        b.classList.toggle('previewing', this.ui.preview?.padId === m.padId && this.ui.preview.tower === kind);
      }
      const preview = this.ui.preview?.tower;
      chip = preview ? buildPreviewChip(preview, TOWER_NAMES, TUNING, towerRangeScale(snap.modifiers, TUNING)) : 'Tap to build · hold to preview';
    } else {
      const tower = snap.towers.find((t) => t.id === m.towerId);
      if (!tower || tower.owner !== this.actions.me() || this.ui.selectedTowerId !== m.towerId) return this.actions.clearSelection();
      anchor = tower;
      const repair = repairCost(tuningForMode(TUNING, snap.mode), tower);
      extent = repair > 0 ? REPAIR_SPOT.y + TOWER_BTN / 2 : TOWER_RING_R + TOWER_BTN / 2;
      const next = upgradeCost(tower.kind, tower.tier);
      const choices = branchChoices(tower.kind, tower.tier, tower.branch);
      const affordable = [next ?? Infinity, ...choices.map((c) => c.cost)].map((c) => gold >= c).join();
      const key = `t:${tower.id}:${tower.tier}:${tower.branch}:${tower.priority}:${affordable}:${repair > 0}`;
      if (key !== this.menuKey) {
        this.menuKey = key;
        this.renderTowerRing(tower, gold);
      }
      // The price follows the HP; update it in place so the button isn't rebuilt under the finger.
      if (this.repairBtn) {
        const cost = this.repairBtn.querySelector<HTMLElement>('.cost');
        if (cost && cost.textContent !== String(repair)) cost.textContent = String(repair);
        this.repairBtn.classList.toggle('poor', gold < repair);
        this.repairBtn.setAttribute('aria-label', `Repair ${TOWER_NAMES[tower.kind]} for ${repair} gold`);
      }
      if (choices.length > 0) chip = branchOfferChip(choices);
      else if (tower.branch) chip = `${towerName(tower.kind, tower.branch, TOWER_NAMES)}: ${BRANCH_BLURBS[tower.branch]}`;
      else
        chip = `${TOWER_NAMES[tower.kind]} T${tower.tier}: ${upgradeChip(tower.kind, tower.tier, TUNING, 2, towerRangeScale(snap.modifiers, TUNING)) || 'max tier'}`;
    }
    // The ring stays around its pad or tower; the chip goes above it, or below it when there is no room above.
    const bounds = this.bounds();
    const at = placeRadial(this.toScreen(anchor.x, anchor.y), extent, 0, bounds);
    this.radial.style.left = `${Math.round(at.x)}px`;
    this.radial.style.top = `${Math.round(at.y)}px`;
    this.radial.classList.remove('hidden');
    if (this.chip.textContent !== chip) this.chip.textContent = chip;
    this.chip.classList.remove('hidden');
    // Its size does not depend on where it sits (CSS: max-content up to the max width), so measure, then place.
    const size = { w: this.chip.offsetWidth, h: this.chip.offsetHeight };
    const p = placeChip({ x: at.x, ...this.ringSpan(at.y) }, size, bounds);
    this.chip.style.left = `${Math.round(p.x)}px`;
    this.chip.style.top = `${Math.round(p.y)}px`;
  }

  /** The top and bottom edges (px, on screen) of the open ring's buttons, its centre at `y`. */
  private ringSpan(y: number): { top: number; bottom: number } {
    let top = 0;
    let bottom = 0;
    for (const b of this.radial.children) {
      if (!(b instanceof HTMLElement)) continue;
      top = Math.min(top, b.offsetTop);
      bottom = Math.max(bottom, b.offsetTop + b.offsetHeight);
    }
    return { top: y + top, bottom: y + bottom };
  }

  private renderBuild(padId: number): void {
    this.radial.innerHTML = '';
    this.radial.dataset.menu = 'build';
    const spots = radialSpots(TOWER_KINDS.length, BUILD_RING_R);
    TOWER_KINDS.forEach((kind, i) => {
      const cost = buildCost(kind);
      const b = this.ringButton(spots[i]!, BUILD_BTN, `${ico(towerIcon(kind))}<span class="cap">${TOWER_NAMES[kind]}</span><span class="cost">${cost}</span>`);
      b.dataset.tower = kind;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.buildHold) return;
        b.setPointerCapture?.(e.pointerId);
        this.buildHold = { id: e.pointerId, start: e.timeStamp, startPt: { x: e.clientX, y: e.clientY }, drag: false, padId, kind, button: b };
      });
      b.addEventListener('pointermove', (e) => {
        const h = this.buildHold;
        if (h && h.id === e.pointerId) h.drag = isDrag(h.startPt, { x: e.clientX, y: e.clientY }, h.drag);
      });
      b.addEventListener('pointerup', (e) => this.endBuildPress(e, true));
      b.addEventListener('pointercancel', (e) => this.endBuildPress(e, false));
      // After a pointerup this is a no-op; without one (the browser dropped the press) it ends the preview.
      b.addEventListener('lostpointercapture', (e) => this.endBuildPress(e, false));
    });
  }

  /** While a build button is held long enough, the pad shows that tower's range and the chip its stats. */
  private updateBuildHold(now: number, gap: number): void {
    const h = this.buildHold;
    if (!h) return;
    if (!holdReached(h.start, now, gap, BUILD_PREVIEW_MS)) return;
    if (this.ui.preview?.padId !== h.padId || this.ui.preview.tower !== h.kind) this.ui.preview = { padId: h.padId, tower: h.kind };
  }

  /**
   * Lifting a quick tap builds. Lifting after a hold (or a drag) only ends the preview. The press's real length
   * (the events' timestamps) decides, so a preview a late frame opened under a quick tap still builds.
   */
  private endBuildPress(e: PointerEvent, lifted: boolean): void {
    const h = this.buildHold;
    if (!h || h.id !== e.pointerId) return;
    this.buildHold = null;
    this.ui.preview = null;
    const drag = isDrag(h.startPt, { x: e.clientX, y: e.clientY }, h.drag);
    if (lifted && buildPress(pressLength(h.start, e.timeStamp), drag).build) this.buildTower(h.padId, h.kind, h.button);
  }

  /** One tap builds. Not enough gold: the button shakes and nothing is spent. */
  private buildTower(padId: number, kind: TowerKind, button: HTMLElement): void {
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
    const choices = branchChoices(tower.kind, tower.tier, tower.branch);
    if (choices.length > 0) {
      // Tier 3: two specialisation buttons where Upgrade was, either side of the top.
      choices.forEach((c, i) => {
        const at = { x: (i === 0 ? -1 : 1) * TOWER_RING_R * 0.57, y: -TOWER_RING_R * 0.82 };
        const b = this.ringButton(at, TOWER_BTN, `${ico(towerIcon(tower.kind))}<span class="name">${c.name}</span><span class="cost">${c.cost}</span>`);
        b.classList.add('branch');
        b.dataset.action = 'branch';
        b.dataset.branch = c.branch;
        b.classList.toggle('poor', gold < c.cost);
        this.onRadialTap(b, () => this.pickBranch(tower.id, c.branch, c.cost, b));
      });
    } else {
      const upgrade = this.ringButton(
        up!,
        TOWER_BTN,
        next === null
          ? `${ico('upgrade')}<span class="cap">Max tier</span>`
          : `${ico('upgrade')}<span class="cap">Upgrade</span><span class="cost">${next}</span>`,
      );
      upgrade.dataset.action = 'upgrade';
      upgrade.disabled = next === null;
      upgrade.classList.toggle('poor', next !== null && gold < next);
      this.onRadialTap(upgrade, () => {
        if (next === null) return;
        const goldNow = this.actions.latest()?.players.find((p) => p.id === this.actions.me())?.gold ?? 0;
        if (goldNow < next) {
          this.shake(upgrade);
          return this.actions.toast('Not enough gold');
        }
        this.actions.send({ type: 'upgrade', towerId: tower.id });
      });
    }

    const priority = this.ringButton(prio!, TOWER_BTN, `${ico('target')}<span class="cap">Target</span><span class="name">${PRIORITY_NAMES[tower.priority]}</span>`);
    priority.dataset.action = 'priority';
    this.onRadialTap(priority, () => this.actions.send({ type: 'setPriority', towerId: tower.id, priority: nextPriority(tower.priority) }));

    const refund = Math.floor(tower.spent * TUNING.economy.sellRefund);
    const sellBtn = this.ringButton(sell!, TOWER_BTN, `<span class="hold"></span>${ico('sell')}<span class="cap">Sell</span><span class="cost">${refund}</span>`);
    sellBtn.dataset.action = 'sell';
    sellBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sellBtn.setPointerCapture?.(e.pointerId);
      this.sellHold = { id: e.pointerId, start: e.timeStamp, towerId: tower.id, button: sellBtn };
      sellBtn.classList.add('holding');
    });
    const release = (e: PointerEvent, lifted: boolean) => {
      const h = this.sellHold;
      if (!h || h.id !== e.pointerId) return;
      this.sellHold = null;
      sellBtn.classList.remove('holding');
      sellBtn.style.setProperty('--hold', '0deg');
      // A real 0.5 s hold that ended before a frame could sell it (the page stalled) still sells.
      if (lifted && pressLength(h.start, e.timeStamp) >= SELL_HOLD_MS) return this.sell(h.towerId);
      this.actions.toast('Hold Sell to sell');
    };
    sellBtn.addEventListener('pointerup', (e) => release(e, true));
    sellBtn.addEventListener('pointercancel', (e) => release(e, false));

    // Repair: only while the tower is damaged. One tap; the price is what the sim charges.
    this.repairBtn = null;
    if (tower.hp < tower.maxHp) {
      const repairBtn = this.ringButton(REPAIR_SPOT, TOWER_BTN, `${ico('repair')}<span class="cap">Repair</span><span class="cost"></span>`);
      repairBtn.dataset.action = 'repair';
      this.repairBtn = repairBtn;
      this.onRadialTap(repairBtn, () => this.pickRepair(tower.id, repairBtn));
    }
  }

  /** One tap repairs the tower to full HP. Not enough gold shakes the button and says so; nothing is spent. */
  private pickRepair(towerId: number, button: HTMLElement): void {
    const snap = this.actions.latest();
    const tower = snap?.towers.find((t) => t.id === towerId);
    if (!snap || !tower) return;
    const cost = repairCost(tuningForMode(TUNING, snap.mode), tower);
    if (cost === 0) return;
    const gold = snap.players.find((p) => p.id === this.actions.me())?.gold ?? 0;
    if (gold < cost) {
      this.shake(button);
      this.actions.toast('Not enough gold');
      return;
    }
    this.actions.send({ type: 'repair', towerId });
  }

  /** One tap buys the specialisation. The chip already says what each one does. The choice is final. */
  private pickBranch(towerId: number, branch: TowerBranch, cost: number, button: HTMLElement): void {
    const gold = this.actions.latest()?.players.find((p) => p.id === this.actions.me())?.gold ?? 0;
    if (gold < cost) {
      this.shake(button);
      this.actions.toast('Not enough gold');
      return;
    }
    this.actions.send({ type: 'upgrade', towerId, branch });
  }

  /**
   * One tap on a radial button, even if the ring moves a few pixels under the finger (the camera
   * follows the hero on a short phone). A drag does not fire.
   */
  private onRadialTap(button: HTMLButtonElement, action: () => void): void {
    let start: Pt | null = null;
    let id = -1;
    button.addEventListener('pointerdown', (e) => {
      if (button.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
      button.setPointerCapture?.(e.pointerId);
    });
    const end = (e: PointerEvent, fire: boolean) => {
      if (e.pointerId !== id || !start) return;
      const tap = fire && !isDrag(start, { x: e.clientX, y: e.clientY });
      start = null;
      if (tap) action();
    };
    button.addEventListener('pointerup', (e) => end(e, true));
    button.addEventListener('pointercancel', (e) => end(e, false));
  }

  /** Hold Sell: the ring fills; the sale goes through on a frame that does not follow a stall (a quick lift may be queued). */
  private updateHold(now: number, gap: number): void {
    const h = this.sellHold;
    if (!h) return;
    const { progress } = holdProgress(h.start, now);
    h.button.style.setProperty('--hold', `${progress * 360}deg`);
    if (!holdReached(h.start, now, gap, SELL_HOLD_MS)) return;
    this.sellHold = null;
    this.sell(h.towerId);
  }

  private sell(towerId: number): void {
    this.actions.send({ type: 'sell', towerId });
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
