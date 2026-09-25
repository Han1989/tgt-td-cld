// HTML/CSS HUD: gold, Heart HP, wave, next-wave timer, hero panel, tower
// menus, toasts and the victory / defeat screen. Reads snapshots only.

import {
  isBossKind,
  TARGET_PRIORITIES,
  TOWER_KINDS,
  type BossKind,
  type GameEvent,
  type HeroKind,
  type HeroSnap,
  type LobbyState,
  type PlayerId,
  type PlayerSnap,
  type SkillSlot,
  type Snapshot,
  type TargetPriority,
  type TowerKind,
  type TowerSnap,
} from '@tdt/protocol';
import { getMap, TILE_PX, TUNING } from '@tdt/sim';
import type { Camera } from '../input/camera';
import { HERO_INFO } from '../heroInfo';
import { CREEP_NAMES, HERO_COLORS, toCss, TOWER_NAMES } from '../render/palette';
import type { UiState } from '../uiState';
import { buildCost, maxTier, PRIORITY_HINTS, PRIORITY_NAMES, targetsText, towerStatRows, upgradeCost } from './towerInfo';

/** Amounts offered by the gift buttons in the team panel. */
const GIFT_AMOUNTS = [25, 100] as const;

interface TeamRow {
  lvl: HTMLElement;
  fill: HTMLElement;
  gold: HTMLElement;
  gifts: HTMLButtonElement[];
}

const BOSS_HINTS: Record<BossKind, string> = {
  ironhorn: 'Ironhorn stomps: it stuns heroes and towers close to it',
  matriarch: 'The Matriarch hatches broods of hatchlings as it walks',
  shardback: 'Shardback shifts its hide: Stone resists physical, Ether resists magic',
};

const TOWER_BLURBS: Record<TowerKind, string> = {
  arrow: 'Fast single target. Hits air.',
  cannon: 'Slow splash damage. Ground only.',
  frost: 'Magic damage, slows 30%. Hits air.',
  arcane: 'Heavy magic damage, ignores armour. Hits air.',
  flak: 'High burst damage with splash. Air only.',
};

interface SkillButton {
  root: HTMLButtonElement;
  learn: HTMLButtonElement;
  cd: HTMLElement;
  cdText: HTMLElement;
  pips: HTMLElement;
  /** Mana cost, "passive", or the level that unlocks it. */
  tag: HTMLElement;
}

export interface HudActions {
  build(padId: number, tower: TowerKind): void;
  sell(towerId: number): void;
  upgrade(towerId: number): void;
  setPriority(towerId: number, priority: TargetPriority): void;
  callEarly(): void;
  /** Online only: give some of your gold to a teammate. */
  gift(to: PlayerId, amount: number): void;
  learn(slot: SkillSlot): void;
  pressSkill(slot: SkillSlot): void;
  restart(): void;
  /** Solo only: pick another hero for the next match. */
  changeHero(): void;
  /** Online only: leave the room from the end screen. */
  leave(): void;
  closeMenus(): void;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setWidth(el: HTMLElement, frac: number): void {
  const w = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  if (el.style.width !== w) el.style.width = w;
}

export function formatSeconds(ticks: number, tickRate: number): string {
  const s = Math.ceil(ticks / tickRate);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  private readonly gold = $('gold');
  private readonly heartFill = $('heart-fill');
  private readonly heartText = $('heart-text');
  private readonly wave = $('wave');
  private readonly timerLabel = $('timer-label');
  private readonly timer = $('timer');
  private readonly callEarly = $('call-early') as HTMLButtonElement;
  private readonly buildHint = $('build-hint');
  private readonly heroPanel = $('hero-panel');
  private readonly heroName = $('hero-name');
  private readonly heroRole = $('hero-role');
  private readonly portrait = $('portrait');
  private readonly heroLevel = $('hero-level');
  private readonly skillPoints = $('skill-points');
  private readonly xpFill = $('xp-fill');
  private readonly hpFill = $('hp-fill');
  private readonly hpText = $('hp-text');
  private readonly manaFill = $('mana-fill');
  private readonly manaText = $('mana-text');
  private readonly skills = $('skills');
  private readonly respawn = $('respawn');
  private readonly padMenu = $('pad-menu');
  private readonly towerPanel = $('tower-panel');
  private readonly toasts = $('toasts');
  private readonly banner = $('banner');
  private readonly endScreen = $('end-screen');
  private readonly endTitle = $('end-title');
  private readonly endText = $('end-text');
  private readonly restartBtn = $('restart') as HTMLButtonElement;
  private readonly changeHeroBtn = $('end-change-hero') as HTMLButtonElement;
  private readonly endLeave = $('end-leave');
  private readonly team = $('team');
  private readonly teamCode = $('team-code');
  private readonly teamList = $('team-list');
  private readonly noticeEl = $('notice');
  private readonly reconnecting = $('reconnecting');

  /** Online room (null in local solo mode). */
  private room: LobbyState | null = null;
  private noticeText = '';
  private noticeDeadline = 0;
  private teamKey = '';
  private readonly teamRows = new Map<PlayerId, TeamRow>();

  private skillButtons = new Map<SkillSlot, SkillButton>();
  /** Hero kind the skill buttons were built for. */
  private skillKind: HeroKind | null = null;
  private openPad: number | null = null;
  private openTower: number | null = null;
  private menuKey = '';

  constructor(
    private readonly camera: Camera,
    private readonly ui: UiState,
    private readonly actions: HudActions,
  ) {
    this.callEarly.addEventListener('click', () => actions.callEarly());
    // Don't leave HUD buttons focused, or Space (centre camera) would click them again.
    $('hud').addEventListener('click', () => {
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    });
    this.restartBtn.addEventListener('click', () => actions.restart());
    this.changeHeroBtn.addEventListener('click', () => actions.changeHero());
    this.endLeave.addEventListener('click', () => actions.leave());
    // Keep clicks on HUD panels from reaching the canvas.
    for (const el of [this.padMenu, this.towerPanel, this.callEarly]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }

  update(snap: Snapshot, me: PlayerId | null): void {
    const player = snap.players.find((p) => p.id === me);
    const hero = snap.heroes.find((h) => h.owner === me);

    setText(this.gold, String(player?.gold ?? 0));
    setWidth(this.heartFill, snap.heartHp / snap.heartMaxHp);
    setText(this.heartText, `${snap.heartHp} / ${snap.heartMaxHp}`);
    setText(this.wave, `${snap.wave} / ${snap.totalWaves}`);

    if (snap.nextWaveIn < 0) {
      setText(this.timerLabel, 'Final wave');
      setText(this.timer, '');
    } else {
      setText(this.timerLabel, snap.phase === 'build' ? 'First wave in' : 'Next wave');
      setText(this.timer, formatSeconds(snap.nextWaveIn, snap.tickRate));
    }
    const canCall = snap.nextWaveIn >= 0 && (snap.phase === 'build' || snap.phase === 'waves');
    this.callEarly.disabled = !canCall;
    const callHtml = canCall ? `Call early <span class="bonus">+${snap.callEarlyBonus}</span>` : 'Call early';
    if (this.callEarly.innerHTML !== callHtml) this.callEarly.innerHTML = callHtml;

    this.updateBuildHint(player?.gold ?? 0);
    if (hero) this.updateHero(hero, snap.tickRate);
    this.updateMenus(snap, me, player?.gold ?? 0);

    this.updateTeam(snap, me);
    this.updateNotice();

    const over = snap.phase === 'victory' || snap.phase === 'defeat';
    this.endScreen.classList.toggle('hidden', !over);
    if (over) {
      const online = this.room !== null;
      const isHost = online && this.room!.hostId === me;
      this.restartBtn.classList.toggle('hidden', online && !isHost);
      setText(this.restartBtn, online ? 'Back to lobby' : 'Play again');
      this.changeHeroBtn.classList.toggle('hidden', online);
      this.endLeave.classList.toggle('hidden', !online);
      const won = snap.phase === 'victory';
      setText(this.endTitle, won ? 'Victory!' : 'Defeat');
      this.endTitle.className = won ? 'victory' : 'defeat';
      const summary = won
        ? `The Heart survived all ${snap.totalWaves} waves with ${snap.heartHp} HP left. Kills: ${player?.kills ?? 0}.`
        : `The Heart fell during wave ${snap.wave} of ${snap.totalWaves}. Kills: ${player?.kills ?? 0}.`;
      setText(this.endText, online && !isHost ? `${summary} Waiting for the host…` : summary);
    }
  }

  /** Online: the current room (for the team panel and host-only buttons); null offline. */
  setRoom(room: LobbyState | null): void {
    this.room = room;
    this.teamKey = '';
  }

  /** Shows a persistent banner, e.g. "server restarting", with an optional countdown. */
  notice(text: string, closesInMs = 0): void {
    this.noticeText = text;
    this.noticeDeadline = closesInMs > 0 ? performance.now() + closesInMs : 0;
    this.updateNotice();
  }

  clearNotice(): void {
    this.noticeText = '';
    this.updateNotice();
  }

  setReconnecting(on: boolean): void {
    this.reconnecting.classList.toggle('hidden', !on);
  }

  private updateNotice(): void {
    this.noticeEl.classList.toggle('hidden', !this.noticeText);
    if (!this.noticeText) return;
    const left = this.noticeDeadline ? Math.max(0, this.noticeDeadline - performance.now()) : 0;
    setText(this.noticeEl, left > 0 ? `${this.noticeText} (closes in ${formatSeconds(left / 50, 20)})` : this.noticeText);
  }

  private updateTeam(snap: Snapshot, me: PlayerId | null): void {
    const show = this.room !== null;
    this.team.classList.toggle('hidden', !show);
    if (!show) return;
    setText(this.teamCode, this.room!.code);
    // Rebuild the rows only when the roster changes, so gift buttons survive gold ticking up.
    const key = JSON.stringify([me, snap.players.map((p) => [p.id, p.name, p.connected])]);
    if (key !== this.teamKey) {
      this.teamKey = key;
      this.teamList.innerHTML = '';
      this.teamRows.clear();
      for (const p of snap.players) this.teamRows.set(p.id, this.createTeamRow(p, p.id === me));
    }
    const myGold = snap.players.find((p) => p.id === me)?.gold ?? 0;
    for (const p of snap.players) {
      const row = this.teamRows.get(p.id);
      if (!row) continue;
      const hero = snap.heroes.find((h) => h.id === p.heroId);
      setText(row.lvl, hero ? `${HERO_INFO[hero.kind].name} · ${hero.alive ? `Lv ${hero.level}` : 'dead'}` : '');
      setWidth(row.fill, hero && hero.alive ? hero.hp / hero.maxHp : 0);
      setText(row.gold, String(p.gold));
      for (const b of row.gifts) b.disabled = !p.connected || myGold < Number(b.dataset.amount);
    }
  }

  private createTeamRow(p: PlayerSnap, isMe: boolean): TeamRow {
    const li = document.createElement('li');
    li.classList.toggle('away', !p.connected);
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${p.name}${isMe ? ' (you)' : ''}${p.connected ? '' : ' — away'}`;
    const lvl = document.createElement('span');
    lvl.className = 'lvl';
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'fill';
    bar.appendChild(fill);
    const money = document.createElement('div');
    money.className = 'money';
    const gold = document.createElement('span');
    gold.className = 'gold-amount';
    money.appendChild(gold);
    const gifts: HTMLButtonElement[] = [];
    if (!isMe) {
      for (const amount of GIFT_AMOUNTS) {
        const b = document.createElement('button');
        b.className = 'btn gift';
        b.textContent = `Give ${amount}`;
        b.title = `Give ${p.name} ${amount} of your gold`;
        b.dataset.amount = String(amount);
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', () => this.actions.gift(p.id, amount));
        gifts.push(b);
        money.appendChild(b);
      }
    }
    li.append(who, lvl, bar, money);
    this.teamList.appendChild(li);
    return { lvl, fill, gold, gifts };
  }

  handleEvents(events: GameEvent[], snap: Snapshot, me: PlayerId | null): void {
    for (const e of events) {
      if (e.type === 'rejected' && e.player === me) {
        this.toast(e.reason);
      } else if (e.type === 'waveStart') {
        const boss = TUNING.waves.list[e.wave - 1]?.map((g) => g.kind).find(isBossKind);
        this.showBanner(boss ? `Wave ${e.wave} — Boss: ${CREEP_NAMES[boss]}!` : `Wave ${e.wave}`);
        if (boss) this.toast(BOSS_HINTS[boss]);
      } else if (e.type === 'hideShift') {
        this.toast(e.hide === 'stone' ? 'Shardback: Stone hide — use magic damage' : 'Shardback: Ether hide — use physical damage');
      } else if (e.type === 'gift' && (e.to === me || e.from === me)) {
        const name = (id: PlayerId) => snap.players.find((p) => p.id === id)?.name ?? '?';
        this.toast(e.to === me ? `${name(e.from)} gave you ${e.amount} gold` : `You gave ${name(e.to)} ${e.amount} gold`);
      } else if (e.type === 'heroDied' && snap.heroes.some((h) => h.id === e.heroId && h.owner === me)) {
        this.toast('Your hero has fallen');
      } else if (e.type === 'levelUp') {
        const hero = snap.heroes.find((h) => h.id === e.heroId && h.owner === me);
        if (hero) this.levelUp(hero, e.level);
      }
    }
  }

  /** Level-up feedback: a toast, a glow on the hero panel, and a note when the ultimate unlocks. */
  private levelUp(hero: HeroSnap, level: number): void {
    const ult = HERO_INFO[hero.kind].skills.R.name;
    const unlocks = TUNING.hero.ultimateLevels[0] === level;
    this.toast(unlocks ? `Level ${level}! ${ult} (R) unlocked` : `Level ${level}! Skill point ready`);
    this.heroPanel.classList.remove('leveled');
    void this.heroPanel.offsetWidth;
    this.heroPanel.classList.add('leveled');
  }

  toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => el.remove(), 2200);
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.remove('hidden');
    // Restart the CSS animation.
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
  }

  private updateBuildHint(gold: number): void {
    const mode = this.ui.mode;
    const show = mode.type === 'buildMenu' || mode.type === 'build';
    this.buildHint.classList.toggle('hidden', !show);
    if (!show) return;
    const html =
      mode.type === 'build'
        ? `Placing <b>${TOWER_NAMES[mode.tower]}</b> — left-click a build pad · <kbd>Esc</kbd> cancel`
        : `Build: ${TOWER_KINDS.map((k, i) => {
            const cost = buildCost(k);
            return `<kbd>${i + 1}</kbd> ${TOWER_NAMES[k]} <span style="color:${gold >= cost ? 'var(--gold)' : 'var(--bad)'}">${cost}</span>`;
          }).join(' · ')} · <kbd>Esc</kbd> cancel`;
    if (this.buildHint.innerHTML !== html) this.buildHint.innerHTML = html;
  }

  private updateHero(hero: HeroSnap, tickRate: number): void {
    const info = HERO_INFO[hero.kind];
    if (this.skillKind !== hero.kind) this.buildSkillButtons(hero.kind);
    setText(this.heroName, info.name);
    setText(this.heroRole, info.role);
    setText(this.heroLevel, `Lv ${hero.level}${hero.level >= hero.maxLevel ? ' (max)' : ''}`);
    const span = hero.xpNextLevel - hero.xpLevelStart;
    setWidth(this.xpFill, span > 0 ? (hero.xp - hero.xpLevelStart) / span : 1);
    setWidth(this.hpFill, hero.hp / hero.maxHp);
    setText(this.hpText, `${hero.hp} / ${hero.maxHp}`);
    setWidth(this.manaFill, hero.mana / Math.max(1, hero.maxMana));
    setText(this.manaText, `${hero.mana} / ${hero.maxMana}`);
    this.skillPoints.classList.toggle('hidden', hero.skillPoints === 0);
    setText(this.skillPoints, `+${hero.skillPoints} skill point${hero.skillPoints === 1 ? '' : 's'}`);

    this.respawn.classList.toggle('hidden', hero.alive);
    if (!hero.alive) setText(this.respawn, `Respawning in ${Math.ceil(hero.respawnIn / tickRate)}s`);

    for (const skill of hero.skills) {
      const b = this.skillButtons.get(skill.slot);
      if (!b) continue;
      const text = info.skills[skill.slot];
      b.learn.classList.toggle('hidden', !skill.learnable);
      const pips = Array.from({ length: skill.maxRank }, (_, i) => `<span class="pip${i < skill.rank ? ' on' : ''}"></span>`).join('');
      if (b.pips.innerHTML !== pips) b.pips.innerHTML = pips;
      const locked = skill.rank === 0 && skill.nextRankLevel > hero.level;
      setText(b.tag, locked ? `Lv ${skill.nextRankLevel}` : skill.passive ? 'passive' : skill.rank > 0 ? String(skill.manaCost) : '');
      const cdFrac = skill.cooldownTotal > 0 ? skill.cooldown / skill.cooldownTotal : 0;
      b.cd.style.height = `${cdFrac * 100}%`;
      setText(b.cdText, skill.cooldown > 0 ? String(Math.ceil(skill.cooldown / tickRate)) : '');
      b.root.classList.toggle('no-mana', skill.rank > 0 && !skill.passive && hero.mana < skill.manaCost);
      b.root.classList.toggle('passive', skill.passive);
      b.root.classList.toggle('unlearned', skill.rank === 0);
      b.root.disabled = !hero.alive || skill.rank === 0;
      const cost = skill.passive ? 'Passive' : `${skill.manaCost} mana`;
      const unlock = skill.nextRankLevel > hero.level ? ` · next rank at level ${skill.nextRankLevel}` : '';
      const title = `${text.name} (${skill.slot}) — ${text.desc}\n${cost} · rank ${skill.rank}/${skill.maxRank}${unlock}`;
      if (b.root.title !== title) b.root.title = title;
      b.learn.title = `Learn ${text.name} (Shift+${skill.slot})`;
    }
  }

  private buildSkillButtons(kind: HeroKind): void {
    this.skillKind = kind;
    this.skills.innerHTML = '';
    this.skillButtons.clear();
    this.portrait.style.background = toCss(HERO_COLORS[kind].fill);
    this.portrait.style.borderColor = toCss(HERO_COLORS[kind].edge);
    this.portrait.dataset.hero = kind;
    for (const slot of ['Q', 'W', 'E', 'R'] as const) this.createSkillButton(slot, HERO_INFO[kind].skills[slot].name);
  }

  private createSkillButton(slot: SkillSlot, name: string): SkillButton {
    const root = document.createElement('button');
    root.className = 'btn skill';
    root.dataset.slot = slot;
    root.innerHTML = `<span class="meta"><kbd>${slot}</kbd><span class="tag"></span></span><span class="name">${name}</span><span class="pips"></span><span class="cd"></span><span class="cd-text"></span>`;
    const learn = document.createElement('button');
    learn.className = 'learn hidden';
    learn.textContent = '+';
    const wrap = document.createElement('div');
    wrap.className = 'skill-wrap';
    wrap.append(root, learn);
    this.skills.appendChild(wrap);
    root.addEventListener('click', () => this.actions.pressSkill(slot));
    learn.addEventListener('click', () => this.actions.learn(slot));
    for (const el of [root, learn]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    const b: SkillButton = {
      root,
      learn,
      cd: root.querySelector('.cd') as HTMLElement,
      cdText: root.querySelector('.cd-text') as HTMLElement,
      pips: root.querySelector('.pips') as HTMLElement,
      tag: root.querySelector('.tag') as HTMLElement,
    };
    this.skillButtons.set(slot, b);
    return b;
  }

  // -------------------------------------------------------------------------
  // Pad menu and tower panel
  // -------------------------------------------------------------------------

  openPadMenu(padId: number): void {
    this.openTower = null;
    this.openPad = padId;
    this.menuKey = '';
  }

  openTowerPanel(towerId: number): void {
    this.openPad = null;
    this.openTower = towerId;
    this.menuKey = '';
  }

  closeMenus(): void {
    this.openPad = null;
    this.openTower = null;
    this.padMenu.classList.add('hidden');
    this.towerPanel.classList.add('hidden');
  }

  private updateMenus(snap: Snapshot, me: PlayerId | null, gold: number): void {
    if (this.openPad !== null) {
      const pad = getMap().pads[this.openPad];
      if (!pad || snap.towers.some((t) => t.padId === pad.id) || this.ui.selectedPadId !== pad.id) {
        this.actions.closeMenus();
        return;
      }
      const key = `pad:${pad.id}:${TOWER_KINDS.map((k) => gold >= buildCost(k)).join()}`;
      if (key !== this.menuKey) {
        this.menuKey = key;
        this.padMenu.innerHTML = '<h3>Build tower</h3>';
        TOWER_KINDS.forEach((kind, i) => {
          const cost = buildCost(kind);
          const btn = document.createElement('button');
          btn.className = 'btn tower-option';
          btn.disabled = gold < cost;
          btn.innerHTML = `<kbd>${i + 1}</kbd><span>${TOWER_NAMES[kind]}</span><span class="cost">${cost}</span><span class="desc">${TOWER_BLURBS[kind]}</span>`;
          btn.addEventListener('click', () => this.actions.build(pad.id, kind));
          this.padMenu.appendChild(btn);
        });
      }
      this.padMenu.classList.remove('hidden');
      this.place(this.padMenu, pad.x + 1.3, pad.y - 1);
    } else {
      this.padMenu.classList.add('hidden');
    }

    if (this.openTower !== null) {
      const tower = snap.towers.find((t) => t.id === this.openTower);
      if (!tower || this.ui.selectedTowerId !== tower.id) {
        this.actions.closeMenus();
        return;
      }
      const mine = tower.owner === me;
      const refund = Math.floor(tower.spent * TUNING.economy.sellRefund);
      const nextCost = upgradeCost(tower.kind, tower.tier);
      const key = `tower:${tower.id}:${tower.tier}:${tower.priority}:${mine}:${nextCost !== null && gold >= nextCost}`;
      if (key !== this.menuKey) {
        this.menuKey = key;
        this.renderTowerPanel(snap, tower, mine, refund, nextCost, gold);
      }
      // HP changes often; update it in place so the buttons aren't rebuilt under the pointer.
      const hp = this.towerPanel.querySelector<HTMLElement>('.tower-hp');
      if (hp) setText(hp, `${tower.hp} / ${tower.maxHp}`);
      this.towerPanel.classList.remove('hidden');
      this.place(this.towerPanel, tower.x + 1.3, tower.y - 1);
    } else {
      this.towerPanel.classList.add('hidden');
    }
  }

  private renderTowerPanel(
    snap: Snapshot,
    tower: TowerSnap,
    mine: boolean,
    refund: number,
    nextCost: number | null,
    gold: number,
  ): void {
    const panel = this.towerPanel;
    const owner = snap.players.find((p) => p.id === tower.owner)?.name ?? '?';
    const showNext = mine && nextCost !== null;
    const statRows = towerStatRows(tower.kind, tower.tier)
      .map((r) => {
        const next = showNext && r.next ? ` <span class="next">→ ${r.next}</span>` : '';
        return `<div class="row"><span>${r.label}</span><span>${r.value}${next}</span></div>`;
      })
      .join('');
    panel.innerHTML = `
      <h3>${TOWER_NAMES[tower.kind]} tower <span style="color:var(--muted);font-weight:400">tier ${tower.tier} / ${maxTier(tower.kind)}</span></h3>
      <div class="row"><span>HP</span><span class="tower-hp"></span></div>
      ${statRows}
      <div class="row"><span>Targets</span><span>${targetsText(tower.kind)}</span></div>
      <div class="row"><span>Owner</span><span>${mine ? 'You' : owner}</span></div>`;
    if (!mine) {
      panel.insertAdjacentHTML('beforeend', `<div class="row"><span>Priority</span><span>${PRIORITY_NAMES[tower.priority]}</span></div>`);
      return;
    }

    if (nextCost !== null) {
      const up = document.createElement('button');
      up.className = 'btn';
      up.disabled = gold < nextCost;
      up.title = 'Hotkey: U';
      up.innerHTML = `Upgrade to tier ${tower.tier + 1} <span class="cost">${nextCost}</span>`;
      up.addEventListener('click', () => this.actions.upgrade(tower.id));
      panel.appendChild(up);
    } else {
      panel.insertAdjacentHTML('beforeend', '<div class="row"><span>Max tier</span><span></span></div>');
    }

    const label = document.createElement('div');
    label.className = 'section';
    label.textContent = 'Target priority';
    const row = document.createElement('div');
    row.className = 'priorities';
    for (const priority of TARGET_PRIORITIES) {
      const b = document.createElement('button');
      b.className = `btn${priority === tower.priority ? ' active' : ''}`;
      b.textContent = PRIORITY_NAMES[priority];
      b.title = PRIORITY_HINTS[priority];
      b.addEventListener('click', () => this.actions.setPriority(tower.id, priority));
      row.appendChild(b);
    }
    panel.append(label, row);

    const sell = document.createElement('button');
    sell.className = 'btn';
    sell.innerHTML = `Sell for <span class="cost">${refund}</span>`;
    sell.addEventListener('click', () => this.actions.sell(tower.id));
    panel.appendChild(sell);
  }

  /** Positions a popup next to a world point (tile units), kept on screen. */
  private place(el: HTMLElement, tx: number, ty: number): void {
    const p = this.camera.worldToScreen(tx * TILE_PX, ty * TILE_PX);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.max(8, Math.min(this.camera.viewW - w - 8, p.x));
    const y = Math.max(60, Math.min(this.camera.viewH - h - 8, p.y));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }
}
