// Online lobby screens (HTML): home (nickname, hero, create / join), room
// (code + invite link, players, hero, ready / start) and a busy state.

import { MAX_NAME_LENGTH, normalizeName, normalizeRoomCode, type HeroKind, type LobbyState, type PlayerId } from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';
import { HERO_COLORS, toCss } from '../render/palette';
import { HeroPicker, storedHero, storeHero } from './heroPicker';

const NAME_KEY = 'tdt.name';

export interface LobbyActions {
  create(name: string, hero: HeroKind): void;
  join(code: string, name: string, hero: HeroKind): void;
  playOffline(hero: HeroKind): void;
  setHero(hero: HeroKind): void;
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
  private readonly busyText = $('lobby-busy-text');
  private readonly error = $('lobby-error');
  private readonly name = $('lobby-name') as HTMLInputElement;
  private readonly code = $('lobby-code') as HTMLInputElement;
  private readonly roomCode = $('lobby-room-code');
  private readonly players = $('lobby-players');
  private readonly ready = $('lobby-ready') as HTMLButtonElement;
  private readonly start = $('lobby-start') as HTMLButtonElement;
  private readonly refresh = $('lobby-refresh');

  private hero: HeroKind = storedHero();
  private readonly homePicker: HeroPicker;
  private readonly roomPicker: HeroPicker;
  private amReady = false;
  private current: LobbyState | null = null;

  constructor(actions: LobbyActions) {
    this.name.value = stored(NAME_KEY);
    this.name.maxLength = MAX_NAME_LENGTH;
    const invited = normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? '');
    if (invited) this.code.value = invited;

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
    $('lobby-join').addEventListener('click', join);
    this.code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    $('lobby-offline').addEventListener('click', () => actions.playOffline(this.hero));
    this.refresh.addEventListener('click', () => location.reload());
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
    this.homePicker = new HeroPicker($('lobby-heroes-home'), this.hero, (hero) => {
      this.hero = hero;
      storeHero(hero);
    });
    this.roomPicker = new HeroPicker($('lobby-heroes-room'), this.hero, (hero) => {
      this.hero = hero;
      storeHero(hero);
      actions.setHero(hero);
    });
  }

  /** True if the page was opened from an invite link. */
  get invitedCode(): string | null {
    return normalizeRoomCode(this.code.value);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  showHome(error = ''): void {
    this.current = null;
    this.root.classList.remove('hidden');
    this.home.classList.remove('hidden');
    this.room.classList.add('hidden');
    this.busy.classList.add('hidden');
    this.refresh.classList.add('hidden');
    this.homePicker.select(this.hero);
    this.showError(error);
    const focus = !this.name.value ? this.name : this.code.value ? $('lobby-join') : $('lobby-create');
    focus.focus();
  }

  /** The server runs another protocol version: ask for a reload. */
  showVersionMismatch(): void {
    this.showHome('New version available — refresh');
    this.refresh.classList.remove('hidden');
    this.refresh.focus();
  }

  showBusy(text: string): void {
    this.root.classList.remove('hidden');
    this.home.classList.add('hidden');
    this.room.classList.add('hidden');
    this.busy.classList.remove('hidden');
    this.busyText.textContent = text;
    this.showError('');
  }

  showRoom(lobby: LobbyState, me: PlayerId | null): void {
    this.current = lobby;
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

    this.players.innerHTML = '';
    for (const p of lobby.players) {
      const li = document.createElement('li');
      li.classList.toggle('away', !p.connected);
      const dot = document.createElement('span');
      dot.className = 'hero-dot';
      dot.style.background = toCss(HERO_COLORS[p.hero].fill);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.name + (p.id === me ? ' (you)' : '');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p.id === lobby.hostId ? 'HOST' : '';
      const hero = document.createElement('span');
      hero.className = 'state';
      hero.textContent = HERO_INFO[p.hero].name;
      const state = document.createElement('span');
      state.className = `state${p.ready ? ' ready' : ''}`;
      state.textContent = !p.connected ? 'reconnecting…' : p.id === lobby.hostId ? '' : p.ready ? 'Ready' : 'Not ready';
      li.append(dot, name, tag, hero, state);
      this.players.appendChild(li);
    }

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
