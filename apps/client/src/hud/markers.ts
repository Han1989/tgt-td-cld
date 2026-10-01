// Ping markers and the quick-chat line. Pure placement is `placeMarker` (unit-tested);
// the class only wires it to DOM. Pings sit on the map, or on the edge of the play
// area when the point is off screen. Emotes are a short line, never typed text.

import type { Emote, GameEvent, PlayerId, Snapshot } from '@tdt/protocol';
import { EMOTES } from '@tdt/protocol';
import { PLAYER_COLORS } from '../render/palette';

/** How long a ping stays on screen (ms). */
export const PING_LIFE_MS = 4500;
/** How long an emote line stays (ms). */
export const EMOTE_LIFE_MS = 3200;

/** What a quick-chat id says. The button and the line both use this; nothing else can be said. */
export const EMOTE_LABEL: Record<Emote, string> = {
  help: 'Help!',
  coming: 'On my way',
  danger: 'Danger',
  thanks: 'Thanks',
  nice: 'Nice!',
  defend: 'Defend',
};

export const EMOTE_LIST: readonly Emote[] = EMOTES;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where a marker sits in `view` (px). On screen: on the point. Off screen: on the edge,
 * `pad` px in, with `angle` pointing from that edge point toward the real point
 * (radians, 0 = to the right).
 */
export function placeMarker(at: { x: number; y: number }, view: Box, pad = 22): { x: number; y: number; off: boolean; angle: number } {
  const left = view.left + pad;
  const top = view.top + pad;
  const right = Math.max(left, view.right - pad);
  const bottom = Math.max(top, view.bottom - pad);
  const inside = at.x >= left && at.x <= right && at.y >= top && at.y <= bottom;
  if (inside) return { x: at.x, y: at.y, off: false, angle: 0 };
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = at.x - cx;
  const dy = at.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy, off: false, angle: 0 };
  const hx = (right - left) / 2;
  const hy = (bottom - top) / 2;
  const sx = dx === 0 ? Infinity : hx / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hy / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s, off: true, angle: Math.atan2(dy, dx) };
}

interface LivePing {
  name: string;
  x: number;
  y: number;
  color: string;
  born: number;
  el: HTMLElement;
}

interface LiveEmote {
  born: number;
  el: HTMLElement;
}

function cssColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function playerLook(snap: Snapshot, id: PlayerId): { name: string; color: string } {
  const i = Math.max(0, snap.players.findIndex((p) => p.id === id));
  const player = snap.players[i];
  return { name: player?.name ?? 'Teammate', color: cssColor(PLAYER_COLORS[i % PLAYER_COLORS.length]!) };
}

/** DOM pings and the emote line. Call `sync` from events, then `update` each frame. */
export class MarkerLayer {
  private readonly pings: LivePing[] = [];
  private readonly emotes: LiveEmote[] = [];
  private readonly root: HTMLElement;
  private readonly feed: HTMLElement;

  constructor(doc: Document = document) {
    this.root = doc.getElementById('pings')!;
    this.feed = doc.getElementById('emote-feed')!;
  }

  sync(events: readonly GameEvent[], snap: Snapshot, now: number): void {
    for (const e of events) {
      if (e.type === 'ping') {
        const who = playerLook(snap, e.by);
        const el = document.createElement('div');
        el.className = 'ping';
        el.style.setProperty('--c', who.color);
        el.innerHTML = '<i class="ping-arrow"></i><i class="ping-ring"></i><b class="ping-name"></b>';
        el.querySelector('.ping-name')!.textContent = who.name;
        this.root.appendChild(el);
        this.pings.push({ name: who.name, x: e.x, y: e.y, color: who.color, born: now, el });
      } else if (e.type === 'emote') {
        const who = playerLook(snap, e.by);
        const el = document.createElement('div');
        el.className = 'emote-line';
        const name = document.createElement('b');
        name.textContent = who.name;
        name.style.color = who.color;
        el.append(name, document.createTextNode(` ${EMOTE_LABEL[e.emote]}`));
        this.feed.appendChild(el);
        this.emotes.push({ born: now, el });
      }
    }
  }

  /** `toScreen` maps a ping's tile position to screen px. `view` is the area markers may occupy. */
  update(now: number, toScreen: (x: number, y: number) => { x: number; y: number }, view: Box): void {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]!;
      const age = now - p.born;
      if (age >= PING_LIFE_MS) {
        p.el.remove();
        this.pings.splice(i, 1);
        continue;
      }
      const at = placeMarker(toScreen(p.x, p.y), view);
      p.el.style.left = `${at.x}px`;
      p.el.style.top = `${at.y}px`;
      p.el.classList.toggle('off', at.off);
      const arrow = p.el.querySelector('.ping-arrow') as HTMLElement;
      arrow.style.transform = `rotate(${(at.angle * 180) / Math.PI + 90}deg)`;
      const fade = age > PING_LIFE_MS - 700 ? (PING_LIFE_MS - age) / 700 : 1;
      p.el.style.opacity = String(Math.max(0, fade));
    }
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i]!;
      const age = now - e.born;
      if (age >= EMOTE_LIFE_MS) {
        e.el.remove();
        this.emotes.splice(i, 1);
        continue;
      }
      e.el.style.opacity = String(age > EMOTE_LIFE_MS - 500 ? (EMOTE_LIFE_MS - age) / 500 : 1);
    }
  }

  /**
   * An emphasized ping on a leaking lane (its portal, in tiles). Not a player ping:
   * the label is the lane name, already at the mirrored size so a clip can read it.
   */
  clutch(x: number, y: number, label: string, color: string, now: number): void {
    const el = document.createElement('div');
    el.className = 'ping mirrored clutch';
    el.style.setProperty('--c', color);
    el.innerHTML = '<i class="ping-arrow"></i><i class="ping-ring"></i><b class="ping-name"></b>';
    el.querySelector('.ping-name')!.textContent = label;
    this.root.appendChild(el);
    this.pings.push({ name: label, x, y, color, born: now, el });
  }

  /**
   * Grow the markers that were born at these times (a mirrored ping or emote).
   * The shared silhouette is separate; this is the mark still sitting on the map.
   */
  emphasize(kind: 'ping' | 'emote', bornAt: readonly number[]): void {
    const times = new Set(bornAt);
    const list = kind === 'ping' ? this.pings : this.emotes;
    for (const item of list) {
      if (times.has(item.born)) item.el.classList.add('mirrored');
    }
  }

  clear(): void {
    for (const p of this.pings) p.el.remove();
    for (const e of this.emotes) e.el.remove();
    this.pings.length = 0;
    this.emotes.length = 0;
  }
}
