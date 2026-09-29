// Web Worker that bakes the synth sounds (the sound pass, docs/ART.md §13) off the main thread: the
// page sends the ids it wants, in order, and gets each sound's samples back as it is done.

import { allSynthDefs } from './sounds';
import { renderSound } from './synth';

// The client compiles against the DOM lib, so type the worker scope by hand.
const ctx = self as unknown as {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<{ ids: string[] }>) => void) | null;
};

const jobs = allSynthDefs();

ctx.onmessage = (e) => {
  for (const id of e.data.ids) {
    const job = jobs.get(id);
    if (!job) continue;
    const samples = renderSound(job.def, undefined, job.seed);
    ctx.postMessage({ id, samples }, [samples.buffer]);
  }
};
