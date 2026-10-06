// "Download my data" and "Delete my data" (Settings → Play data and the privacy page). Delete asks for a second tap.
// The requests and their wording are in analytics/myData.ts.

import { resetAnalytics } from '../analytics/install';
import { analyticsServer, copyMyData, deleteMyData, localIdStore, myDataLine } from '../analytics/myData';
import { saveMatchFile } from '../hud/matchFile';

const CONFIRM_MS = 5000;

export interface MyDataControls {
  copy: HTMLButtonElement;
  erase: HTMLButtonElement;
  state: HTMLElement;
  /** After a deletion (the page shows the id, which is gone now). */
  onDeleted?: () => void;
}

export function wireMyData({ copy, erase, state, onDeleted }: MyDataControls): void {
  const eraseLabel = erase.textContent ?? 'Delete my data';
  let armed: number | null = null;
  const disarm = () => {
    if (armed !== null) window.clearTimeout(armed);
    armed = null;
    erase.textContent = eraseLabel;
    erase.classList.remove('armed');
  };
  const busy = (on: boolean) => {
    copy.disabled = on;
    erase.disabled = on;
  };

  copy.addEventListener('click', () => {
    disarm();
    busy(true);
    state.textContent = 'Asking the game server…';
    void copyMyData(analyticsServer(), localIdStore()).then(async (result) => {
      if (result.kind === 'file') await saveMatchFile({ name: result.name, text: result.text }).catch(() => {});
      state.textContent = myDataLine(result);
      busy(false);
    });
  });

  erase.addEventListener('click', () => {
    if (armed === null) {
      erase.textContent = 'Tap again to delete';
      erase.classList.add('armed');
      state.textContent = 'This deletes everything the server holds for this browser and gives it a new id.';
      armed = window.setTimeout(disarm, CONFIRM_MS);
      return;
    }
    disarm();
    busy(true);
    state.textContent = 'Deleting…';
    void deleteMyData(analyticsServer(), localIdStore(), resetAnalytics).then((result) => {
      state.textContent = myDataLine(result);
      busy(false);
      if (result.kind === 'deleted' || result.kind === 'cleared') onDeleted?.();
    });
  });
}
