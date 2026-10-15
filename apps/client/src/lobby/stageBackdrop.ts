// The lobby stage's backdrop (docs/ART.md §12, §15): the moonlit clearing rendered ahead of time in Blender. A hero
// made in 3D stands in it as a video (its 8 s loop: idle, then its signature move); the others stand as their 2D
// drawing (heroStage.ts) over the empty clearing, so the three heroes share one background. Nothing 3D runs here.
//
// - The poster (the loop's first frame) shows at once and stays when the video can't play: reduced motion, data
//   saver, autoplay blocked (iPhone Low Power Mode), an error. The video loads only after the first screen is up.
// - Only the live stage's video plays (one stage at a time); it pauses when the stage is stopped, hidden or off
//   screen, and when the page is hidden.
// - The video plays from its URL. The service worker (platform/swSource.ts) stores it whole on first play and
//   answers the video element's range requests from the stored file (206 and Content-Range, as iPhones need); with
//   no worker yet (a first visit), the host answers them.
// - One fit (`fitStage`) places the poster, the video and the clearing, so switching heroes never moves the ground.

import type { HeroKind } from '@tdt/protocol';
import { fitStage, HERO_3D, type StageBox, type StageFile, type StageLayout } from '../render/art3d/layout';

/** After the stage starts, the video waits this long (and for an idle moment) before it loads, ms. */
const VIDEO_AFTER_MS = 600;
/** The poster and the video fade in over this long (style.css), ms. */
export const BACKDROP_FADE_MS = 180;

/** The clearing is the same in every hero's render: placed by the first 3D hero's layout. */
const CLEARING: StageLayout | undefined = Object.values(HERO_3D)[0]?.stage;

export function stageUrl(s: StageLayout, file: StageFile): string {
  const f = s.files[file];
  return `${import.meta.env.BASE_URL}stage/${f.name}?v=${f.hash}`;
}

/** H.264 where it plays (every iPhone, most browsers), else VP9 WebM (open-source Chromium builds). */
export function pickVideo(canPlay: (type: string) => string): 'mp4' | 'webm' | null {
  if (canPlay('video/mp4; codecs="avc1.640028"')) return 'mp4';
  if (canPlay('video/webm; codecs="vp9"')) return 'webm';
  return null;
}

type Shown = 'none' | 'clearing' | 'poster' | 'video';

export class StageBackdrop {
  private readonly el = document.createElement('div');
  private readonly clearing = document.createElement('img');
  private readonly poster = document.createElement('img');
  private video: HTMLVideoElement | null = null;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)');
  private hero: HeroKind;
  private running = false;
  private visible = true;
  private posterOk = false;
  private posterFailed = false;
  private videoReady = false;
  private videoFor: HeroKind | null = null;
  private timer = 0;
  private box: StageBox | null = null;

  /** Called when what the backdrop shows changes (the 2D figure hides behind a 3D hero's picture). */
  onChange: () => void = () => {};

  constructor(
    private readonly root: HTMLElement,
    hero: HeroKind,
  ) {
    this.hero = hero;
    this.el.className = 'hero-stage-backdrop';
    this.el.setAttribute('aria-hidden', 'true');
    for (const img of [this.clearing, this.poster]) {
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      this.el.appendChild(img);
    }
    this.clearing.className = 'stage-clearing';
    this.poster.className = 'stage-poster';
    this.poster.addEventListener('load', () => {
      this.posterOk = true;
      this.sync();
    });
    this.poster.addEventListener('error', () => {
      this.posterFailed = true;
      this.sync();
    });
    root.insertBefore(this.el, root.firstChild);
    this.setPoster();
    this.still.addEventListener?.('change', () => this.sync());
    document.addEventListener('visibilitychange', () => this.sync());
    // A hidden screen (display: none) or a stage scrolled off screen stops intersecting: pause.
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        this.sync();
      }).observe(root);
    }
    this.sync();
  }

  /** The hero's 3D stage, if it has one. */
  private get stage(): StageLayout | undefined {
    return HERO_3D[this.hero]?.stage;
  }

  /** The 2D figure stays hidden while a 3D hero's picture is up (or still coming: the poster loads first). */
  get drawsHero(): boolean {
    return !!this.stage && !this.posterFailed;
  }

  show(hero: HeroKind): void {
    if (hero === this.hero) return;
    this.hero = hero;
    this.setPoster();
    this.sync();
  }

  start(): void {
    this.running = true;
    this.sync();
  }

  stop(): void {
    this.running = false;
    this.sync();
  }

  /** Sizes and places the pictures for the stage's box (CSS px). */
  layout(box: StageBox): void {
    this.box = box;
    const s = this.stage ?? CLEARING;
    if (!s) return;
    const fit = fitStage(s, box);
    for (const el of [this.clearing, this.poster, this.video]) {
      if (!el) continue;
      el.style.left = `${fit.left}px`;
      el.style.top = `${fit.top}px`;
      el.style.width = `${s.w * fit.scale}px`;
      el.style.height = `${s.h * fit.scale}px`;
    }
  }

  private setPoster(): void {
    const s = this.stage;
    this.posterOk = false;
    this.posterFailed = false;
    if (s) this.poster.src = stageUrl(s, 'poster');
    else this.poster.removeAttribute('src');
  }

  /** Motion is allowed: not reduced, not saving data. */
  private moving(): boolean {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    return !this.still.matches && !saveData;
  }

  private shown(): Shown {
    if (!this.stage) return CLEARING ? 'clearing' : 'none';
    if (this.videoReady && this.videoFor === this.hero && this.moving()) return 'video';
    return this.posterOk ? 'poster' : 'none';
  }

  /** The empty clearing loads when a 2D hero needs it, or once the screen is up: never in the first screen's way. */
  private loadClearing(): void {
    if (CLEARING && !this.clearing.getAttribute('src')) this.clearing.src = stageUrl(CLEARING, 'clearing');
  }

  private sync(): void {
    const shown = this.shown();
    if (shown === 'clearing') this.loadClearing();
    this.root.dataset.backdrop = shown;
    this.el.dataset.shown = shown;
    this.clearing.classList.toggle('on', shown === 'clearing');
    this.poster.classList.toggle('on', shown === 'poster' || shown === 'video');
    this.video?.classList.toggle('on', shown === 'video');
    const play = this.running && this.visible && document.visibilityState !== 'hidden' && !!this.stage && this.moving();
    if (play && !this.video && !this.timer) this.scheduleVideo();
    if (this.video) {
      if (play && this.videoFor === this.hero) this.video.play().catch(() => this.blocked());
      else this.video.pause();
    }
    this.onChange();
  }

  /** The video loads once the screen is up: after a short wait and an idle moment, never in the first screen's way. */
  private scheduleVideo(): void {
    this.timer = window.setTimeout(() => {
      const go = () => {
        this.timer = 0;
        this.loadVideo();
        this.loadClearing();
      };
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
      if (idle) idle(go, { timeout: 1500 });
      else go();
    }, VIDEO_AFTER_MS);
  }

  private loadVideo(): void {
    const s = this.stage;
    const hero = this.hero;
    if (!s || this.video) return;
    const v = document.createElement('video');
    const kind = pickVideo((t) => v.canPlayType(t));
    if (!kind) return;
    v.className = 'stage-video';
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.disablePictureInPicture = true;
    v.setAttribute('aria-hidden', 'true');
    for (const a of ['muted', 'playsinline', 'loop', 'disableremoteplayback']) v.setAttribute(a, '');
    v.addEventListener('playing', () => {
      this.videoReady = true;
      this.sync();
    });
    v.addEventListener('error', () => this.blocked());
    this.el.appendChild(v);
    this.video = v;
    this.videoFor = hero;
    if (this.box) this.layout(this.box);
    v.src = stageUrl(s, kind);
    this.sync();
  }

  /** The video can't play here: the poster stays. */
  private blocked(): void {
    this.videoReady = false;
    this.video?.classList.remove('on');
    const shown = this.shown();
    this.root.dataset.backdrop = shown;
    this.el.dataset.shown = shown;
  }
}
