// A part drawn at alpha 0 still costs its whole quad on the GPU every frame: Pixi v8 leaves a node out of the draw
// only when it is not `visible` or not `renderable`, never for its alpha. So a part that waits unseen for long
// stretches (a hit flash between hits, a Heart stage not shown, an Rampart Slam ring between casts) goes through `fade`:
// at 0 it leaves the draw, and it comes back when its alpha does. `renderable` is written only when the part crosses
// 0, never on a frame where it stays on either side, since each change rebuilds the draw list (docs/ART.md §9, §15).

/** What `fade` needs of a Pixi node. */
export interface Fadeable {
  alpha: number;
  renderable: boolean;
}

/** Sets a part's alpha; at 0 the part is out of the draw (not renderable), above 0 back in. */
export function fade(part: Fadeable, alpha: number): void {
  if (part.alpha !== alpha) part.alpha = alpha;
  const on = alpha > 0;
  if (part.renderable !== on) part.renderable = on;
}
