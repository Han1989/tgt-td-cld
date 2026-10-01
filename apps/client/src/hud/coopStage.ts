// Full-screen co-op flourishes: a shared ping/emote silhouette, and a soft
// edge glow in two player colours. DOM only. The world ribbon is the renderer.

const BURST_MS = 1200;
const EDGE_MS = 900;

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
  private burstTimer = 0;
  private edgeTimer = 0;

  constructor(doc: Document = document) {
    this.burst = doc.getElementById('coop-burst')!;
    this.word = doc.getElementById('coop-burst-word')!;
    this.who = doc.getElementById('coop-burst-who')!;
    this.ringA = this.burst.querySelector('.coop-ring.a')!;
    this.ringB = this.burst.querySelector('.coop-ring.b')!;
    this.glow = doc.getElementById('coop-glow')!;
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
  edge(colorA: string, colorB: string): void {
    this.glow.style.setProperty('--a', colorA);
    this.glow.style.setProperty('--b', colorB);
    this.kick(this.glow, 'on', EDGE_MS, (id) => (this.edgeTimer = id), this.edgeTimer, false);
  }

  clear(): void {
    window.clearTimeout(this.burstTimer);
    window.clearTimeout(this.edgeTimer);
    this.burst.classList.add('hidden');
    this.burst.classList.remove('on');
    this.glow.classList.remove('on');
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
