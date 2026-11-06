// A tower in a match from its 3D frames (docs/ART.md §7 and §15, V-05d), on the same terms as the 2D TowerRig
// (render/art/rigs.ts, `TowerRigBase`): the contact shadow, a base that never turns, and a turret the base rig turns
// towards its target at the same rate. Since V-08b build 2 the frames are seen through the match's tilted camera, so a
// turret turned as a sprite would lie (docs/art/camera-options.md, "The turret problem"): its turret is rendered at
// eight headings on the ground (`turretHeading`), the rig shows the nearest and turns that sprite in the plane by what is
// left over, about its turning axis as drawn (the turret's container stands at the layout's `axis` over the tower's
// ground point). A shot's recoil shows that heading's recoil frames (the crossbow kicked back, the catapult's arm
// thrown, the rotor's sails turned), stepped by the renderer's kick (`recoilFrame`) instead of sliding the sprite.
// Nothing is redrawn; a texture swaps only when it changes.

import type { TowerBranch, TowerKind } from '@tdt/protocol';
import { Sprite } from 'pixi.js';
import type { ArtKit } from '../art/kit';
import { TowerRigBase } from '../art/rigs';
import { viewCos } from '../view';
import type { StructureFrame, StructureFrames } from './structureSheet';
import { recoilFrame, towerKeys, towerVariant, turretHeading } from './structures';

export class Tower3DRig extends TowerRigBase {
  readonly is3d = true;
  private readonly base = new Sprite();
  private readonly gun = new Sprite();
  /** Per heading, the turret at rest and its three recoil frames. */
  private turretFrames: StructureFrame[][] = [];
  private key = '';
  private heading = 0;
  private recoil = 0;
  private shown: StructureFrame | null = null;
  /** The headings this rig has shown (browser tests: a turret turns through its rendered headings). */
  readonly shownHeadings = new Set<number>();

  constructor(
    kit: ArtKit,
    readonly kind: TowerKind,
    private readonly sheet: StructureFrames,
  ) {
    super(kit, true);
    this.mountGun(this.gun);
    this.body.addChild(this.base, this.turret);
    this.setTier(1, null);
    this.turnTo(this.facing);
  }

  protected get gunSprite(): Sprite {
    return this.gun;
  }

  /** Whether the sheet has every frame of this kind (each tier and branch: its base and every heading's turret). */
  static covers(sheet: StructureFrames, kind: TowerKind, variants: readonly string[]): boolean {
    return variants.every((v) => {
      const k = towerKeys(kind, v);
      return sheet.frames.has(k.base) && k.turret.every((h) => h.every((t) => sheet.frames.has(t))) && sheet.layout.towers[`${kind}/${v}`] !== undefined;
    });
  }

  setTier(tier: number, branch: TowerBranch | null): void {
    const variant = towerVariant(tier, branch);
    if (variant === this.key) return;
    this.key = variant;
    const keys = towerKeys(this.kind, variant);
    const base = this.sheet.frames.get(keys.base);
    if (base) show(this.base, base);
    this.turretFrames = keys.turret.map((h) => h.map((k) => this.sheet.frames.get(k)).filter((f): f is StructureFrame => f !== undefined));
    // The turret turns about its axis, drawn over the tower's ground point.
    this.turret.position.set(0, this.sheet.layout.towers[`${this.kind}/${variant}`]?.axis ?? 0);
    this.shown = null;
    this.showGun();
  }

  /** The turret's aim on screen (radians): the nearest rendered heading, turned in the plane by the rest. */
  protected override turnTo(angle: number): void {
    const { k, turn } = turretHeading(angle, viewCos());
    this.turret.rotation = turn;
    if (k === this.heading) return;
    this.heading = k;
    this.showGun();
  }

  kick(px: number): void {
    const i = recoilFrame(px);
    if (i === this.recoil) return;
    this.recoil = i;
    this.showGun();
  }

  private showGun(): void {
    const frames = this.turretFrames[this.heading] ?? this.turretFrames[0];
    if (!frames?.length) return;
    const f = frames[Math.min(this.recoil, frames.length - 1)]!;
    if (f === this.shown) return;
    this.shown = f;
    this.shownHeadings.add(this.heading);
    show(this.gun, f);
  }
}

/** A sprite showing a frame of the sheet: its texture, anchored at the world point it stands on, at world px. */
export function show(sprite: Sprite, f: StructureFrame): void {
  sprite.texture = f.tex;
  sprite.anchor.set(f.ax, f.ay);
  sprite.scale.set(f.scale);
}
