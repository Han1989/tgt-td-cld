// Settings popup (the ⚙ in the top bar): touch controls layout (docs/MOBILE.md §5),
// graphics quality (§7), screen shake and installing the app (Android prompt / iPhone sheet).

import type { ThumbLayout } from '../layout';
import { canInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../platform/pwa';
import { QUALITY_NAMES, THUMB_NAMES, type Quality, type SettingsStore } from '../settings';

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
  private readonly app = $('settings-app');
  private readonly install = $('install-btn');
  private readonly iosInstall = $('ios-install-btn');
  private readonly iosSheet = $('ios-install');

  constructor(private readonly store: SettingsStore) {
    $('settings-btn').addEventListener('click', () => this.toggle());
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
    this.choices(this.thumbs, Object.entries(THUMB_NAMES) as [ThumbLayout, string][], s.thumbs, (v) => this.store.set({ thumbs: v }));
    this.choices(this.quality, Object.entries(QUALITY_NAMES) as [Quality, string][], s.quality, (v) => this.store.set({ quality: v }));
    this.choices(this.shake, SHAKE_CHOICES, s.shake ? 'on' : 'off', (v) => this.store.set({ shake: v === 'on' }));
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
