// Settings popup (the ⚙ in the top bar): sound (mute, music and effects volume, docs/ART.md §13),
// touch controls layout (docs/MOBILE.md §5), graphics quality (§7), screen shake (Off / Normal / Strong), display (Normal /
// Bright, docs/ART.md §2), play data on / off with this browser's own copy and deletion (docs/ANALYTICS.md; its own key,
// analytics/preference.ts; on asks the age question first if it is still to be answered) and installing the app
// (Android prompt / iPhone sheet). The lobby's speaker button mutes too.

import { AGE_KEY, currentAgeBand, readAgeAnswer } from '../analytics/age';
import { setAnalyticsChoice } from '../analytics/install';
import { ANALYTICS_KEY, browserSignals, playDataStatus, readAnalyticsChoice, type AnalyticsChoice } from '../analytics/preference';
import { askAge } from '../privacy/ageCheck';
import { wireMyData } from '../privacy/myDataUi';
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
import { lessonStatus } from '../tutorial/logic';

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
  private readonly app = $('settings-app');
  private readonly install = $('install-btn');
  private readonly iosInstall = $('ios-install-btn');
  private readonly iosSheet = $('ios-install');
  private readonly mutes = [$('settings-mute'), $('lobby-sound')];
  private readonly volumes = [
    { input: $('settings-music') as HTMLInputElement, label: $('settings-music-val'), key: 'music' as const },
    { input: $('settings-sfx') as HTMLInputElement, label: $('settings-sfx-val'), key: 'sfx' as const },
  ];

  /** `previewSfx` plays a sound after the effects volume changes, at the new level. `onReplay` starts the lesson again. */
  constructor(
    private readonly store: SettingsStore,
    previewSfx: () => void = () => {},
    onReplay: () => void = () => {},
  ) {
    $('settings-btn').addEventListener('click', () => this.toggle());
    for (const b of this.mutes) b.addEventListener('click', () => store.set({ muted: !store.get().muted }));
    for (const v of this.volumes) {
      v.input.addEventListener('input', () => store.set({ [v.key]: Number(v.input.value) / 100 }));
      // Moving a slider turns the sound back on.
      v.input.addEventListener('pointerdown', () => store.get().muted && store.set({ muted: false }));
    }
    this.volumes[1]!.input.addEventListener('change', previewSfx);
    $('settings-tutorial').addEventListener('click', () => {
      this.close();
      store.set({ tutorial: lessonStatus('replay'), airLesson: 'new', repairHint: 'new' });
      onReplay();
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
    this.render();
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  private render(): void {
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
    const playData = playDataStatus(readAnalyticsChoice(), browserSignals(), currentAgeBand());
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
    const android = canInstall();
    const ios = isIos() && !isStandalone();
    this.install.classList.toggle('hidden', !android);
    this.iosInstall.classList.toggle('hidden', !ios);
    this.app.classList.toggle('hidden', !android && !ios);
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
