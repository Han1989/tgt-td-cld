// Settings popup (the ⚙ in the top bar): sound (mute, music and effects volume, docs/ART.md §13),
// touch controls layout (docs/MOBILE.md §5), graphics quality (§7), screen shake (Off / Normal / Strong), display (Normal /
// Bright, docs/ART.md §2), play data on / off with this browser's own copy and deletion (docs/ANALYTICS.md; its own key,
// analytics/preference.ts; on asks the age question first if it is still to be answered), "Post Endless runs to the
// board" (`endlessPost`, endless/board.ts; in a build with a game server; on asks the age first too) and installing the
// app (Android prompt / iPhone sheet). The lobby's speaker button mutes too.

import { AGE_KEY, currentAgeBand, readAgeAnswer } from '../analytics/age';
import { setAnalyticsChoice } from '../analytics/install';
import { ANALYTICS_KEY, browserSignals, playDataStatus, readAnalyticsChoice, type AnalyticsChoice } from '../analytics/preference';
import { dailyServer } from '../daily/api';
import { switchStatus } from '../endless/board';
import { askAge } from '../privacy/ageCheck';
import { askAgeAtPlay } from '../privacy/askAt';
import { wireMyData } from '../privacy/myDataUi';
import { endRunQuestion, endRunShown, endRunWave, settingsLeaveShown, type MatchOnScreen } from './leaveMatch';
import type { SkillsPlace, StickAnchor, StickMode } from '../layout';
import { canInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../platform/pwa';
import type { Display } from '../render/art/tokens';
import {
  DISPLAY_NAMES,
  QUALITY_NAMES,
  SHAKE_NAMES,
  SKILLS_NAMES,
  STICK_ANCHOR_NAMES,
  STICK_FEEL_NAMES,
  STICK_NAMES,
  type Quality,
  type SettingsStore,
  type ShakeSetting,
} from '../settings';
import type { StickFeelName } from '../touch/gestures';

const PLAY_DATA_NAMES: Record<AnalyticsChoice, string> = { on: 'On', off: 'Off' };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

export class SettingsPanel {
  private readonly root = $('settings');
  private readonly stickMode = $('settings-stick-mode');
  private readonly skills = $('settings-skills');
  private readonly stick = $('settings-stick');
  private readonly stickSide = $('settings-stick-side');
  private readonly feel = $('settings-feel');
  private readonly quality = $('settings-quality');
  private readonly shake = $('settings-shake');
  private readonly display = $('settings-display');
  private readonly analytics = $('settings-analytics');
  private readonly analyticsState = $('settings-analytics-state');
  private readonly endlessRow = $('settings-endless-row');
  private readonly endless = $('settings-endless');
  private readonly endlessState = $('settings-endless-state');
  private readonly app = $('settings-app');
  private readonly leave = $('settings-leave');
  private readonly leaveAsk = $('settings-leave-ask');
  private readonly leaveBtn = $('settings-leave-btn');
  private readonly endRunBtn = $('settings-endrun-btn');
  private readonly endRunAsk = $('settings-endrun-ask');
  private readonly endRunQ = $('settings-endrun-q');
  private readonly install = $('install-btn');
  private readonly iosInstall = $('ios-install-btn');
  private readonly iosSheet = $('ios-install');
  private readonly mutes = [$('settings-mute'), $('lobby-sound')];
  private readonly volumes = [
    { input: $('settings-music') as HTMLInputElement, label: $('settings-music-val'), key: 'music' as const },
    { input: $('settings-sfx') as HTMLInputElement, label: $('settings-sfx-val'), key: 'sfx' as const },
  ];

  /**
   * `previewSfx` plays a sound after the effects volume changes, at the new level. `onLearn` (Lesson → Learn to play)
   * starts the lesson at once; the host stores what it changes as it starts (`beginSolo`). `match` says what is on
   * screen and `onLeave` goes home as the end card's Back to lobby does: Match → Back to lobby, a solo match only.
   * `onEndRun` sends End run (Match → End run, a solo Endless match only): the run ends as a defeat and counts.
   */
  constructor(
    private readonly store: SettingsStore,
    previewSfx: () => void = () => {},
    onLearn: () => void = () => {},
    private readonly match: () => MatchOnScreen = () => ({ attached: false, online: false }),
    onLeave: () => void = () => {},
    onEndRun: () => void = () => {},
  ) {
    $('settings-btn').addEventListener('click', () => this.toggle());
    for (const b of this.mutes) b.addEventListener('click', () => store.set({ muted: !store.get().muted }));
    for (const v of this.volumes) {
      v.input.addEventListener('input', () => store.set({ [v.key]: Number(v.input.value) / 100 }));
      // Moving a slider turns the sound back on.
      v.input.addEventListener('pointerdown', () => store.get().muted && store.set({ muted: false }));
    }
    this.volumes[1]!.input.addEventListener('change', previewSfx);
    // Back to lobby asks once, inside the sheet: Leave ends the match and goes home, Stay puts the button back.
    this.leaveBtn.addEventListener('click', () => this.asking(true));
    $('settings-leave-no').addEventListener('click', () => this.asking(false));
    $('settings-leave-yes').addEventListener('click', () => {
      this.close();
      if (settingsLeaveShown(this.match())) onLeave();
    });
    // End run asks once too, with the wave it would end on: End run sends it, Keep playing puts the buttons back.
    this.endRunBtn.addEventListener('click', () => this.endAsking(true));
    $('settings-endrun-no').addEventListener('click', () => this.endAsking(false));
    $('settings-endrun-yes').addEventListener('click', () => {
      const shown = endRunShown(this.match());
      this.close();
      if (shown) onEndRun();
    });
    $('settings-tutorial').addEventListener('click', () => {
      this.close();
      onLearn();
    });
    // Tap anywhere else closes it.
    window.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Element | null;
        if (!this.root.classList.contains('hidden') && !t?.closest?.('#settings, #settings-btn, #age-check')) this.close();
      },
      true,
    );
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    wireMyData({
      copy: $('settings-data-copy') as HTMLButtonElement,
      erase: $('settings-data-delete') as HTMLButtonElement,
      state: $('settings-data-state'),
    });
    this.install.addEventListener('click', () => {
      this.close();
      void promptInstall();
    });
    this.iosInstall.addEventListener('click', () => {
      this.close();
      this.iosSheet.classList.remove('hidden');
    });
    $('ios-install-close').addEventListener('click', () => this.iosSheet.classList.add('hidden'));
    onInstallChange(() => this.render());
    store.onChange(() => this.render());
    // The privacy page (another tab) can change play data too.
    window.addEventListener('storage', (e) => {
      if (e.key === ANALYTICS_KEY || e.key === AGE_KEY || e.key === null) this.render();
    });
    this.render();
  }

  toggle(): void {
    this.root.classList.toggle('hidden');
    this.asking(false);
    this.endAsking(false);
    this.render();
  }

  close(): void {
    this.root.classList.add('hidden');
    this.asking(false);
    this.endAsking(false);
  }

  private asking(on: boolean): void {
    this.leaveAsk.classList.toggle('hidden', !on);
    this.leaveBtn.classList.toggle('hidden', on);
    if (on) this.endRunBtn.classList.add('hidden');
    else this.endRunBtn.classList.toggle('hidden', !endRunShown(this.match()));
  }

  private endAsking(on: boolean): void {
    const m = this.match();
    if (on && m.snap) this.endRunQ.textContent = endRunQuestion(endRunWave(m.snap));
    this.endRunAsk.classList.toggle('hidden', !on);
    this.endRunBtn.classList.toggle('hidden', on || !endRunShown(m));
    this.leaveBtn.classList.toggle('hidden', on);
  }

  private render(): void {
    const m = this.match();
    this.leave.classList.toggle('hidden', !settingsLeaveShown(m));
    if (this.endRunAsk.classList.contains('hidden') && this.leaveAsk.classList.contains('hidden')) this.endRunBtn.classList.toggle('hidden', !endRunShown(m));
    const s = this.store.get();
    for (const b of this.mutes) {
      b.setAttribute('aria-pressed', String(s.muted));
      const label = s.muted ? 'Sound off: tap to turn it on' : 'Mute sound';
      b.title = label;
      b.setAttribute('aria-label', label);
      const text = b.querySelector('span');
      if (text) text.textContent = s.muted ? 'Sound off' : 'Sound on';
    }
    for (const v of this.volumes) {
      const pct = String(Math.round(s[v.key] * 100));
      if (v.input.value !== pct) v.input.value = pct;
      v.label.textContent = `${pct}%`;
    }
    const picked = { thumbsPicked: true };
    this.choices(this.stickMode, Object.entries(STICK_NAMES) as [StickMode, string][], s.stick, (v) => this.store.set({ stick: v, ...picked }));
    this.choices(this.skills, Object.entries(SKILLS_NAMES) as [SkillsPlace, string][], s.skills, (v) => this.store.set({ skills: v, ...picked }));
    // Left / Center / Right moves the stick with the skills around it; the corner layouts already pick a side.
    this.stickSide.classList.toggle('hidden', s.skills !== 'around');
    this.choices(this.stick, Object.entries(STICK_ANCHOR_NAMES) as [StickAnchor, string][], s.stickAnchor, (v) => this.store.set({ stickAnchor: v, thumbsPicked: true }));
    this.choices(this.feel, Object.entries(STICK_FEEL_NAMES) as [StickFeelName, string][], s.stickFeel, (v) => this.store.set({ stickFeel: v }));
    this.choices(this.quality, Object.entries(QUALITY_NAMES) as [Quality, string][], s.quality, (v) => this.store.set({ quality: v }));
    this.choices(this.shake, Object.entries(SHAKE_NAMES) as [ShakeSetting, string][], s.shake, (v) => this.store.set({ shake: v }));
    this.choices(this.display, Object.entries(DISPLAY_NAMES) as [Display, string][], s.display, (v) => this.store.set({ display: v }));
    const playData = playDataStatus(readAnalyticsChoice(), browserSignals(), currentAgeBand(), askAgeAtPlay(__EMBED__));
    const pickData = (v: AnalyticsChoice) => {
      if (v === 'on' && readAgeAnswer() === null) {
        void askAge().then(() => pickData('on'));
        return;
      }
      setAnalyticsChoice(v);
      this.render();
    };
    this.choices(this.analytics, Object.entries(PLAY_DATA_NAMES) as [AnalyticsChoice, string][], playData.on ? 'on' : 'off', pickData);
    const onBtn = this.analytics.querySelector<HTMLButtonElement>('[data-value="on"]');
    if (onBtn) onBtn.disabled = playData.locked;
    this.analyticsState.textContent = playData.line;
    this.renderEndless();
    const android = canInstall();
    // A hosted build is never installed (no manifest; docs/DEPLOY.md "Hosted builds"), so no Add to Home Screen either.
    const ios = !__EMBED__ && isIos() && !isStandalone();
    this.install.classList.toggle('hidden', !android);
    this.iosInstall.classList.toggle('hidden', !ios);
    this.app.classList.toggle('hidden', !android && !ios);
  }

  /** "Post Endless runs to the board": On / Off; On asks the age first if it was never answered; locked under 16. */
  private renderEndless(): void {
    this.endlessRow.classList.toggle('hidden', dailyServer() === '');
    const status = switchStatus(this.store.get().endlessPost, currentAgeBand());
    const pick = (v: AnalyticsChoice) => {
      if (v === 'on' && readAgeAnswer() === null) {
        void askAge().then(() => pick('on'));
        return;
      }
      if (v === 'on' && switchStatus('on', currentAgeBand()).locked) return this.render();
      this.store.set({ endlessPost: v });
    };
    this.choices(this.endless, Object.entries(PLAY_DATA_NAMES) as [AnalyticsChoice, string][], status.on ? 'on' : 'off', pick);
    const onBtn = this.endless.querySelector<HTMLButtonElement>('[data-value="on"]');
    if (onBtn) onBtn.disabled = status.locked;
    this.endlessState.textContent = status.line;
  }

  private choices<T extends string>(el: HTMLElement, options: [T, string][], current: T, pick: (v: T) => void): void {
    const key = `${current}|${options.map((o) => o[0]).join()}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.innerHTML = '';
    for (const [value, name] of options) {
      const b = document.createElement('button');
      b.className = `btn${value === current ? ' active' : ''}`;
      b.dataset.value = value;
      b.textContent = name;
      b.addEventListener('click', () => pick(value));
      el.appendChild(b);
    }
  }
}
