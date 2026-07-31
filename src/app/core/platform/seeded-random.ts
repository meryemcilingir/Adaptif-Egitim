import { RandomSource } from './platform.tokens';

/**
 * Sabit tohumlu PRNG (mulberry32).
 * Demo veri her açılışta AYNI üretilsin diye kullanılır — ekran görüntüleri,
 * testler ve raporlar tekrar edilebilir olur. (ARCHITECTURE.md §4.4)
 */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed = 20260727) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] aralığında tam sayı. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Belirtilen ondalık basamağa yuvarlanmış sayı. */
  float(min: number, max: number, decimals = 2): number {
    const value = min + this.next() * (max - min);
    return Number(value.toFixed(decimals));
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('SeededRandom.pick: boş dizi');
    return items[this.int(0, items.length - 1)]!;
  }

  /** Tekrarsız n eleman seçer. */
  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, Math.min(count, items.length));
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }

  /** Ağırlıklı seçim — [değer, ağırlık] çiftleri. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let threshold = this.next() * total;
    for (const [value, weight] of entries) {
      threshold -= weight;
      if (threshold <= 0) return value;
    }
    return entries[entries.length - 1]![0];
  }
}
