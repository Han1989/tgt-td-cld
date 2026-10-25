// "Loading the art…" (V-07d): a small line under the wave counter, with a thin bar, while a match's first wave's art
// is still downloading (artLoad/firstWave.ts decides when). In the HUD's look; it fades out (a fade only, so reduced
// motion needs nothing else) and moves the cards that sit under the top bar down while it shows (`body.art-loading`).

export class ArtLine {
  private readonly el = document.getElementById('art-line')!;
  private readonly fill = this.el.querySelector<HTMLElement>('.fill')!;
  private visible = false;
  private drawn = -1;
  private gone: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    window.addEventListener('resize', () => this.visible && this.place());
  }

  /** Shown, its bar at `fraction` (0..1). */
  show(fraction: number): void {
    if (!this.visible) {
      this.visible = true;
      if (this.gone) clearTimeout(this.gone);
      this.gone = null;
      this.el.classList.remove('hidden', 'out');
      document.body.classList.add('art-loading');
      this.place();
    }
    const f = Math.round(Math.min(1, Math.max(0, fraction)) * 200) / 200;
    if (f !== this.drawn) {
      this.drawn = f;
      this.fill.style.transform = `scaleX(${f})`;
      this.el.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    }
  }

  /** Fades out (at once with `now`). */
  hide(now = false): void {
    if (!this.visible && !now) return;
    this.visible = false;
    document.body.classList.remove('art-loading');
    if (this.gone) clearTimeout(this.gone);
    this.gone = null;
    if (now) {
      this.el.classList.add('hidden');
      this.drawn = -1;
      return;
    }
    this.el.classList.add('out');
    this.gone = setTimeout(() => {
      this.gone = null;
      this.el.classList.add('hidden');
      this.drawn = -1;
    }, FADE_MS);
  }

  get shown(): boolean {
    return this.visible;
  }

  /** Under the wave counter, below the top bar, kept on screen. */
  private place(): void {
    const hud = this.el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth };
    const wave = document.getElementById('wave-stat')?.getBoundingClientRect();
    const bar = document.getElementById('topbar')?.getBoundingClientRect();
    if (!wave || !bar) return;
    const half = this.el.offsetWidth / 2;
    const centre = Math.min(Math.max(wave.left + wave.width / 2 - hud.left, half + 6), hud.width - half - 6);
    this.el.style.left = `${Math.round(centre)}px`;
    this.el.style.top = `${Math.round(Math.max(wave.bottom, bar.bottom) - hud.top + 3)}px`;
  }
}

/** The fade out (ms), as style.css `.art-line`. */
const FADE_MS = 300;
