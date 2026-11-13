// The share card for a linkless host's build (CrazyGames, q5; platform/embedHost.ts `linkless`): the same card with no
// address on it, and a share that hands over the picture and the words with no link. Imported only under `__EMBED__`
// (hud/hud.ts, daily/endCard.ts), so the site's build never carries it and card.ts, share.ts and text.ts stay as the
// site has them.

import { downloadBlob, shareSheetTakes } from '../hud/matchFile';
import type { Ctx2D, CardArt } from './card';
import { CARD, cardFileName, linkLabel, shareText, type ShareFace, type ShareOutcome } from './text';

/** The origin the card is drawn with; its link line is the one line the bare context drops. */
const NOWHERE = 'https://linkless.invalid';

/**
 * `ctx` with the card's link line left out: every call and property goes to `ctx` except a `fillText` of the link's
 * label (drawn by card.ts's `drawCard` last, once with its shadow).
 */
export function bareContext(ctx: Ctx2D): Ctx2D {
  const label = linkLabel(NOWHERE);
  const target = ctx as unknown as Record<PropertyKey, unknown>;
  return new Proxy(target, {
    get(t, key) {
      if (key === 'fillText') {
        return (s: string, x: number, y: number, max?: number) => {
          if (s !== label) ctx.fillText(s, x, y, max);
        };
      }
      const v = t[key];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(ctx) : v;
    },
    set(t, key, value) {
      t[key] = value;
      return true;
    },
  }) as unknown as Ctx2D;
}

/** The words handed over with a card that carries no link: the Daily run's line without "Beat me:". */
export function bareShareText(face: ShareFace): string {
  return shareText(face).replace(/ Beat me:$/, '');
}

/** The card with no address, as a PNG. */
export async function renderBareCard(face: ShareFace, art?: CardArt): Promise<Blob> {
  const { drawCard, loadCardArt } = await import('./card');
  const canvas = document.createElement('canvas');
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  drawCard(bareContext(ctx), face, NOWHERE, art ?? (await loadCardArt(face.hero)));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The card did not encode'))), 'image/png'));
}

/** share.ts's `CardShare` with no link: the share sheet gets the file and the words, else the PNG is downloaded. */
export class BareCardShare {
  private key = '';
  private pending: Promise<File> | null = null;
  private file: File | null = null;

  /** Starts drawing the card for `face` (again only when the face changed). */
  prepare(face: ShareFace): void {
    const key = JSON.stringify(face);
    if (key === this.key && this.pending) return;
    this.key = key;
    this.file = null;
    const pending = renderBareCard(face).then((blob) => new File([blob], cardFileName(face), { type: 'image/png' }));
    this.pending = pending;
    pending.then(
      (file) => {
        if (this.pending === pending) this.file = file;
      },
      () => {
        if (this.pending === pending) this.forget();
      },
    );
  }

  /** One tap: the share sheet, else a download. */
  async share(face: ShareFace): Promise<ShareOutcome> {
    this.prepare(face);
    const ready = this.file !== null;
    let file: File;
    try {
      file = this.file ?? (await this.pending!);
    } catch {
      return 'failed';
    }
    if (shareSheetTakes(file)) {
      try {
        await navigator.share({ files: [file], text: bareShareText(face) });
        return 'shared';
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'AbortError') return 'closed';
        if (name === 'NotAllowedError' && !ready) return 'again';
      }
    }
    downloadBlob(file, file.name);
    return 'saved-no-link';
  }

  /** Drops the drawn card (a new match). */
  forget(): void {
    this.key = '';
    this.pending = null;
    this.file = null;
  }
}
