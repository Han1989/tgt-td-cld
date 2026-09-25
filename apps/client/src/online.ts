// Online mode: lobby screens + NetworkTransport + the game view.

import { PROTOCOL_VERSION, type HeroKind, type LobbyState, type ServerMessage } from '@tdt/protocol';
import type { MapName } from '@tdt/sim';
import type { GameView } from './gameView';
import { LobbyUi } from './lobby/lobby';
import { showSoloPick } from './lobby/solo';
import { LocalTransport } from './transport/localTransport';
import { NetworkTransport, sessionStore, VERSION_MISMATCH, type NetStatus } from './transport/networkTransport';

export class OnlineController {
  private transport: NetworkTransport | null = null;
  private lobby: LobbyState | null = null;
  private readonly ui: LobbyUi;

  constructor(
    private readonly view: GameView,
    private readonly serverUrl: string,
  ) {
    this.ui = new LobbyUi({
      create: (name, hero) => this.connect({ t: 'create', v: PROTOCOL_VERSION, name, hero }, 'Creating room…'),
      join: (code, name, hero) => this.connect({ t: 'join', v: PROTOCOL_VERSION, code, name, hero }, `Joining ${code}…`),
      playOffline: (hero) => this.playOffline(hero),
      setHero: (hero: HeroKind) => this.transport?.send({ t: 'hero', hero }),
      setReady: (ready) => this.transport?.send({ t: 'ready', ready }),
      start: () => this.transport?.send({ t: 'start' }),
      leave: () => this.leave(),
    });
    view.onLeave = () => this.leave();
  }

  start(): void {
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
    this.ui.showBusy(busyText);
    const transport = new NetworkTransport(this.serverUrl, first);
    this.transport = transport;
    this.view.attach(transport);
    transport.onMessage((msg) => this.onMessage(transport, msg));
    transport.onStatus((status, detail) => this.onStatus(transport, status, detail));
  }

  private onMessage(transport: NetworkTransport, msg: ServerMessage): void {
    if (transport !== this.transport) return;
    switch (msg.t) {
      case 'welcome':
        this.view.hud.clearNotice();
        if (msg.room) history.replaceState(null, '', `?room=${msg.room.code}`);
        break;
      case 'lobby':
        this.lobby = msg.lobby;
        this.view.hud.setRoom(msg.lobby);
        if (msg.lobby.phase === 'lobby') {
          this.view.resetView();
          this.ui.showRoom(msg.lobby, this.view.me);
        } else {
          this.ui.hide();
        }
        break;
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
    this.transport?.dispose();
    this.transport = null;
    this.lobby = null;
    this.view.detach();
    this.view.hud.setRoom(null);
    this.view.hud.setReconnecting(false);
  }

  private playOffline(hero: HeroKind): void {
    this.transport?.close();
    this.drop();
    this.ui.hide();
    playSolo(this.view, hero);
  }
}

/**
 * Starts a local solo match (simulation in a Web Worker) with `hero`. "Change hero" on the end
 * screen reopens the hero pick; the local host starts a new match with the new hero.
 */
export function playSolo(view: GameView, hero: HeroKind, map: MapName = 'crossroads'): void {
  const transport = new LocalTransport(map);
  view.attach(transport);
  view.onChangeHero = () => showSoloPick((picked) => transport.send({ t: 'hero', hero: picked }));
  transport.send({ t: 'hero', hero });
}
