// A tower in a match from its 3D frames (docs/ART.md §7 and §15, V-05d), on the same terms as the 2D TowerRig
// (render/art/rigs.ts, `TowerRigBase`): the contact shadow, a base that never turns, and a turret the base rig turns
// towards its target at the same rate. The base and turret are frames of the structures sheet seen straight down, the
// turret's pivot at its anchor, so turning the sprite turns the turret truly. A shot's recoil shows the turret's recoil
// frames (the crossbow kicked back, the catapult's arm thrown, the rotor's sails turned), stepped by the renderer's
// kick (`recoilFrame`) instead of sliding the sprite. Nothing is redrawn; a texture swaps only when it changes.

import type { TowerBranch, TowerKind } from '@tdt/protocol';
import { Sprite } from 'pixi.js';
import type { ArtKit } from '../art/kit';
import { TowerRigBase } from '../art/rigs';
import type { StructureFrame, StructureFrames } from './structureSheet';
import { recoilFrame, towerKeys, towerVariant } from './structures';

export class Tower3DRig extends TowerRigBase {
  readonly is3d = true;
  private readonly base = new Sprite();
  private readonly gun = new Sprite();
  private turretFrames: StructureFrame[] = [];
  private key = '';
  private shown = -1;

  constructor(
    kit: ArtKit,
    readonly kind: TowerKind,
    private readonly sheet: StructureFrames,
  ) {
    super(kit, true);
    this.turret.addChild(this.gun);
    this.body.addChild(this.base, this.turret);
    this.setTier(1, null);
  }

  /** Whether the sheet has every frame of this kind (each tier and branch: its base and four turret frames). */
  static covers(sheet: StructureFrames, kind: TowerKind, variants: readonly string[]): boolean {
    return variants.every((v) => {
      const k = towerKeys(kind, v);
      return sheet.frames.has(k.base) && k.turret.every((t) => sheet.frames.has(t));
    });
  }

  setTier(tier: number, branch: TowerBranch | null): void {
    const variant = towerVariant(tier, branch);
    if (variant === this.key) return;
    this.key = variant;
    const keys = towerKeys(this.kind, variant);
    const base = this.sheet.frames.get(keys.base);
    if (base) show(this.base, base);
    this.turretFrames = keys.turret.map((k) => this.sheet.frames.get(k)).filter((f): f is StructureFrame => f !== undefined);
    this.shown = -1;
    this.kick(0);
  }

  kick(px: number): void {
    const i = Math.min(recoilFrame(px), this.turretFrames.length - 1);
    if (i === this.shown || i < 0) return;
    this.shown = i;
    show(this.gun, this.turretFrames[i]!);
  }
}

/** A sprite showing a frame of the sheet: its texture, anchored at the world point it stands on, at world px. */
export function show(sprite: Sprite, f: StructureFrame): void {
  sprite.texture = f.tex;
  sprite.anchor.set(f.ax, f.ay);
  sprite.scale.set(f.scale);
}
