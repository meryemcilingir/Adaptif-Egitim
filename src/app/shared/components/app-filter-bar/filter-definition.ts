/**
 * Filtre çubuğu tanımı.
 * Ekranlar filtre arayüzünü elle kurmaz; bu tanımı verip davranışı `AppFilterBar`'a bırakır.
 */

export interface FilterOption {
  readonly value: string;
  readonly label: string;
  /** Seçeneğe ait kayıt sayısı (biliniyorsa) — kullanıcıya ipucu verir. */
  readonly count?: number;
}

/**
 * `boolean` filtre bir açılır liste değil, tek tıkla açılıp kapanan bir anahtardır
 * ("yalnızca favorilerim" gibi). Seçenek listesi gerektirmez.
 */
export type FilterKind = 'multi' | 'single' | 'boolean';

export interface FilterDefinition {
  readonly key: string;
  readonly label: string;
  readonly kind: FilterKind;
  /** `boolean` türünde kullanılmaz. */
  readonly options?: readonly FilterOption[];
}
