// Full-screen co-op flourishes: a shared ping/emote silhouette, a soft
// edge glow in two player colours, a short together-kill word, and the fuse ribbon.
// DOM only. The world ribbon, the kill flash and the fuse burst are the renderer.

const BURST_MS = 1200;
const EDGE_MS = 900;
const CLUTCH_MS = 1700;
/** Together-kill word and edge glow. One glance, then gone. */
const TOGETHER_MS = 700;
/** The fuse ribbon: long enough to read the new rain's name and both names on a phone. Matches the CSS animation. */
const FUSE_MS = 2000;

export interface StageWho {
  name: string;
  color: string;
}

/** Oversized shared mark and the screen-edge glow. Both ignore pointer events. */
export class CoopStage {
  private readonly burst: HTMLElement;
  private readonly word: HTMLElement;
  private readonly who: HTMLElement;
  private readonly ringA: HTMLElement;
  private readonly ringB: HTMLElement;
  private readonly glow: HTMLElement;
  private readonly clutchEl: HTMLElement;
  private readonly clutchKicker: HTMLElement;
  private readonly clutchWord: HTMLElement;
  private readonly clutchLine: HTMLElement;
  private readonly togetherEl: HTMLElement;
  private readonly togetherWho: HTMLElement;
  private readonly fuseEl: HTMLElement;
  private readonly fuseKicker: HTMLElement;
  private readonly fuseWord: HTMLElement;
  private readonly fuseWho: HTMLElement;
  private burstTimer = 0;
  private edgeTimer = 0;
  private clutchTimer = 0;
  private togetherTimer = 0;
  private fuseTimer = 0;

  constructor(doc: Document = document) {
    this.burst = doc.getElementById('coop-burst')!;
    this.word = doc.getElementById('coop-burst-word')!;
    this.who = doc.getElementById('coop-burst-who')!;
    this.ringA = this.burst.querySelector('.coop-ring.a')!;
    this.ringB = this.burst.querySelector('.coop-ring.b')!;
    this.glow = doc.getElementById('coop-glow')!;
    this.clutchEl = doc.getElementById('lane-clutch')!;
    this.clutchKicker = doc.getElementById('lane-clutch-kicker')!;
    this.clutchWord = doc.getElementById('lane-clutch-word')!;
    this.clutchLine = doc.getElementById('lane-clutch-line')!;
    this.togetherEl = doc.getElementById('together-kill')!;
    this.togetherWho = doc.getElementById('together-kill-who')!;
    this.fuseEl = doc.getElementById('fuse-ribbon')!;
    this.fuseKicker = doc.getElementById('fuse-ribbon-kicker')!;
    this.fuseWord = doc.getElementById('fuse-ribbon-word')!;
    this.fuseWho = doc.getElementById('fuse-ribbon-who')!;
  }

  /** A phone-readable pair of rings and a short word, in the two players' colours. */
  mirror(word: string, a: StageWho, b: StageWho): void {
    this.word.textContent = word;
    this.who.replaceChildren(nameEl(a), document.createTextNode('  ·  '), nameEl(b));
    this.ringA.style.setProperty('--c', a.color);
    this.ringB.style.setProperty('--c', b.color);
    this.kick(this.burst, 'on', BURST_MS, (id) => (this.burstTimer = id), this.burstTimer, true);
  }

  /** Soft inset glow along the screen edge, one colour each side of the pair. */
  edge(colorA: string, colorB: string, brief = false): void {
    this.glow.style.setProperty('--a', colorA);
    this.glow.style.setProperty('--b', colorB);
    this.glow.classList.toggle('brief', brief);
    this.kick(this.glow, 'on', brief ? TOGETHER_MS : EDGE_MS, (id) => (this.edgeTimer = id), this.edgeTimer, false);
  }

  /**
   * Phone-readable together-kill: the word under the top bar, names in seat
   * colours, and a short edge glow. The world flash is separate.
   */
  together(whos: readonly StageWho[]): void {
    if (whos.length < 2) return;
    this.togetherWho.replaceChildren();
    whos.forEach((w, i) => {
      if (i > 0) this.togetherWho.append(document.createTextNode(' · '));
      const name = document.createElement('b');
      name.textContent = w.name;
      name.style.color = w.color;
      this.togetherWho.append(name);
    });
    const first = whos[0]!.color;
    const last = whos[whos.length - 1]!.color;
    this.edge(first, last, true);
    this.kick(this.togetherEl, 'on', TOGETHER_MS, (id) => (this.togetherTimer = id), this.togetherTimer, true);
  }

  /**
   * Phone-readable fuse: a fire band with the fused rain's name large, the skills that went into it above and the
   * casters below in their seat colours (none when the snapshot no longer lists them). The burst and the twin
   * ribbon in the world are the renderer's.
   */
  fuse(kicker: string, word: string, whos: readonly StageWho[]): void {
    this.fuseKicker.textContent = kicker;
    this.fuseWord.textContent = word;
    this.fuseWho.replaceChildren();
    whos.forEach((w, i) => {
      if (i > 0) this.fuseWho.append(document.createTextNode('  ·  '));
      this.fuseWho.append(nameEl(w));
    });
    this.kick(this.fuseEl, 'on', FUSE_MS, (id) => (this.fuseTimer = id), this.fuseTimer, true);
  }

  /**
   * Phone-readable Heart-save: the lane name large, with a ping ring.
   * The Heart stat pulse is separate and stays where it was.
   */
  clutch(kicker: string, word: string, line: string): void {
    this.clutchKicker.textContent = kicker;
    this.clutchWord.textContent = word;
    this.clutchLine.textContent = line;
    this.kick(this.clutchEl, 'on', CLUTCH_MS, (id) => (this.clutchTimer = id), this.clutchTimer, true);
  }

  clear(): void {
    window.clearTimeout(this.burstTimer);
    window.clearTimeout(this.edgeTimer);
    window.clearTimeout(this.clutchTimer);
    window.clearTimeout(this.togetherTimer);
    window.clearTimeout(this.fuseTimer);
    this.fuseEl.classList.add('hidden');
    this.fuseEl.classList.remove('on');
    this.burst.classList.add('hidden');
    this.burst.classList.remove('on');
    this.glow.classList.remove('on', 'brief');
    this.clutchEl.classList.add('hidden');
    this.clutchEl.classList.remove('on');
    this.togetherEl.classList.add('hidden');
    this.togetherEl.classList.remove('on');
  }

  private kick(
    el: HTMLElement,
    cls: string,
    ms: number,
    keep: (id: number) => void,
    prev: number,
    hide: boolean,
  ): void {
    window.clearTimeout(prev);
    if (hide) el.classList.remove('hidden');
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    keep(
      window.setTimeout(() => {
        el.classList.remove(cls);
        if (hide) el.classList.add('hidden');
      }, ms),
    );
  }
}

function nameEl(who: StageWho): HTMLElement {
  const el = document.createElement('b');
  el.textContent = who.name;
  el.style.color = who.color;
  return el;
}
