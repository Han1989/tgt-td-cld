// Online mode: lobby screens + NetworkTransport + the game view.

import { HERO_KINDS, PROTOCOL_VERSION, type GameMode, type HeroKind, type LobbyState, type ServerMessage } from '@tdt/protocol';
import { artGate, percentOf } from './artLoad/gate';
import { roomSheets, wantSheets } from './artLoad/order';
import { currentAnalytics } from './analytics/install';
import { fetchToday } from './daily/api';
import type { DailyToday } from './daily/text';
import { fetchEndlessToday } from './endless/api';
import type { GameView } from './gameView';
import { storedHero } from './lobby/heroPicker';
import { LobbyUi } from './lobby/lobby';
import { openingMode, storedMode } from './lobby/modePicker';
import { playGate } from './privacy/ageCheck';
import { sharedSettings } from './settings';
import { soloAlly } from './ally/rules';
import { beginSolo, soloMatch, type SoloPick, type SoloStart } from './tutorial/logic';
import { LocalTransport } from './transport/localTransport';
import { NetworkTransport, sessionStore, VERSION_MISMATCH, type NetStatus } from './transport/networkTransport';

export class OnlineController {
  private transport: NetworkTransport | null = null;
  private lobby: LobbyState | null = null;
  private readonly ui: LobbyUi;
  /** The home card's mode for the room this page is creating, sent once when its first lobby comes (`openingMode`). */
  private createMode: GameMode | null = null;
  /** This page's art as the room last heard it (protocol 25), and the timer that tells it as it moves. */
  private sentArt = -1;
  private artTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly view: GameView,
    private readonly serverUrl: string,
  ) {
    // The age question comes before the first room or solo match on the site (a hosted build starts at once: askAt.ts),
    // never before the lobby (docs/ANALYTICS.md "Age").
    // Nothing was sent before it, so the lobby step of the funnel goes once it is answered.
    const gated = (next: () => void) =>
      playGate(() => {
        currentAnalytics()?.funnel('lobby');
        next();
      });
    this.ui = new LobbyUi(
      {
        playSolo: (pick) => gated(() => this.playSolo('play', pick)),
        learnToPlay: (hero) => gated(() => this.playSolo('lesson', { hero, mode: storedMode() })),
      },
      {
        create: (name, hero, mode) =>
          gated(() => {
            this.connect({ t: 'create', v: PROTOCOL_VERSION, name, hero }, 'Creating room…');
            this.createMode = mode;
          }),
        join: (code, name, hero) =>
          gated(() => this.connect({ t: 'join', v: PROTOCOL_VERSION, code, name, hero }, `Joining ${code}…`)),
        setHero: (hero: HeroKind) => this.transport?.send({ t: 'hero', hero }),
        setMode: (mode: GameMode) => this.transport?.send({ t: 'mode', mode }),
        setReady: (ready) => this.transport?.send({ t: 'ready', ready }),
        start: () => this.transport?.send({ t: 'start' }),
        leave: () => this.leave(),
      },
      {
        today: () => fetchToday(),
        play: (hero, today) => gated(() => this.playDaily(hero, today)),
      },
      { today: () => fetchEndlessToday() },
    );
    view.onLeave = () => this.leave();
    // ⚙ → Learn to play: the lesson at once, leaving an online room or ending a solo match first.
    view.onLearnToPlay = () => playGate(() => this.playSolo('lesson', { hero: storedHero(), mode: storedMode() }));
  }

  start(): void {
    currentAnalytics()?.funnel('lobby');
    // After a reload, take our seat back if the room still has it.
    const saved = sessionStore.load();
    if (saved && saved.url === this.serverUrl) {
      this.connect({ t: 'rejoin', v: PROTOCOL_VERSION, code: saved.code, token: saved.token }, `Rejoining ${saved.code}…`);
      return;
    }
    this.ui.showHome();
  }

  private connect(first: ConstructorParameters<typeof NetworkTransport>[1], busyText: string): void {
    this.transport?.close();
    this.createMode = null;
    this.ui.showBusy(busyText);
    const transport = new NetworkTransport(this.serverUrl, first);
    this.transport = transport;
    this.view.attach(transport);
    transport.onMessage((msg) => this.onMessage(transport, msg));
    transport.onStatus((status, detail) => this.onStatus(transport, status, detail));
    this.reportArt(transport);
  }

  /**
   * A room's ready rule (protocol 25, V-08b load-all): every picture a room's match draws starts loading now (the
   * room's heroes all three), and the room hears this page's share of it as it moves, a whole percent, at most four
   * times a second; Ready and the host's Start wait for 100 from everyone.
   */
  private reportArt(transport: NetworkTransport): void {
    this.stopArtReport();
    this.sentArt = -1;
    const ids = roomSheets();
    wantSheets(ids);
    const tick = () => {
      if (transport !== this.transport) return this.stopArtReport();
      const pct = percentOf(ids);
      this.ui.setMyArt(pct, this.view.me);
      if (pct === this.sentArt || !transport.session) return;
      this.sentArt = pct;
      transport.send({ t: 'art', pct });
      if (pct === 100) this.stopArtReport();
    };
    tick();
    this.artTimer = setInterval(tick, 250);
  }

  private stopArtReport(): void {
    if (this.artTimer) clearInterval(this.artTimer);
    this.artTimer = null;
  }

  private onMessage(transport: NetworkTransport, msg: ServerMessage): void {
    if (transport !== this.transport) return;
    switch (msg.t) {
      case 'welcome':
        this.view.hud.clearNotice();
        // A new connection (a rejoin too): the room hears this page's art again.
        if (this.sentArt !== 100) this.sentArt = -1;
        else transport.send({ t: 'art', pct: 100 });
        if (msg.room) history.replaceState(null, '', `?room=${msg.room.code}`);
        break;
      case 'lobby': {
        let lobby = msg.lobby;
        if (this.createMode) {
          // The room this page just created opens on the server's Full: the home card's mode, as the host's pick.
          const mode = openingMode(lobby, this.view.me, this.createMode);
          this.createMode = null;
          if (mode) {
            transport.send({ t: 'mode', mode });
            // Shown at once, so the room card never opens on Full for a moment; the server's next lobby says the same.
            lobby = { ...lobby, mode };
          }
        }
        const started = lobby.phase === 'playing' && this.lobby?.phase !== 'playing';
        this.lobby = lobby;
        this.view.hud.setRoom(lobby);
        if (lobby.phase === 'lobby') {
          artGate.cancel();
          this.view.resetView();
          this.ui.showRoom(lobby, this.view.me);
        } else {
          this.ui.hide();
        }
        if (started) {
          this.view.matchStarting();
          // A page that joins a running match (a rejoin after a reload) loads first, then sees it: the wait's card
          // covers the match until every picture is in. A room started the normal way is in already: no card.
          const mine = lobby.players.find((p) => p.id === this.view.me)?.hero ?? storedHero();
          artGate.wait({ mode: lobby.mode, heroes: HERO_KINDS, hero: mine, back: () => this.leave(), backLabel: 'Leave room' }, () => {});
        }
        break;
      }
      case 'error':
        if (msg.code === 'version_mismatch') {
          this.versionMismatch();
        } else if (!this.lobby || msg.code === 'rejoin_failed' || msg.code === 'room_not_found' || msg.code === 'wrong_server') {
          // Could not get into a room: back to the home screen.
          this.drop();
          this.ui.showHome(msg.message);
        } else if (this.lobby.phase === 'lobby') {
          this.ui.showError(msg.message);
        } else {
          this.view.hud.toast(msg.message);
        }
        break;
      case 'notice':
        this.view.hud.notice(msg.message, msg.closesInMs);
        if (this.lobby?.phase === 'lobby') this.ui.showError(msg.message);
        break;
      default:
        break;
    }
  }

  private onStatus(transport: NetworkTransport, status: NetStatus, detail?: string): void {
    if (transport !== this.transport) return;
    this.view.hud.setReconnecting(status === 'reconnecting');
    if (status !== 'closed' || detail === 'left') return;
    if (detail === VERSION_MISMATCH) return this.versionMismatch();
    const why =
      detail === 'server_restarting'
        ? 'The server restarted. Create a new room to keep playing.'
        : `Disconnected from the server${detail ? ` (${detail})` : ''}.`;
    this.drop();
    this.ui.showHome(why);
  }

  /** This page is older (or newer) than the server: only a reload helps. */
  private versionMismatch(): void {
    this.drop();
    this.ui.showVersionMismatch();
  }

  /** Leave the room for good. */
  private leave(): void {
    this.transport?.close();
    this.drop();
    history.replaceState(null, '', location.pathname);
    this.ui.showHome();
  }

  /** Forget the connection without leaving the room. */
  private drop(): void {
    this.stopArtReport();
    if (this.lobby) artGate.cancel();
    this.transport?.dispose();
    this.transport = null;
    this.lobby = null;
    this.createMode = null;
    this.view.detach();
    this.view.hud.setRoom(null);
    this.view.hud.setReconnecting(false);
  }

  /**
   * Play solo (the home card's hero and mode) or Learn to play (from the home card or ⚙), at once: a local match,
   * leaving an online room first. "Back to lobby" on its end screen comes back to the home card.
   */
  private playSolo(start: SoloStart, pick: SoloPick): void {
    afterArt(pick.hero, pick.mode, () => this.playSoloNow(start, pick), allyOf(start, pick));
  }

  private playSoloNow(start: SoloStart, pick: SoloPick): void {
    const inRoom = this.transport !== null;
    this.transport?.close();
    this.drop();
    if (inRoom) history.replaceState(null, '', location.pathname);
    this.ui.hide();
    playSolo(this.view, start, pick, () => this.ui.showHome());
  }

  /** The Daily tile: today's run on the card's hero, locally like Play solo, leaving an online room first. */
  private playDaily(hero: HeroKind, today: DailyToday): void {
    afterArt(hero, 'quick', () => this.playDailyNow(hero, today));
  }

  private playDailyNow(hero: HeroKind, today: DailyToday): void {
    const inRoom = this.transport !== null;
    this.transport?.close();
    this.drop();
    if (inRoom) history.replaceState(null, '', location.pathname);
    this.ui.hide();
    playDaily(this.view, hero, today, () => this.ui.showHome());
  }
}

let soloTransport: LocalTransport | null = null;

/**
 * A solo match (Play solo, Learn to play, the Daily run) starts once every picture it draws is in (V-08b load-all,
 * artLoad/gate.ts): at once when they are, else after the wait's card. Back drops the wait and leaves the home card as
 * it was.
 */
export function afterArt(hero: HeroKind, mode: GameMode, go: () => void, ally: HeroKind | null = null): void {
  artGate.wait({ mode, heroes: ally ? [hero, ally] : [hero], hero, back: () => {} }, go);
}

/** The bot teammate a solo start will have (q6): `soloAlly` with ⚙'s switch. */
export function allyOf(start: SoloStart, pick: SoloPick): HeroKind | null {
  return soloAlly(soloMatch(start, pick), sharedSettings().get().botTeammate);
}

/** Stops the local match, if one is running (⚙ → Learn to play starts the lesson in its place). */
export function endSolo(view: GameView): void {
  soloTransport?.close();
  soloTransport = null;
  view.detach();
}

/**
 * Starts a local solo match (simulation in a Web Worker), always on Normal. `start` says how: Play solo runs `pick` as
 * it is; Learn to play runs the lesson (Quick, the picked hero). Never the lesson otherwise, whatever is stored
 * (`beginSolo`). "Back to lobby" on the end screen ends the match and calls `home` (the home card, which carries
 * both picks).
 */
export function playSolo(view: GameView, start: SoloStart, pick: SoloPick, home: () => void): void {
  const match = beginSolo(sharedSettings(), start, pick);
  const transport = startLocal(view, home);
  // The bot teammate first (a control message): the matches below start with it, or without.
  transport.ally(soloAlly(match, sharedSettings().get().botTeammate) !== null);
  // Each of these starts a new match in the local host; the last one is the match played.
  transport.send({ t: 'mode', mode: match.mode });
  transport.send({ t: 'hero', hero: match.hero });
  view.setLesson(match.lesson);
}

/**
 * Starts today's Daily run locally (docs/GAME_DESIGN.md "Daily run"): Play solo's flow on `hero`, with the day's seed,
 * Quick on Hard (the local host's daily control). Play again runs the same day's seed again: tries are unlimited. Its
 * end screen offers Post my run; "Back to lobby" comes back to the home card.
 */
export function playDaily(view: GameView, hero: HeroKind, today: DailyToday, home: () => void): void {
  const transport = startLocal(view, home);
  // Counts as a solo start for the lesson offer, like Play solo; never the lesson.
  beginSolo(sharedSettings(), 'play', { hero, mode: 'quick' });
  transport.daily(today.seed);
  transport.send({ t: 'hero', hero });
  view.setLesson(false);
  view.setDaily({ day: today.day, seed: today.seed });
}

/** A new local host attached to the view; "Back to lobby" on its end screen ends it and calls `home`. */
function startLocal(view: GameView, home: () => void): LocalTransport {
  endSolo(view);
  const transport = new LocalTransport();
  soloTransport = transport;
  view.attach(transport);
  view.matchStarting();
  view.onChangeHero = () => {
    endSolo(view);
    home();
  };
  return transport;
}
