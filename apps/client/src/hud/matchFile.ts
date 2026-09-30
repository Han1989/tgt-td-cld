// "Save match report" on the end screen: the report plus the full replay in one JSON file, small enough to send
// in a chat and readable at the top (the report is indented; the replay's log stays compact).
// `npm run replay <file>` re-runs it. DOM-free, so it is unit tested; `saveMatchFile` does the browser part.

import type { MatchReport, Replay } from '@tdt/protocol';

export interface MatchFile {
  name: string;
  text: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `tdt-match-2026-09-28-1432-quick-normal-victory.json` (local time of `date`). */
export function matchFileName(report: MatchReport, date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const difficulty = report.difficulty ?? 'normal';
  return `tdt-match-${day}-${pad(date.getHours())}${pad(date.getMinutes())}-${report.mode}-${difficulty}-${report.result}.json`;
}

export function matchFile(report: MatchReport, replay: Replay, date: Date): MatchFile {
  const text = `{"report": ${JSON.stringify(report, null, 1)},\n"replay": ${JSON.stringify(replay)}}\n`;
  return { name: matchFileName(report, date), text };
}

/** Reads a saved match file back (for tests and tools): null if it isn't one. */
export function parseMatchFile(text: string): { report: MatchReport; replay: Replay } | null {
  try {
    const data = JSON.parse(text) as { report?: MatchReport; replay?: Replay };
    return data && typeof data.report === 'object' && typeof data.replay === 'object'
      ? { report: data.report, replay: data.replay }
      : null;
  } catch {
    return null;
  }
}

/**
 * Hands the file to the player: on a touch device that can share files, the share sheet (straight into a chat);
 * otherwise, or if sharing fails, a download.
 */
export async function saveMatchFile(file: MatchFile): Promise<void> {
  const blob = new Blob([file.text], { type: 'application/json' });
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function') {
    const shared = new File([blob], file.name, { type: 'application/json' });
    if (navigator.canShare({ files: [shared] })) {
      try {
        await navigator.share({ files: [shared], title: 'Match report' });
        return;
      } catch (err) {
        // The player closed the share sheet: nothing to do. Anything else: download instead.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
