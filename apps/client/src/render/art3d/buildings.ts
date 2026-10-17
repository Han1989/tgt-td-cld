// The Heart and the portals in a match from their 3D frames (docs/ART.md §7 and §15, V-05d). The renderer keeps
// what it did for the 2D ones (the heartbeat, the hit flash and wobble, the damage stages and their shards, the warning
// ring, the portals' swirl and wave-start flare, the motes) and these views give it the pictures:
//
// - the Heart: a castle keeping a glowing chest, a body per damage stage (whole, cracked under 60% HP, ruined and
//   burning under 30%) each with its white twin (the hit flash), the rubble of each damaged stage, the chest's glow
//   (additive, pulsed with the beat) and three frames of flames (additive, flickered by `flameFrame`);
// - a portal: a gatehouse with two torches, their glow flickering (additive); the renderer's swirl, glow and flare
//   go in the gate's opening.
//
// Everything is a sprite anchored at the building's point on the map; layers change by alpha and texture only, the
// ones at 0 (the stages not shown, the flashes between hits) out of the draw (`fade`).

import { Container, Sprite } from 'pixi.js';
import { fade } from '../fade';
import type { StructureFrame, StructureFrames } from './structureSheet';
import { flameFrame, type StructurePoint } from './structures';
import { show } from './towerRig';

function sprite(f: StructureFrame | undefined, blend?: 'add'): Sprite {
  const s = new Sprite();
  if (f) show(s, f);
  else fade(s, 0);
  if (blend) s.blendMode = blend;
  return s;
}

export class Heart3DView {
  readonly root = new Container();
  /** Where the chest's light is (shards, flash, embers) and the castle's middle (the blaze), world px from its point. */
  readonly chest: StructurePoint;
  readonly keep: StructurePoint;
  private readonly bodies: Sprite[];
  private readonly flashes: Sprite[];
  private readonly rubble: Sprite[];
  private readonly glow: Sprite;
  private readonly fire: Sprite;
  private readonly fireFrames: StructureFrame[];
  private stage = -1;
  private flameShown = -1;

  constructor(sheet: StructureFrames) {
    const f = (k: string) => sheet.frames.get(`heart/${k}`);
    this.chest = sheet.layout.heart.points.chest;
    this.keep = sheet.layout.heart.points.keep;
    this.bodies = [0, 1, 2].map((i) => sprite(f(`stage${i}`)));
    this.rubble = [1, 2].map((i) => sprite(f(`rubble${i}`)));
    this.glow = sprite(f('glow'), 'add');
    this.fireFrames = [0, 1, 2].map((i) => f(`fire${i}`)).filter((x): x is StructureFrame => x !== undefined);
    this.fire = sprite(this.fireFrames[0], 'add');
    this.flashes = [0, 1, 2].map((i) => sprite(f(`flash${i}`)));
    for (const s of this.flashes) fade(s, 0);
    this.root.addChild(...this.bodies, ...this.rubble, this.glow, this.fire, ...this.flashes);
    this.setStage(0);
  }

  /** Whether the sheet has every frame the Heart shows. */
  static covers(sheet: StructureFrames): boolean {
    const keys = ['stage0', 'stage1', 'stage2', 'flash0', 'flash1', 'flash2', 'rubble1', 'rubble2', 'glow', 'fire0', 'fire1', 'fire2'];
    return keys.every((k) => sheet.frames.has(`heart/${k}`));
  }

  /** 0 whole, 1 cracked, 2 ruined and burning (render/art/damage.ts). */
  setStage(stage: number): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.bodies.forEach((s, i) => fade(s, i === stage ? 1 : 0));
    this.rubble.forEach((s, i) => fade(s, i + 1 === stage ? 1 : 0));
    for (const s of this.flashes) fade(s, 0);
    fade(this.fire, stage === 2 ? 1 : 0);
  }

  /** Each frame: the beat (0..1), the hit flash (0..1), and the time for the flames. */
  update(now: number, beat: number, hit: number): void {
    this.glow.alpha = Math.min(1, 0.55 + beat * 0.45 + hit * 0.3);
    fade(this.flashes[this.stage]!, hit * 0.85);
    if (this.stage === 2 && this.fireFrames.length) {
      const { i, alpha } = flameFrame(now);
      if (i !== this.flameShown) {
        this.flameShown = i;
        show(this.fire, this.fireFrames[i % this.fireFrames.length]!);
      }
      fade(this.fire, alpha);
    }
  }
}

/** A 3D portal: the renderer's swirl and its glow at this share of the 2D well's size, in the gate's opening; the
 * wave-start flare at this share. */
export const PORTAL_OPENING = 0.42;
export const PORTAL_FLARE = 0.75;

export class Portal3DView {
  readonly root = new Container();
  /** The gate's opening, world px from the portal's point: the swirl, its glow and the wave-start flare go there. */
  readonly opening: StructurePoint;
  private readonly glow: Sprite;

  constructor(sheet: StructureFrames) {
    this.opening = sheet.layout.portal.points.opening;
    this.glow = sprite(sheet.frames.get('portal/glow'), 'add');
    this.root.addChild(sprite(sheet.frames.get('portal/body')), this.glow);
  }

  static covers(sheet: StructureFrames): boolean {
    return sheet.frames.has('portal/body') && sheet.frames.has('portal/glow');
  }

  /** The torches flicker (lane `i` out of step with the others). */
  update(now: number, i: number): void {
    this.glow.alpha = 0.78 + 0.12 * Math.sin(now / 95 + i * 2.1) + 0.1 * Math.sin(now / 37 + i);
  }
}
