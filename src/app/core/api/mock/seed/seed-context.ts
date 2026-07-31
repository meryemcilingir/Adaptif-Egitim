import { SeededRandom } from '../../../platform/seeded-random';

/**
 * Seed üretiminin ortak bağlamı.
 *
 * Tüm zamanlar `REFERENCE_DATE`'e göre üretilir; böylece demo verisi
 * "bugün"e göre anlamlı (geçmiş denemeler, yaklaşan sınavlar) ve tekrarlanabilir olur.
 */
export const REFERENCE_DATE = new Date('2026-07-27T09:00:00.000Z');

export class SeedContext {
  readonly rng = new SeededRandom(20260727);
  private readonly counters = new Map<string, number>();

  /** Deterministik, okunabilir kimlik: `crs_001`, `qst_042` … */
  id(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${String(next).padStart(3, '0')}`;
  }

  /** Referans tarihten `days` gün önce/sonra (negatif = geçmiş). */
  date(days: number, hour = 9, minute = 0): string {
    const result = new Date(REFERENCE_DATE);
    result.setUTCDate(result.getUTCDate() + days);
    result.setUTCHours(hour, minute, 0, 0);
    return result.toISOString();
  }

  minutesFrom(iso: string, minutes: number): string {
    return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
  }

  /** Geçmişe dönük rastgele bir zaman damgası. */
  pastDate(minDaysAgo: number, maxDaysAgo: number): string {
    return this.date(
      -this.rng.int(minDaysAgo, maxDaysAgo),
      this.rng.int(8, 20),
      this.rng.int(0, 59),
    );
  }
}

/** `createdAt`/`updatedAt`/`version` üçlüsünü tek yerden üretir. */
export function auditFields(
  ctx: SeedContext,
  createdDaysAgo: number,
  updatedDaysAgo = createdDaysAgo,
  actorId = 'usr_002',
): {
  createdAt: string;
  updatedAt: string;
  version: number;
  createdBy: string;
  updatedBy: string;
} {
  return {
    createdAt: ctx.date(-createdDaysAgo),
    updatedAt: ctx.date(-updatedDaysAgo),
    version: 1 + Math.max(0, createdDaysAgo - updatedDaysAgo > 0 ? 1 : 0),
    createdBy: actorId,
    updatedBy: actorId,
  };
}

/** Türkçe ad havuzu — gerçekçi öğrenci/eğitmen isimleri için. */
export const FIRST_NAMES: readonly string[] = [
  'Elif',
  'Yusuf',
  'Zeynep',
  'Mert',
  'Ayşe',
  'Kaan',
  'Selin',
  'Emre',
  'Defne',
  'Arda',
  'Ecrin',
  'Berk',
  'Nisa',
  'Umut',
  'İrem',
  'Ozan',
  'Melis',
  'Barış',
  'Ceren',
  'Deniz',
  'Buse',
  'Kerem',
  'Sude',
  'Tolga',
  'Yağmur',
  'Efe',
  'Aslı',
  'Serkan',
  'Beren',
  'Onur',
  'Damla',
  'Bora',
  'Pelin',
  'Sinan',
  'Gizem',
  'Alper',
  'Merve',
  'Cem',
  'Nehir',
  'Doruk',
  'Ada',
  'Batuhan',
  'Duru',
  'Erdem',
  'Feyza',
  'Görkem',
  'Hazal',
  'İlker',
  'Jale',
  'Kaya',
  'Lale',
  'Mehmet',
  'Naz',
  'Oğuz',
  'Öykü',
  'Poyraz',
  'Rüya',
  'Sarp',
  'Tuana',
  'Uğur',
  'Ülkü',
  'Volkan',
  'Yaren',
  'Zehra',
  'Ahmet',
  'Bilge',
  'Can',
  'Dilara',
  'Eren',
  'Fatma',
];

export const LAST_NAMES: readonly string[] = [
  'Yılmaz',
  'Kaya',
  'Demir',
  'Şahin',
  'Çelik',
  'Yıldız',
  'Yıldırım',
  'Öztürk',
  'Aydın',
  'Özdemir',
  'Arslan',
  'Doğan',
  'Kılıç',
  'Aslan',
  'Çetin',
  'Kara',
  'Koç',
  'Kurt',
  'Özkan',
  'Şimşek',
  'Polat',
  'Korkmaz',
  'Erdoğan',
  'Bulut',
  'Güneş',
  'Tekin',
  'Acar',
  'Bozkurt',
  'Ateş',
  'Duman',
  'Turan',
  'Sarı',
  'Avcı',
  'Keskin',
  'Yavuz',
  'Güler',
  'Aksoy',
  'Bilgin',
  'Ünal',
  'Taş',
];

/** ASCII'ye indirger — e-posta adresleri için. */
export function slugify(value: string): string {
  const map: Readonly<Record<string, string>> = {
    ç: 'c',
    Ç: 'c',
    ğ: 'g',
    Ğ: 'g',
    ı: 'i',
    İ: 'i',
    ö: 'o',
    Ö: 'o',
    ş: 's',
    Ş: 's',
    ü: 'u',
    Ü: 'u',
  };
  return value
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}
