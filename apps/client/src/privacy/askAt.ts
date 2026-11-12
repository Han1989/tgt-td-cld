// When the age question is asked at Play (docs/ANALYTICS.md "Age"). Pure, so a test covers both builds.
//
// On the site the first Play, Learn to play, Daily run, Create room or Join room tap asks it, as before. In a hosted
// build (`__EMBED__`: itch.io, Newgrounds, CrazyGames) the first match starts at once: a stranger on a portal leaves
// within seconds, and nothing with an id is sent before an answer anyway (`analyticsOn`). The question still comes
// where a name is posted (the Daily run's Post my run, the Endless board's consent card) and when Play data is turned
// on in Settings; until it is answered only the anonymous counts go (`countOn`).

/** Whether the first Play tap asks the age question, per build. Flip `site` to drop it on the site too. */
export const ASK_AGE_AT_PLAY = { site: true, hosted: false } as const;

/** `embed` is the build's `__EMBED__`: null on the site. */
export function askAgeAtPlay(embed: object | null): boolean {
  return embed ? ASK_AGE_AT_PLAY.hosted : ASK_AGE_AT_PLAY.site;
}

/** Runs `next` through `ask` (the age gate) where this build asks at Play, else at once. */
export function gateAtPlay(embed: object | null, next: () => void, ask: (next: () => void) => void): void {
  if (askAgeAtPlay(embed)) ask(next);
  else next();
}
