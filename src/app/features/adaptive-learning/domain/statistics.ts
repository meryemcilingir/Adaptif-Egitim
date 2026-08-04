import { DistributionBucket } from '../models/analytics.model';

/**
 * Betimsel istatistik yardımcıları.
 *
 * Saf fonksiyonlardır; mock sunucu raporları bunlarla üretir, ekranlar da aynı
 * fonksiyonlarla yerel hesap yapabilir. Böylece "sunucudaki ortalama ile
 * ekrandaki ortalama tutmuyor" durumu oluşmaz.
 *
 * ÖNEMLİ: hiçbiri boş diziyle çökmez. Analitik ekranlarında filtre sonucu boş
 * küme çok olağandır; her çağrıda `length > 0` kontrolü yazmak yerine güvenli
 * varsayılanlar burada verilir.
 */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Medyan.
 *
 * Ortalamadan ayrı gösterilir çünkü sınav puanlarında birkaç çok düşük sonuç
 * ortalamayı aşağı çeker; medyan "tipik öğrenci"yi daha dürüst anlatır.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Standart sapma (POPÜLASYON).
 *
 * Örneklem değil popülasyon formülü kullanılır: elimizdeki veri bir örneklem
 * değil, o cohort'un TAMAMIDIR. Örneklem formülü (n−1) burada olduğundan büyük
 * bir yayılım gösterirdi.
 */
export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));

  return Math.sqrt(variance);
}

/** p ∈ [0,1] için yüzdelik; doğrusal ara değerleme ile. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const position = clamp(p, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export interface Summary {
  readonly count: number;
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly standardDeviation: number;
  readonly q1: number;
  readonly q3: number;
}

export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, min: 0, max: 0, standardDeviation: 0, q1: 0, q3: 0 };
  }

  return {
    count: values.length,
    mean: round1(mean(values)),
    median: round1(median(values)),
    min: round1(Math.min(...values)),
    max: round1(Math.max(...values)),
    standardDeviation: round1(standardDeviation(values)),
    q1: round1(percentile(values, 0.25)),
    q3: round1(percentile(values, 0.75)),
  };
}

/* ── Dağılımlar ──────────────────────────────────────────────────────────── */

/** Puan dağılımı kovaları: 0–20, 20–40, … 80–100. */
export const SCORE_BANDS: readonly { readonly label: string; readonly max: number }[] = [
  { label: '0–20', max: 20 },
  { label: '21–40', max: 40 },
  { label: '41–60', max: 60 },
  { label: '61–80', max: 80 },
  { label: '81–100', max: 101 },
];

/**
 * Harf notu eşikleri.
 *
 * Türkiye'de yaygın 4'lük sisteme yakın bir bantlama; mock veriyi anlamlı
 * göstermek içindir ve kurumsal yönetmelik yerine geçmez.
 */
export const GRADE_BANDS: readonly { readonly label: string; readonly min: number }[] = [
  { label: 'AA', min: 90 },
  { label: 'BA', min: 85 },
  { label: 'BB', min: 75 },
  { label: 'CB', min: 65 },
  { label: 'CC', min: 55 },
  { label: 'DC', min: 50 },
  { label: 'FF', min: 0 },
];

export function gradeOf(percent: number): string {
  return GRADE_BANDS.find((band) => percent >= band.min)?.label ?? 'FF';
}

/** Değerleri verilen bantlara dağıtır ve yüzdelerini hesaplar. */
export function bucketize(
  values: readonly number[],
  bands: readonly { readonly label: string; readonly max: number }[] = SCORE_BANDS,
): DistributionBucket[] {
  const counts = bands.map(() => 0);

  for (const value of values) {
    const index = bands.findIndex((band) => value <= band.max);
    counts[index === -1 ? bands.length - 1 : index] += 1;
  }

  return bands.map((band, index) => ({
    label: band.label,
    count: counts[index],
    percent: values.length === 0 ? 0 : Math.round((counts[index] / values.length) * 100),
  }));
}

export function gradeDistribution(percents: readonly number[]): DistributionBucket[] {
  const counts = new Map<string, number>(GRADE_BANDS.map((band) => [band.label, 0]));

  for (const percent of percents) {
    const grade = gradeOf(percent);
    counts.set(grade, (counts.get(grade) ?? 0) + 1);
  }

  return GRADE_BANDS.map((band) => ({
    label: band.label,
    count: counts.get(band.label) ?? 0,
    percent:
      percents.length === 0
        ? 0
        : Math.round(((counts.get(band.label) ?? 0) / percents.length) * 100),
  }));
}

/* ── Oranlar ─────────────────────────────────────────────────────────────── */

/**
 * Yüzde hesaplar.
 *
 * Payda sıfırsa 0 döner; "0/0 = %100" gibi yanıltıcı bir sonuç üretmez —
 * veri yokken başarı iddiasında bulunmak raporun güvenilirliğini bozar.
 */
export function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
