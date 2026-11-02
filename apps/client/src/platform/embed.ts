// A hosted build inside a game site's frame (docs/DEPLOY.md "Hosted builds"): itch.io, Newgrounds and CrazyGames
// serve the zip from their own origin, under a path of their own, in a frame on their page. main.ts loads this module
// only in a hosted build (`if (__EMBED__) import(…)`), so none of it reaches the site's own build.
//
// - `embedded()`: the page runs in a frame (detected once).
// - Links to the site's own pages (`/privacy.html…`) go to the real game: index.html's are rewritten at build time
//   (embedHost.ts `hostedHtml`); the ones the game adds later (the age question's "Why we ask") as they appear.
// - Fullscreen, where the host allows it (`document.fullscreenEnabled`): a small button on the home card's stage under
//   the sound button, over the clearing and taking no room, so the card's one screen holds with and without it.
// - What the hosted build leaves out lives where it is decided: no install or update banner (platform/pwa.ts, the
//   Settings panel), the channel (analytics/install.ts), the invite link and the version message (lobby/lobby.ts),
//   the share card's link (hud/hud.ts, daily/endCard.ts). The Wake Lock is asked for as everywhere (gameView.ts): a
//   frame that may not have one refuses it quietly.

import './embed.css';
import { iconVar } from '../render/art/icons';
import { canonicalUrl, type EmbedConfig } from './embedHost';

let framed: boolean | null = null;

/** The page runs inside a frame (the host's page around it). Detected once. */
export function embedded(): boolean {
  if (framed === null) {
    try {
      framed = window.self !== window.top;
    } catch {
      // A frame whose parent hides even that is a frame.
      framed = true;
    }
  }
  return framed;
}

/** A link to one of the site's own pages (`/privacy.html#age`), pointed at the real game. */
function retarget(a: HTMLAnchorElement, canonical: string): void {
  const href = a.getAttribute('href');
  if (href && href.startsWith('/') && !href.startsWith('//')) a.setAttribute('href', canonicalUrl(canonical, href));
}

/** Every link to the site's own pages under `root`, now and as the game adds them. */
function canonicalLinks(canonical: string): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) retarget(a, canonical);
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLAnchorElement) retarget(node, canonical);
        for (const a of node.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) retarget(a, canonical);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function fullscreenOn(): boolean {
  return !!document.fullscreenElement;
}

/** The home card's fullscreen button, where the host lets the frame go fullscreen. */
function fullscreenButton(): void {
  let allowed = false;
  try {
    allowed = document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === 'function';
  } catch {
    allowed = false;
  }
  const stage = document.getElementById('lobby-stage');
  if (!allowed || !stage) return;
  const btn = document.createElement('button');
  btn.id = 'lobby-fullscreen';
  btn.type = 'button';
  btn.className = 'btn icon-btn embed-fullscreen';
  // The ⤢ the match's whole-map button wears (render/art/icons.ts), dressed as the sound button above it.
  btn.innerHTML = `<i class="ico" style="--ico: ${iconVar('fitMap')}"></i>`;
  const sync = () => {
    const on = fullscreenOn();
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    btn.title = on ? 'Leave full screen' : 'Full screen';
  };
  btn.addEventListener('click', () => {
    if (fullscreenOn()) {
      void document.exitFullscreen?.().catch(() => {});
      return;
    }
    document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        // The game is portrait first: hold a phone there while it fills the screen (where the browser can).
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        return orientation?.lock?.('portrait').catch(() => {});
      })
      .catch(() => {
        // The host or the browser said no: the frame stays as it was.
      });
  });
  // Taps on it are the button's, never the stage's.
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.addEventListener('fullscreenchange', sync);
  sync();
  stage.appendChild(btn);
}

/** Starts the hosted build's page: `<html data-embed>` (`framed` or `top`), the links, the fullscreen button. */
export function installHosted(cfg: EmbedConfig): void {
  document.documentElement.dataset.embed = embedded() ? 'framed' : 'top';
  canonicalLinks(cfg.canonical);
  fullscreenButton();
}
