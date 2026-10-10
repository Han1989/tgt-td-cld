// The home card's hero stage (docs/ART.md §12): the picked hero drawn large on a moonlit clearing,
// breathing. Canvas 2D from the hero's own art: its frames are drawn once at the stage's size (vector
// paths, so they stay sharp at any size) and placed each frame by its standing pose (`HeroArt.stand`).
// No image files and no WebGL; nothing is drawn while the stage is hidden, and under reduced motion
// it is one still drawing. The clearing itself is CSS (style.css `.hero-stage`).

import type { HeroKind } from '@tdt/protocol';
import { ART_RES } from '../render/art/atlas';
import '../render/art/load';
import { createPainter, css, radialFill, type Painter } from '../render/art/paint';
import { heroArt, type HeroArt } from '../render/art/registry';
import { fitStand, standItems, standRoom, type StandFit, type StandRoom } from '../render/art/stand';
import { LIGHTING, RL } from '../render/art/tokens';
import { HERO_COLORS } from '../render/palette';

/** The canvas is drawn at the screen's pixel density, up to this: bold shapes need no more, and the frames stay small. */
const MAX_DPR = 2;
/** The breath is slow: 30 frames a second is plenty. */
const FRAME_MS = 1000 / 30;
/** Room kept clear at each side of the figure, CSS px. */
const SIDE_PX = 14;
/** The figure may reach this far up behind the title's last line (a blade's tip, a staff's gem), CSS px. */
const TITLE_OVERLAP_PX = 8;
/** The feet stand this far above the stage's bottom edge, CSS px (a bow's lower tip hangs below the feet). */
const GROUND_PX = 34;
/** Each frame is drawn with this much room around it (world px), so a glow at its edge is not cut off. */
const SPRITE_PAD = 4;
/** Ink outlines at stage size, as a share of their width in a match (paint.ts). */
const OUTLINE = 0.5;
/** The pool of light under the hero (world px, around its feet), and the contact shadow on it. */
const LIGHT = { rx: 30, ry: 8, alpha: 0.42 } as const;
const SHADOW = { rx: 15, ry: 5.5 } as const;

function allHeroArt(kinds: readonly HeroKind[]): HeroArt[] {
  return kinds.map((kind) => {
    const art = heroArt(kind);
    if (!art) throw new Error(`No art for hero "${kind}"`);
    return art;
  });
}

export class HeroStage {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly title: HTMLElement | null;
  private readonly arts: Map<HeroKind, HeroArt>;
  private readonly room: StandRoom;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)');
  private hero: HeroKind;
  /** The frames of the hero on stage, each drawn once at the size `spriteKey` names. */
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private spriteKey = '';
  private dpr = 1;
  private fit: StandFit = { scale: 0, x: 0, y: 0 };
  private raf = 0;
  private last = -Infinity;
  private running = false;

  /**
   * `root` is the stage element (index.html): it holds a canvas and a title to stay clear of (`.stage-logo`).
   */
  constructor(
    private readonly root: HTMLElement,
    kinds: readonly HeroKind[],
    hero: HeroKind,
  ) {
    const canvas = root.querySelector('canvas');
    if (!canvas) throw new Error('The hero stage has no canvas');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.title = root.querySelector<HTMLElement>('.stage-logo');
    const arts = allHeroArt(kinds);
    this.arts = new Map(arts.map((art) => [art.kind, art]));
    this.room = standRoom(arts);
    this.hero = hero;
    root.dataset.hero = hero;

    // The stage's size is known only once it is laid out, and changes with the window and the keyboard.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resized()).observe(canvas);
    else addEventListener('resize', () => this.resized());
    this.still.addEventListener?.('change', () => {
      if (this.running) this.start();
    });
  }

  /** Puts another hero on stage. */
  show(hero: HeroKind): void {
    if (hero === this.hero) return;
    this.hero = hero;
    this.root.dataset.hero = hero;
    // Restart the entrance (style.css `.hero-stage.swap`; none under reduced motion).
    this.root.classList.remove('swap');
    void this.root.offsetWidth;
    this.root.classList.add('swap');
    this.resized();
  }

  /** Draws the stage and keeps it breathing while it is on screen (one still drawing under reduced motion). */
  start(): void {
    this.running = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resized();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** The stage is laid out (not inside a hidden screen). */
  private shown(): boolean {
    return this.canvas.offsetParent !== null;
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    // The lobby was hidden (a match started, another lobby screen is up): stop until start() is called again.
    if (!this.running || !this.shown()) return;
    if (now - this.last >= FRAME_MS - 1) {
      this.last = now;
      this.draw(now);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Sizes the canvas to its box and the hero to the canvas, then draws. */
  private resized(): void {
    if (!this.shown()) return;
    const box = this.canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const w = Math.round(box.width * this.dpr);
    const h = Math.round(box.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // The figure stands under the title, a strip of moss in front of its feet.
    const top = this.title ? this.title.getBoundingClientRect().bottom - box.top - TITLE_OVERLAP_PX : 0;
    const ground = box.height - GROUND_PX;
    this.fit = fitStand(this.art(), this.room, { w: box.width, h: box.height, ground, top: Math.max(0, top), side: SIDE_PX });
    this.draw(this.still.matches ? 0 : performance.now());
    // One loop at most. It also picks the breath back up when the stage is laid out again after being hidden.
    if (this.running && !this.raf && !this.still.matches) this.raf = requestAnimationFrame(this.tick);
  }

  private art(): HeroArt {
    return this.arts.get(this.hero)!;
  }

  /** A frame of the hero on stage, drawn once at the stage's size. */
  private sprite(art: HeroArt, frame: string, px: number, painter: () => Painter): HTMLCanvasElement {
    const key = `${art.id}@${px.toFixed(3)}`;
    if (key !== this.spriteKey) {
      this.sprites.clear();
      this.spriteKey = key;
    }
    let s = this.sprites.get(frame);
    if (!s) {
      const def = art.frames[frame]!;
      s = document.createElement('canvas');
      s.width = Math.max(1, Math.ceil((def.w + 2 * SPRITE_PAD) * px));
      s.height = Math.max(1, Math.ceil((def.h + 2 * SPRITE_PAD) * px));
      const c = s.getContext('2d')!;
      c.translate(s.width / 2, s.height / 2);
      c.scale(px, px);
      def.draw(c, painter(), RL);
      this.sprites.set(frame, s);
    }
    return s;
  }

  private draw(now: number): void {
    const c = this.ctx;
    const art = this.art();
    const px = this.fit.scale * this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!(px > 0)) return;
    c.setTransform(px, 0, 0, px, this.fit.x * this.dpr, this.fit.y * this.dpr);

    // Accents glow as wide, for the figure's size, as they do in a match (paint.ts).
    let made: Painter | null = null;
    const painter = (): Painter => (made ??= createPainter(LIGHTING.normal, px / ART_RES, OUTLINE));

    // A pool of the hero's light on the moss, and the contact shadow under the feet.
    const glow = HERO_COLORS[art.kind].fill;
    radialFill(c, 0, art.feet + 1.5, LIGHT.rx, LIGHT.ry, [
      [0, css(glow, LIGHT.alpha)],
      [0.55, css(glow, LIGHT.alpha * 0.35)],
      [1, css(glow, 0)],
    ]);
    painter().shadow(c, 0, art.feet + 1, SHADOW.rx, SHADOW.ry);

    for (const it of standItems(art, now)) {
      if (it.kind === 'line') {
        c.beginPath();
        c.moveTo(it.x0, it.y0);
        c.lineTo(it.x1, it.y1);
        c.lineCap = 'round';
        c.lineWidth = it.width * OUTLINE;
        c.strokeStyle = css(it.color);
        c.stroke();
        continue;
      }
      c.save();
      c.transform(...it.m);
      const sprite = this.sprite(art, it.frame, px, painter);
      c.drawImage(sprite, -sprite.width / px / 2, -sprite.height / px / 2, sprite.width / px, sprite.height / px);
      c.restore();
    }
  }
}
