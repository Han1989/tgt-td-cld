// Online lobby screens (HTML): home (the hero stage, Play solo, then nickname and create / join for
// friends), room (code + invite link, the seats, your hero, the host's picks, ready / start) and a busy state.
// The solo pick is solo.ts.

import {
  HERO_KINDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  normalizeName,
  normalizeRoomCode,
  type Difficulty,
  type GameMode,
  type HeroKind,
  type LobbyState,
  type ModifierAction,
  type PlayerId,
} from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';
import { heroIcon, iconVar } from '../render/art/icons';
import { HERO_COLORS, toCss } from '../render/palette';
import { updateAndReload } from '../platform/pwa';
import { sharedSettings } from '../settings';
import { lessonOffer } from '../tutorial/logic';
import { DifficultyPicker } from './difficultyPicker';
import { HeroPicker, storedHero, storeHero } from './heroPicker';
import { HeroStage } from './heroStage';
import { renderModifierLobby } from './modifierPicker';
import { ModePicker } from './modePicker';

const NAME_KEY = 'tdt.name';

export interface LobbyActions {
  create(name: string, hero: HeroKind): void;
  join(code: string, name: string, hero: HeroKind): void;
  playOffline(): void;
  /** "New here? Learn to play": the lesson with this hero, straight away. */
  learnToPlay(hero: HeroKind): void;
  setHero(hero: HeroKind): void;
  /** Host only: the match mode. */
  setMode(mode: GameMode): void;
  /** Host only: Normal or Hard. */
  setDifficulty(difficulty: Difficulty): void;
  /** Host only: reroll, choose none, or turn the seed's draw back on. */
  setModifiers(action: ModifierAction): void;
  setReady(ready: boolean): void;
  start(): void;
  leave(): void;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function stored(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/** Invite link for a room: the current page with `?room=CODE`. */
export function inviteLink(code: string, href = location.href): string {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export class LobbyUi {
  private readonly root = $('lobby');
  private readonly home = $('lobby-home');
  private readonly room = $('lobby-room');
  private readonly busy = $('lobby-busy');
  private readonly solo = $('lobby-solo');
  private readonly busyText = $('lobby-busy-text');
  private readonly error = $('lobby-error');
  private readonly name = $('lobby-name') as HTMLInputElement;
  private readonly code = $('lobby-code') as HTMLInputElement;
  private readonly offline = $('lobby-offline');
  private readonly joinBtn = $('lobby-join');
  private readonly role = $('lobby-hero-role');
  private readonly blurb = $('lobby-hero-blurb');
  private readonly roomRole = $('lobby-room-role');
  private readonly roomBlurb = $('lobby-room-blurb');
  private readonly roomCode = $('lobby-room-code');
  private readonly players = $('lobby-players');
  private readonly playersCount = $('lobby-players-count');
  private readonly ready = $('lobby-ready') as HTMLButtonElement;
  private readonly start = $('lobby-start') as HTMLButtonElement;
  private readonly refresh = $('lobby-refresh');
  private readonly modeLabel = $('lobby-mode-room-label');
  private readonly difficultyLabel = $('lobby-difficulty-room-label');
  private readonly modifiersLabel = $('lobby-modifiers-room-label');
  private readonly setModifiers: (action: ModifierAction) => void;

  private hero: HeroKind = storedHero();
  /** The page was opened from an invite link (`?room=CODE`): Join is the main button, not Play solo. */
  private readonly invited: boolean;
  private readonly stage: HeroStage;
  private readonly homePicker: HeroPicker;
  private readonly roomPicker: HeroPicker;
  private readonly modePicker: ModePicker;
  private readonly difficultyPicker: DifficultyPicker;
  private amReady = false;
  private current: LobbyState | null = null;

  constructor(actions: LobbyActions) {
    this.setModifiers = actions.setModifiers;
    this.name.value = stored(NAME_KEY);
    this.name.maxLength = MAX_NAME_LENGTH;
    const invited = normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? '');
    if (invited) this.code.value = invited;
    // One main (rune-teal) button on the home card: Play solo, or Join for a friend who came by an invite link,
    // whose nickname and code then come before Play solo (style.css `#lobby-home.invited`).
    this.invited = !!invited;
    this.home.classList.toggle('invited', this.invited);
    this.joinBtn.classList.toggle('big', this.invited);
    this.offline.classList.toggle('big', !this.invited);

    $('lobby-create').addEventListener('click', () => {
      const name = this.validName();
      if (name) actions.create(name, this.hero);
    });
    const join = () => {
      const name = this.validName();
      if (!name) return;
      const code = normalizeRoomCode(this.code.value);
      if (!code) return this.showError('Room codes are 5 letters');
      actions.join(code, name, this.hero);
    };
    this.joinBtn.addEventListener('click', join);
    this.code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    // Play solo opens the solo pick and never starts the lesson; the line under it is how a new player picks the lesson.
    this.offline.addEventListener('click', () => actions.playOffline());
    $('lobby-learn-btn').addEventListener('click', () => actions.learnToPlay(this.hero));
    // Through the service worker, so a cached old app shell can't survive the refresh.
    this.refresh.addEventListener('click', () => void updateAndReload());
    $('lobby-leave').addEventListener('click', () => actions.leave());
    this.ready.addEventListener('click', () => actions.setReady(!this.amReady));
    this.start.addEventListener('click', () => actions.start());
    $('lobby-copy').addEventListener('click', () => {
      if (!this.current) return;
      const link = inviteLink(this.current.code);
      navigator.clipboard?.writeText(link).then(
        () => this.flash('Invite link copied'),
        () => this.flash(link),
      );
    });
    this.stage = new HeroStage($('lobby-stage'), HERO_KINDS, this.hero);
    this.homePicker = new HeroPicker($('lobby-heroes-home'), this.hero, (hero) => {
      this.hero = hero;
      storeHero(hero);
      this.syncStage();
    });
    this.roomPicker = new HeroPicker($('lobby-heroes-room'), this.hero, (hero) => {
      this.hero = hero;
      storeHero(hero);
      this.syncRoomHero();
      actions.setHero(hero);
    });
    this.modePicker = new ModePicker($('lobby-mode-room'), 'full', (mode) => actions.setMode(mode), $('lobby-mode-room-line'));
    this.difficultyPicker = new DifficultyPicker(
      $('lobby-difficulty-room'),
      'normal',
      (difficulty) => actions.setDifficulty(difficulty),
      $('lobby-difficulty-room-line'),
    );
  }

  /** The room card's line under the hero buttons. */
  private syncRoomHero(): void {
    this.roomRole.textContent = HERO_INFO[this.hero].role;
    this.roomBlurb.textContent = HERO_INFO[this.hero].blurb;
  }

  /** The home card's stage and the line under the hero buttons show the picked hero. */
  private syncStage(): void {
    const info = HERO_INFO[this.hero];
    this.stage.show(this.hero);
    this.role.textContent = info.role;
    this.blurb.textContent = info.blurb;
  }

  /** "New here? Learn to play" until the first solo match; it does not come back on its own (⚙ → Lesson stays). */
  private syncLesson(): void {
    $('lobby-learn').classList.toggle('hidden', !lessonOffer(sharedSettings().get().tutorial));
  }

  /** True if the page was opened from an invite link. */
  get invitedCode(): string | null {
    return normalizeRoomCode(this.code.value);
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.stage.stop();
  }

  showHome(error = ''): void {
    this.current = null;
    this.root.classList.remove('hidden');
    this.home.classList.remove('hidden');
    this.room.classList.add('hidden');
    this.busy.classList.add('hidden');
    this.solo.classList.add('hidden');
    this.refresh.classList.add('hidden');
    // The hero may have been picked on the solo pick or in a room since (every picker stores it).
    this.hero = storedHero();
    this.homePicker.select(this.hero);
    this.syncStage();
    this.stage.start();
    this.syncLesson();
    this.showError(error);
    // Keyboard focus starts on the main button (with a mouse or trackpad; a phone shows no ring on it), or on
    // the nickname an invited friend still has to type. Never scroll the card for it.
    const focus = this.invited ? (this.name.value ? this.joinBtn : this.name) : this.offline;
    if (this.invited || matchMedia('(pointer: fine)').matches) focus.focus({ preventScroll: true });
  }

  /** The server runs another protocol version: ask for a reload. */
  showVersionMismatch(): void {
    this.showHome('New version available — refresh');
    this.refresh.classList.remove('hidden');
    this.refresh.focus();
  }

  showBusy(text: string): void {
    this.stage.stop();
    this.root.classList.remove('hidden');
    this.home.classList.add('hidden');
    this.room.classList.add('hidden');
    this.solo.classList.add('hidden');
    this.busy.classList.remove('hidden');
    this.busyText.textContent = text;
    this.showError('');
  }

  showRoom(lobby: LobbyState, me: PlayerId | null): void {
    this.current = lobby;
    this.stage.stop();
    this.root.classList.remove('hidden');
    this.home.classList.add('hidden');
    this.busy.classList.add('hidden');
    this.solo.classList.add('hidden');
    this.room.classList.remove('hidden');
    this.roomCode.textContent = lobby.code;

    const isHost = lobby.hostId === me;
    const self = lobby.players.find((p) => p.id === me);
    this.amReady = !!self?.ready;
    if (self) this.hero = self.hero;
    this.roomPicker.select(this.hero);
    this.syncRoomHero();
    this.modePicker.select(lobby.mode);
    this.modePicker.setEnabled(isHost);
    hostLabel(this.modeLabel, 'Mode', isHost);
    this.difficultyPicker.select(lobby.difficulty);
    this.difficultyPicker.setEnabled(isHost);
    hostLabel(this.difficultyLabel, 'Difficulty', isHost);
    hostLabel(this.modifiersLabel, 'Modifiers', isHost);
    renderModifierLobby($('lobby-modifiers-room'), lobby, isHost, (action) => this.setModifiers(action));

    const seats = lobby.players.length;
    this.playersCount.textContent = `Players ${seats} / ${MAX_PLAYERS} · one per lane`;
    this.players.replaceChildren(
      ...lobby.players.map((p) => seat(p, p.id === me, p.id === lobby.hostId)),
      ...Array.from({ length: Math.max(0, MAX_PLAYERS - seats) }, openSeat),
    );

    this.ready.classList.toggle('hidden', isHost);
    this.ready.textContent = this.amReady ? 'Not ready' : 'Ready';
    this.ready.classList.toggle('waiting', this.amReady);
    this.start.classList.toggle('hidden', !isHost);
    const allReady = lobby.players.every((p) => p.id === lobby.hostId || (p.ready && p.connected));
    this.start.disabled = !allReady;
    this.start.textContent = allReady ? 'Start match' : 'Waiting for players…';
  }

  showError(message: string): void {
    this.error.textContent = message;
  }

  private flash(message: string): void {
    this.showError('');
    const el = this.error;
    el.style.color = 'var(--accent)';
    el.textContent = message;
    setTimeout(() => {
      if (el.textContent === message) el.textContent = '';
      el.style.color = '';
    }, 2500);
  }

  private validName(): string | null {
    const name = normalizeName(this.name.value);
    if (!name) {
      this.showError(`Pick a nickname (1–${MAX_NAME_LENGTH} characters)`);
      this.name.focus();
      return null;
    }
    store(NAME_KEY, name);
    return name;
  }
}

/** A pick's label on the room card; a guest sees "(the host picks)" with it. */
function hostLabel(el: HTMLElement, name: string, host: boolean): void {
  el.textContent = name;
  if (host) return;
  const note = document.createElement('small');
  note.textContent = '(the host picks)';
  el.append(note);
}

/** One seat on the room card: the hero's emblem, the name, the hero, and Host, Ready, Not ready or reconnecting. */
function seat(p: LobbyState['players'][number], you: boolean, host: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'seat';
  li.classList.toggle('away', !p.connected);
  li.classList.toggle('you', you);
  li.dataset.hero = p.hero;
  li.style.setProperty('--seat', toCss(HERO_COLORS[p.hero].fill));
  const emblem = document.createElement('i');
  emblem.className = 'ico hero-ico';
  emblem.style.setProperty('--ico', iconVar(heroIcon(p.hero)));
  const who = document.createElement('span');
  who.className = 'seat-who';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = p.name + (you ? ' (you)' : '');
  const hero = document.createElement('span');
  hero.className = 'seat-hero';
  hero.textContent = HERO_INFO[p.hero].name;
  who.append(name, hero);
  const state = document.createElement('span');
  state.className = `state${!p.connected ? '' : host ? ' host' : p.ready ? ' ready' : ''}`;
  state.textContent = !p.connected ? 'reconnecting…' : host ? 'Host' : p.ready ? 'Ready' : 'Not ready';
  li.append(emblem, who, state);
  return li;
}

function openSeat(): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'seat open';
  li.textContent = 'Open seat: send the invite link';
  return li;
}
