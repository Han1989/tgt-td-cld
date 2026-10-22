// Lobby screens (HTML), each one phone screen: the home card (the hero stage, the hero buttons, Mode, the Daily run's
// tile, Play solo, then nickname and create / join for friends), the room card (code + invite link, the seats, your
// hero, the host's mode, ready / start) and a busy state. A build with no game server shows the home card alone, with
// no friends' controls and no Daily tile.

import {
  HERO_KINDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  normalizeName,
  normalizeRoomCode,
  type GameMode,
  type HeroKind,
  type LobbyState,
  type PlayerId,
} from '@tdt/protocol';
import { dailyTileLine, type DailyToday } from '../daily/text';
import { endlessBest } from '../endless/best';
import { HERO_INFO } from '../heroInfo';
import { heroIcon, iconVar } from '../render/art/icons';
import { HERO_COLORS, toCss } from '../render/palette';
import { updateAndReload } from '../platform/pwa';
import { sharedSettings } from '../settings';
import { lessonOffer, type SoloPick } from '../tutorial/logic';
import { HeroPicker, storedHero, storeHero } from './heroPicker';
import { HeroStage } from './heroStage';
import { dropStoredDifficulty, ModePicker, storedMode, storeMode } from './modePicker';
import { storedName, storeName } from './nickname';

/** The home card's solo controls (every build). */
export interface SoloActions {
  /** Play solo: a match with the card's hero and mode, at once. */
  playSolo(pick: SoloPick): void;
  /** "New here? Learn to play": the lesson with this hero, straight away. */
  learnToPlay(hero: HeroKind): void;
}

/** The Daily run's tile (a build with a game server). */
export interface DailyActions {
  /** Today's run, or null: the tile stays hidden (the request failed). */
  today(): Promise<DailyToday | null>;
  /** One tap on the tile: today's run on the card's hero. */
  play(hero: HeroKind, today: DailyToday): void;
}

/** The friends' controls and the room card (a build with a game server). */
export interface RoomActions {
  create(name: string, hero: HeroKind): void;
  join(code: string, name: string, hero: HeroKind): void;
  setHero(hero: HeroKind): void;
  /** Host only: the match mode. */
  setMode(mode: GameMode): void;
  setReady(ready: boolean): void;
  start(): void;
  leave(): void;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
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

  private hero: HeroKind = storedHero();
  /** The page was opened from an invite link (`?room=CODE`): Join is the main button, not Play solo. */
  private readonly invited: boolean;
  private readonly stage: HeroStage;
  private readonly homePicker: HeroPicker;
  private readonly homeMode: ModePicker;
  private readonly roomPicker: HeroPicker;
  private readonly modePicker: ModePicker;
  private amReady = false;
  private current: LobbyState | null = null;
  private readonly dailyTile = $('lobby-daily') as HTMLButtonElement;
  private readonly dailyLine = $('lobby-daily-line');
  /** Today's run as the tile last heard it, and which request is the latest (an older answer is dropped). */
  private dailyToday: DailyToday | null = null;
  private dailyAsk = 0;

  /**
   * `room` and `daily` are null in a build with no game server: the home card has no friends' controls, no room card
   * and no Daily tile.
   */
  constructor(
    solo: SoloActions,
    room: RoomActions | null,
    private readonly daily: DailyActions | null = null,
  ) {
    dropStoredDifficulty();
    this.name.value = storedName();
    this.name.maxLength = MAX_NAME_LENGTH;
    const invited = room ? normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? '') : null;
    if (invited) this.code.value = invited;
    // One main (rune-teal) button on the home card: Play solo, or Join for a friend who came by an invite link,
    // whose nickname and code then come before Mode and Play solo (style.css `#lobby-home.invited`).
    this.invited = !!invited;
    this.home.classList.toggle('invited', this.invited);
    this.joinBtn.classList.toggle('big', this.invited);
    this.offline.classList.toggle('big', !this.invited);
    $('lobby-friends').classList.toggle('hidden', !room);

    // Play solo starts the match with the card's hero and mode at once, never the lesson; the line under it is how a
    // new player picks the lesson.
    this.homeMode = new ModePicker($('lobby-mode-home'), storedMode(), storeMode, $('lobby-mode-home-best'));
    this.offline.addEventListener('click', () => solo.playSolo({ hero: this.hero, mode: this.homeMode.mode }));
    $('lobby-learn-btn').addEventListener('click', () => solo.learnToPlay(this.hero));
    // Through the service worker, so a cached old app shell can't survive the refresh.
    this.refresh.addEventListener('click', () => void updateAndReload());
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
      room?.setHero(hero);
    });
    this.modePicker = new ModePicker($('lobby-mode-room'), 'full', (mode) => room?.setMode(mode), $('lobby-mode-room-best'));
    if (room) this.bindRoom(room);
    this.dailyTile.addEventListener('click', () => {
      if (this.daily && this.dailyToday) this.daily.play(this.hero, this.dailyToday);
    });
  }

  /** Asks for today's run and shows the tile with its live line, or hides it when the server does not answer. */
  private syncDaily(): void {
    if (!this.daily) return this.showDaily(null);
    const ask = ++this.dailyAsk;
    void this.daily.today().then(
      (today) => {
        if (ask === this.dailyAsk) this.showDaily(today);
      },
      () => {
        if (ask === this.dailyAsk) this.showDaily(null);
      },
    );
  }

  private showDaily(today: DailyToday | null): void {
    this.dailyToday = today;
    this.dailyTile.classList.toggle('hidden', !today);
    this.home.classList.toggle('has-daily', !!today);
    if (!today) return;
    const line = dailyTileLine(today, Date.now());
    this.dailyLine.textContent = line.text;
    this.dailyLine.classList.toggle('you', line.you);
  }

  /** The friends' controls on the home card, and the room card's buttons. */
  private bindRoom(actions: RoomActions): void {
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
  }

  /** The room card's line under the hero buttons, and the hero's best Endless wave on the Mode row. */
  private syncRoomHero(): void {
    this.roomRole.textContent = HERO_INFO[this.hero].role;
    this.roomBlurb.textContent = HERO_INFO[this.hero].blurb;
    this.modePicker.showBest(endlessBest(this.hero));
  }

  /** The home card's stage, the line under the hero buttons and the Mode row's best show the picked hero. */
  private syncStage(): void {
    const info = HERO_INFO[this.hero];
    this.stage.show(this.hero);
    this.role.textContent = info.role;
    this.blurb.textContent = info.blurb;
    this.homeMode.showBest(endlessBest(this.hero));
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
    this.refresh.classList.add('hidden');
    // The hero may have been picked in a room since (every hero picker stores it).
    this.hero = storedHero();
    this.homePicker.select(this.hero);
    this.homeMode.select(storedMode());
    this.syncStage();
    this.stage.start();
    this.syncLesson();
    this.syncDaily();
    // A nickname typed on a Daily run's end screen fills the field.
    if (!this.name.value) this.name.value = storedName();
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
    storeName(name);
    return name;
  }
}

/** The mode's label on the room card; a guest sees "(the host picks)" with it. The best Endless wave's note stays. */
function hostLabel(el: HTMLElement, name: string, host: boolean): void {
  const best = el.querySelector('.mode-best');
  el.textContent = name;
  if (!host) {
    const note = document.createElement('small');
    note.textContent = '(the host picks)';
    el.append(note);
  }
  if (best) el.append(best);
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
