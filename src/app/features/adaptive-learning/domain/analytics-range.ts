/**
 * Analitik zaman aralığı (Sprint 8 §14, §23).
 *
 * Tüm rapor ekranları AYNI aralık sözleşmesini kullanır: hazır bir pencere
 * (7/30/90 gün) ya da elle seçilmiş bir tarih aralığı. Doğrulama burada tek
 * yerde yapılır ki her ekran kendi kuralını uydurmasın.
 *
 * Saf fonksiyonlardır; "şimdi" her zaman parametredir → doğrudan test edilir ve
 * mock sunucu da aynı çözümlemeyi kullanır.
 */

export const RANGE_PRESETS = ['last7', 'last30', 'last90', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Readonly<Record<RangePreset, string>> = {
  last7: 'Son 7 gün',
  last30: 'Son 30 gün',
  last90: 'Son 90 gün',
  custom: 'Özel aralık',
};

export const PRESET_DAYS: Readonly<Record<Exclude<RangePreset, 'custom'>, number>> = {
  last7: 7,
  last30: 30,
  last90: 90,
};

/** En uzun izin verilen özel aralık — daha uzunu grafikleri okunmaz kılar. */
export const MAX_RANGE_DAYS = 365;

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export interface RangeSelection {
  readonly preset: RangePreset;
  /** Yalnızca `preset === 'custom'` iken anlamlıdır. */
  readonly from: string | null;
  readonly to: string | null;
}

export function defaultRange(): RangeSelection {
  return { preset: 'last30', from: null, to: null };
}

/**
 * Seçimi somut bir tarih aralığına çevirir.
 *
 * Gün sınırlarına yuvarlanır: `from` günün başına, `to` günün sonuna. Aksi
 * hâlde "bugün" seçen kullanıcı, saat 14:00'te üretilmiş kayıtları göremezdi.
 */
export function resolveRange(selection: RangeSelection, nowMs: number): DateRange {
  if (selection.preset !== 'custom') {
    const days = PRESET_DAYS[selection.preset];
    const to = endOfDay(nowMs);
    const from = startOfDay(nowMs - (days - 1) * 86_400_000);
    return { from, to };
  }

  const from = selection.from ? startOfDay(Date.parse(selection.from)) : startOfDay(nowMs);
  const to = selection.to ? endOfDay(Date.parse(selection.to)) : endOfDay(nowMs);

  return { from, to };
}

export interface RangeIssue {
  readonly field: 'from' | 'to' | 'range';
  readonly message: string;
}

/**
 * Aralık doğrulaması (§23).
 *
 * Geçersiz aralık SEÇİLEMEZ: bitiş başlangıçtan önce olamaz, gelecek tarih
 * seçilemez (henüz olmamış veri raporlanamaz) ve aralık bir yılı aşamaz.
 */
export function validateRange(selection: RangeSelection, nowMs: number): readonly RangeIssue[] {
  if (selection.preset !== 'custom') return [];

  const issues: RangeIssue[] = [];

  if (!selection.from) {
    issues.push({ field: 'from', message: 'Başlangıç tarihi seçilmelidir.' });
  }
  if (!selection.to) {
    issues.push({ field: 'to', message: 'Bitiş tarihi seçilmelidir.' });
  }
  if (issues.length > 0) return issues;

  const from = Date.parse(selection.from!);
  const to = Date.parse(selection.to!);

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return [{ field: 'range', message: 'Tarihler okunamadı.' }];
  }

  if (to < from) {
    issues.push({ field: 'range', message: 'Bitiş tarihi başlangıçtan önce olamaz.' });
  }

  if (from > nowMs) {
    issues.push({ field: 'from', message: 'Gelecek bir tarih seçilemez.' });
  }

  if (to - from > MAX_RANGE_DAYS * 86_400_000) {
    issues.push({
      field: 'range',
      message: `Aralık en fazla ${MAX_RANGE_DAYS} gün olabilir.`,
    });
  }

  return issues;
}

/** Aralığın gün sayısı — trend grafiğinin nokta sayısını belirler. */
export function rangeDays(range: DateRange): number {
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000);
  return Math.max(1, days);
}

export function isWithin(range: DateRange, iso: string): boolean {
  const value = Date.parse(iso);
  return value >= Date.parse(range.from) && value <= Date.parse(range.to);
}

/**
 * Bir önceki eşit uzunlukta pencere.
 *
 * Karşılaştırmalı metrikler ("geçen aya göre %14 düştü") bunu kullanır;
 * pencere uzunluğu aynı olmazsa karşılaştırma anlamsız olurdu.
 */
export function previousRange(range: DateRange): DateRange {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const span = to - from;

  return {
    from: new Date(from - span - 1).toISOString(),
    to: new Date(from - 1).toISOString(),
  };
}

export function formatRange(range: DateRange): string {
  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const from = new Date(range.from).toLocaleDateString('tr-TR', options);
  const to = new Date(range.to).toLocaleDateString('tr-TR', options);

  return `${from} – ${to}`;
}

function startOfDay(ms: number): string {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfDay(ms: number): string {
  const date = new Date(ms);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}
