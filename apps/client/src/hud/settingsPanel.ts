// Settings popup (the ⚙ in the top bar): sound (mute, music and effects volume, docs/ART.md §13),
// touch controls layout (docs/MOBILE.md §5), graphics quality (§7), screen shake, display (Normal /
// Bright, docs/ART.md §2) and installing the app (Android prompt / iPhone sheet). The lobby's
// speaker button mutes too.

import type { ThumbLayout } from '../layout';
import { canInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../platform/pwa';
import type { Display } from '../render/art/tokens';
import { DISPLAY_NAMES, QUALITY_NAMES, THUMB_NAMES, type Quality, type SettingsStore } from '../settings';
import { lessonStatus } from '../tutorial/logic';

const SHAKE_CHOICES: ['on' | 'off', string][] = [
  ['on', 'On'],
  ['off', 'Off'],
];

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

export class SettingsPanel {
  private readonly root = $('settings');
  private readonly thumbs = $('settings-thumbs');
  private readonly quality = $('settings-quality');
  private readonly shake = $('settings-shake');
  private readonly display = $('settings-display');
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
      store.set({ tutorial: lessonStatus('replay') });
      onReplay();
    });
    // Tap anywhere else closes it.
    window.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Element | null;
        if (!this.root.classList.contains('hidden') && !t?.closest?.('#settings, #settings-btn')) this.close();
      },
      true,
    );
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
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
    this.choices(this.thumbs, Object.entries(THUMB_NAMES) as [ThumbLayout, string][], s.thumbs, (v) => this.store.set({ thumbs: v }));
    this.choices(this.quality, Object.entries(QUALITY_NAMES) as [Quality, string][], s.quality, (v) => this.store.set({ quality: v }));
    this.choices(this.shake, SHAKE_CHOICES, s.shake ? 'on' : 'off', (v) => this.store.set({ shake: v === 'on' }));
    this.choices(this.display, Object.entries(DISPLAY_NAMES) as [Display, string][], s.display, (v) => this.store.set({ display: v }));
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
