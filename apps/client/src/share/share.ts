// Handing the share card over (docs/GAME_DESIGN.md "Daily run"): one tap on the Daily run's Share my run or an Endless
// end screen's Share. Where the share sheet takes files (a touch device, as hud/matchFile.ts decides) the card goes in
// with the text and the link; otherwise the PNG is downloaded and the link copied. Never automatic: only a tap shares.
// The card is drawn as soon as its button shows (`prepare`), so the tap hands it over at once: a share sheet only
// opens inside the tap's own moment, which a phone's drawing and encoding could outlast.

import { downloadBlob, shareSheetTakes } from '../hud/matchFile';
import { cardFileName, shareText, shareUrl, type ShareFace, type ShareOutcome } from './text';

async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export class CardShare {
  private key = '';
  private pending: Promise<File> | null = null;
  /** The card once drawn, for the face `key` names. */
  private file: File | null = null;

  constructor(private readonly origin: string = location.origin) {}

  /** Starts drawing the card for `face` (again only when the face changed). */
  prepare(face: ShareFace): void {
    const key = JSON.stringify(face);
    if (key === this.key && this.pending) return;
    this.key = key;
    this.file = null;
    const pending = import('./card')
      .then(({ renderCard }) => renderCard(face, this.origin))
      .then((blob) => new File([blob], cardFileName(face), { type: 'image/png' }));
    this.pending = pending;
    pending.then(
      (file) => {
        if (this.pending === pending) this.file = file;
      },
      () => {
        // Drawn again on the next tap.
        if (this.pending === pending) this.forget();
      },
    );
  }

  /** One tap: the share sheet, else a download and the link copied. */
  async share(face: ShareFace): Promise<ShareOutcome> {
    this.prepare(face);
    const ready = this.file !== null;
    let file: File;
    try {
      file = this.file ?? (await this.pending!);
    } catch {
      return 'failed';
    }
    const url = shareUrl(this.origin);
    if (shareSheetTakes(file)) {
      try {
        await navigator.share({ files: [file], text: shareText(face), url });
        return 'shared';
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'AbortError') return 'closed';
        // The tap's moment passed while the card was drawn: the next tap shares at once. A sheet that refuses a ready
        // card (a frame that may not share) gets the download instead.
        if (name === 'NotAllowedError' && !ready) return 'again';
      }
    }
    downloadBlob(file, file.name);
    return (await copyLink(url)) ? 'saved' : 'saved-no-link';
  }

  /** Drops the drawn card (a new match). */
  forget(): void {
    this.key = '';
    this.pending = null;
    this.file = null;
  }
}
