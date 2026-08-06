import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

import { STORAGE_ADAPTER, STORAGE_KEYS } from '../storage/storage.token';

/**
 * Kullanıcının tema tercihi.
 *
 * `system`, işletim sistemi ayarını izler; kullanıcı düğmeye basana kadar
 * varsayılan budur. Böylece koyu mod kullanan biri uygulamayı ilk açtığında
 * beyaz ekranla karşılaşmaz.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Ekrana gerçekten uygulanan tema — `system` çözümlendikten sonraki hâli. */
export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Tema durumu.
 *
 * Tek sorumluluğu tercih ile ekran arasındaki bağı kurmaktır: seçimi saklar,
 * `system` seçiliyse işletim sistemini dinler ve sonucu `<html data-theme>`
 * damgasına yazar. Renkler burada DEĞİL, `_tokens.scss` içindedir — bileşenler
 * hangi temanın açık olduğunu bilmek zorunda kalmaz, yalnızca token okur.
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly storage = inject(STORAGE_ADAPTER);
  private readonly document = inject(DOCUMENT);

  private readonly mediaQuery = this.document.defaultView?.matchMedia?.(DARK_QUERY) ?? null;

  /** İşletim sistemi tercihi; `system` seçiliyken kaynak budur. */
  private readonly systemPrefersDark = signal(this.mediaQuery?.matches ?? false);

  private readonly preferenceState = signal<ThemePreference>(this.readStoredPreference());

  readonly preference = this.preferenceState.asReadonly();

  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preferenceState();
    if (preference !== 'system') return preference;
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  readonly isDark = computed(() => this.resolved() === 'dark');

  constructor() {
    /*
     * İşletim sistemi teması değişince `system` seçili kullanıcılar anında
     * takip etmeli. Dinleyici tercihten bağımsız kurulur; sinyal yalnızca
     * `system` seçiliyken `resolved` üzerinde etkili olur.
     */
    this.mediaQuery?.addEventListener('change', (event) =>
      this.systemPrefersDark.set(event.matches),
    );

    effect(() => this.applyTheme(this.resolved()));
  }

  set(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    this.storage.set(STORAGE_KEYS.theme, preference);
  }

  /**
   * Açık ↔ koyu arasında geçiş yapar.
   *
   * `system` seçiliyken basılırsa, o an EKRANDA GÖRÜNEN temanın tersine geçilir;
   * kullanıcı düğmeye bastığında beklediği şey görsel değişimdir, tercihin
   * hangi ara durumdan geldiği değil.
   */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private readStoredPreference(): ThemePreference {
    const stored = this.storage.get<ThemePreference>(STORAGE_KEYS.theme);
    return isPreference(stored) ? stored : 'system';
  }

  private applyTheme(theme: ResolvedTheme): void {
    const root = this.document.documentElement;
    root.setAttribute('data-theme', theme);

    /*
     * Tarayıcı arayüzü (adres çubuğu, kaydırma çubukları, form denetimleri)
     * bu iki bildirimi okur. Yazılmazsa koyu sayfada beyaz kaydırma çubuğu
     * kalıyordu.
     */
    this.document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute('content', theme);

    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b1120' : '#4f46e5');
  }
}
