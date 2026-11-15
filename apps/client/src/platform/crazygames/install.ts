// CrazyGames' SDK in the crazygames build (q15; docs/DEPLOY.md §10 "CrazyGames' build"). main.ts loads this module by
// a dynamic import only when `__EMBED__.host` is crazygames, so the site's build and the itch.io and Newgrounds builds
// never hold it. It starts `init()` at the top of main() (`startCrazyGames`), holds the first screen for it at most
// FIRST_SCREEN_WAIT_MS behind the boot splash, and once the first screen is up (`CgPage.shown`) wires:
//
// - loadingStart / loadingStop: once a page load around the first screen, and around the wait card before a match;
// - gameplayStart / gameplayStop from what is on screen (a match running, or a break: the end card, the lobby, a lost
//   connection's notice, the wait card, the invite's question), never two in a row (rules.ts `GameplayGate`); happytime
//   once on a victory or a new Endless best;
// - the mute: `settings.muteAudio` silences the engine through its own muted path (gameView.ts reads `hostMuted`),
//   ⚙ → Sound saying so; the player's own setting is untouched;
// - the name: a signed-in player's CrazyGames username in the home card's field, locked and never stored;
// - rooms: `updateRoom` on a change, `leftRoom` when the page leaves one; an invite (at start-up or accepted while the
//   game is open) joins its room; an instant start creates one; Copy invite link copies CrazyGames' link.
//
// With the SDK off nothing here runs: the build is the linkless build as it was (embed.ts `codeOnlyRoom`).

import './crazygames.css';
import { normalizeName, type LobbyState, type PlayerId } from '@tdt/protocol';
import type { GameView } from '../../gameView';
import { storedHero } from '../../lobby/heroPicker';
import { storedMode } from '../../lobby/modePicker';
import { storedName } from '../../lobby/nickname';
import { hostMuteChanged, hostRooms, setHostHooks } from '../hostBridge';
import {
  acceptInvite,
  CG_NAME_LABEL,
  FIRST_SCREEN_WAIT_MS,
  GameplayGate,
  HappyGate,
  inviteRoom,
  JOIN_ASK,
  MUTED_BY_CG,
  nameFor,
  RoomReporter,
  startAction,
  storesName,
  type NameChoice,
} from './rules';
import { CrazyGamesSdk } from './sdk';

/** How often the gameplay events read the screen. */
const WATCH_MS = 250;

export interface CgPage {
  /** Resolves once `init()` settled or FIRST_SCREEN_WAIT_MS passed, whichever is first. */
  firstScreen(): Promise<void>;
  /** The first screen is up and interactive. */
  shown(view: GameView): void;
}

const visible = (id: string) => {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
};

/** Starts `init()` now (main.ts, at the top of main()). */
export function startCrazyGames(): CgPage {
  const sdk = CrazyGamesSdk.start();
  let up = false;
  let loading = false;
  // A tap or a key on the first screen before the SDK answered: the player started something, so a late invite or
  // instant start no longer takes over.
  let touched = false;
  const touch = () => {
    if (up) touched = true;
  };
  window.addEventListener('pointerdown', touch, { capture: true, passive: true });
  window.addEventListener('keydown', touch, { capture: true });
  void sdk.then((s) => {
    if (!s.on) return;
    s.loadingStart();
    loading = true;
    if (up) s.loadingStop();
  });
  return {
    firstScreen: () =>
      Promise.race([sdk.then(() => {}), new Promise<void>((resolve) => setTimeout(resolve, FIRST_SCREEN_WAIT_MS))]),
    shown(view) {
      up = true;
      void sdk.then((s) => {
        if (!s.on) return;
        if (loading) s.loadingStop();
        window.removeEventListener('pointerdown', touch, { capture: true });
        window.removeEventListener('keydown', touch, { capture: true });
        try {
          wire(s, view, !touched);
        } catch {
          // Nothing the SDK's wiring does may stop the game.
        }
      });
    },
  };
}

function wire(sdk: CrazyGamesSdk, view: GameView, fresh: boolean): void {
  document.documentElement.dataset.cgSdk = 'on';
  const start = fresh ? startAction(sdk.inviteParams, sdk.instantMultiplayer) : { kind: 'none' as const };
  // --- Mute -----------------------------------------------------------------------------------------------------
  let muted = sdk.muteAudio;
  const soundNote = mutedNote();
  const applyMute = () => {
    soundNote?.classList.toggle('hidden', !muted);
    hostMuteChanged();
  };
  sdk.onSettings((s) => {
    const next = s.muteAudio === true;
    if (next === muted) return;
    muted = next;
    applyMute();
  });
  // --- The name -------------------------------------------------------------------------------------------------
  let choice: NameChoice | null = null;
  const field = document.getElementById('lobby-name') as HTMLInputElement | null;
  const label = field?.parentElement?.querySelector('span') ?? null;
  const ownLabel = label?.textContent ?? 'Nickname';
  const applyName = (username: unknown) => {
    if (!field) return;
    const prev = choice;
    choice = nameFor(username, storedName(), start.kind !== 'none', Math.random);
    const locked = choice.source === 'crazygames';
    // The CrazyGames name always shows; otherwise the field keeps what the player typed, or takes the stored or
    // made-up name when it is empty (or held the CrazyGames name a moment ago).
    if (locked || prev?.source === 'crazygames' || !field.value.trim()) field.value = choice.name;
    field.readOnly = locked;
    field.classList.toggle('cg-locked', locked);
    if (label) label.textContent = locked ? CG_NAME_LABEL : ownLabel;
  };
  // --- Rooms ----------------------------------------------------------------------------------------------------
  const reporter = new RoomReporter();
  let current: LobbyState | null = null;
  const report = (lobby: LobbyState | null) => {
    current = lobby;
    const call = reporter.next(lobby);
    if (!call) return;
    if (call.call === 'leftRoom') sdk.leftRoom();
    else sdk.updateRoom(call.room);
  };
  roomCard();
  setHostHooks({
    muted: () => muted,
    storesName: (name) => storesName(name, choice),
    copyInvite: (code, flash) => {
      void sdk.inviteLink({ room: code }).then((link) => {
        if (!link) return flash(`Room code ${code}`);
        copyText(link).then(
          () => flash('Invite link copied'),
          () => flash(link),
        );
      });
      return true;
    },
    openSeat: () => 'Open seat: invite a friend',
    room: (lobby: LobbyState | null, _me: PlayerId | null) => report(lobby),
  });
  applyMute();
  const nameNow = () => normalizeName(field?.value ?? '') ?? choice?.name ?? '';
  const join = (code: string) => {
    const rooms = hostRooms();
    if (!rooms) return;
    rooms.join(code, nameNow(), storedHero());
  };
  sdk.onJoinRoom((params) => {
    const code = inviteRoom(params);
    const rooms = hostRooms();
    if (!code || !rooms) return;
    if (current && current.code === code) return;
    const what = acceptInvite(rooms.place());
    if (what === 'join') join(code);
    else if (what === 'ask') askJoin(() => join(code));
    // Still connecting somewhere: once that settles, from wherever it lands.
    else setTimeout(() => (acceptInvite(rooms.place()) === 'ask' ? askJoin(() => join(code)) : join(code)), 1000);
  });
  // --- The first moves: the name first, then an invite's room or an instant start -----------------------------------
  void sdk.user().then((u) => {
    applyName(u?.username ?? null);
    sdk.onAuth((user) => applyName(user?.username ?? null));
    const rooms = hostRooms();
    if (!rooms || rooms.place() !== 'home' || !fresh) return;
    const name = nameNow();
    if (start.kind === 'join') rooms.join(start.code, name, storedHero());
    else if (start.kind === 'create') rooms.create(name, storedHero(), storedMode());
  });
  // --- Gameplay, happytime and the wait card's loading events ----------------------------------------------------------
  const gameplay = new GameplayGate();
  const happy = new HappyGate();
  let waitCard = false;
  setInterval(() => {
    try {
      const phase = view.buffer.latest?.phase;
      const card = visible('art-wait');
      if (card !== waitCard) {
        waitCard = card;
        if (card) sdk.loadingStart();
        else sdk.loadingStop();
      }
      const playing =
        (phase === 'build' || phase === 'waves') &&
        !visible('lobby') &&
        !visible('end-screen') &&
        !visible('reconnecting') &&
        !card &&
        !visible('cg-ask');
      const was = gameplay.playing;
      const call = gameplay.next(playing);
      if (call === 'gameplayStart') {
        if (!was) happy.newMatch();
        sdk.gameplayStart();
      } else if (call === 'gameplayStop') sdk.gameplayStop();
      const endText = visible('end-screen') ? `${document.getElementById('end-title')?.textContent ?? ''} ${document.getElementById('end-text')?.textContent ?? ''}` : '';
      const big = phase === 'victory' || endText.includes('New best!');
      if (happy.next(playing, visible('end-screen') && big)) sdk.happytime();
    } catch {
      // Reading the screen must never throw into the game.
    }
  }, WATCH_MS);
}

/** ⚙ → Sound's "Muted by CrazyGames", inside the section's heading line (no box changes size). */
function mutedNote(): HTMLElement | null {
  const mute = document.getElementById('settings-mute');
  const heading = mute?.parentElement?.querySelector('h3');
  if (!heading) return null;
  const note = document.createElement('small');
  note.id = 'settings-cg-muted';
  note.className = 'cg-muted hidden';
  note.textContent = MUTED_BY_CG;
  heading.append(note);
  return note;
}

/** The room card with CrazyGames' invite: Copy invite link back, the code line under it. */
function roomCard(): void {
  const copy = document.getElementById('lobby-copy');
  const hint = document.getElementById('lobby-code-hint');
  if (!copy) return;
  copy.classList.remove('hidden');
  const box = document.createElement('div');
  box.className = 'cg-invite';
  copy.before(box);
  box.append(copy);
  if (hint) {
    hint.textContent = 'or type this code in Join room';
    box.append(hint);
  }
}

function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } catch {
    // fall through
  }
  return fallbackCopy(text);
}

function fallbackCopy(text: string): Promise<void> {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
  } catch {
    return Promise.reject(new Error('copy'));
  }
}

/** A running match's question when a friend's invite is accepted: Join leaves the match and joins, Stay keeps it. */
function askJoin(join: () => void): void {
  document.getElementById('cg-ask')?.remove();
  const card = document.createElement('div');
  card.id = 'cg-ask';
  card.className = 'cg-ask';
  card.setAttribute('role', 'dialog');
  const box = document.createElement('div');
  box.className = 'leave-ask cg-ask-box';
  const q = document.createElement('p');
  q.textContent = JOIN_ASK;
  const row = document.createElement('div');
  row.className = 'cg-ask-row';
  const yes = document.createElement('button');
  yes.id = 'cg-ask-join';
  yes.type = 'button';
  yes.className = 'btn';
  yes.textContent = 'Join';
  const no = document.createElement('button');
  no.id = 'cg-ask-stay';
  no.type = 'button';
  no.className = 'btn';
  no.textContent = 'Stay';
  row.append(yes, no);
  box.append(q, row);
  card.append(box);
  yes.addEventListener('click', () => {
    card.remove();
    join();
  });
  no.addEventListener('click', () => card.remove());
  (document.getElementById('hud') ?? document.body).append(card);
}
