/**
 * Basit önbellekli fonksiyon sarmalayıcısı.
 *
 * Ustalık ısı haritası ve cohort istatistiği gibi ağır hesaplamalarda kullanılır;
 * aynı girdi tekrar geldiğinde hesap yeniden yapılmaz (ARCHITECTURE.md §8).
 */
export function memoize<TArgs extends readonly unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  keyOf: (...args: TArgs) => string = (...args) => JSON.stringify(args),
  maxSize = 32,
): (...args: TArgs) => TResult {
  const cache = new Map<string, TResult>();

  return (...args: TArgs): TResult => {
    const key = keyOf(...args);
    if (cache.has(key)) return cache.get(key)!;

    const result = fn(...args);
    cache.set(key, result);

    // En eski kayıt düşürülerek önbellek sınırlı tutulur (LRU'ya yakın davranış).
    if (cache.size > maxSize) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return result;
  };
}
