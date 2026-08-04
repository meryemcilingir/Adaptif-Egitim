import { describe, expect, it } from 'vitest';

import {
  MAX_RANGE_DAYS,
  formatRange,
  isWithin,
  previousRange,
  rangeDays,
  resolveRange,
  validateRange,
} from './analytics-range';

const NOW = Date.parse('2026-07-31T14:00:00.000Z');

describe('resolveRange', () => {
  it('hazır pencereyi gün sınırlarına yuvarlar', () => {
    const range = resolveRange({ preset: 'last7', from: null, to: null }, NOW);

    expect(new Date(range.from).getHours()).toBe(0);
    expect(new Date(range.to).getHours()).toBe(23);
  });

  it('son 7 gün 7 günlük pencere üretir', () => {
    const range = resolveRange({ preset: 'last7', from: null, to: null }, NOW);
    expect(rangeDays(range)).toBe(7);
  });

  it('son 90 gün pencereyi genişletir', () => {
    const range = resolveRange({ preset: 'last90', from: null, to: null }, NOW);
    expect(rangeDays(range)).toBe(90);
  });

  /* Saat 14:00'te üretilmiş kayıt "bugün" filtresine girmelidir. */
  it('özel aralıkta bitiş günün sonuna alınır', () => {
    const range = resolveRange(
      { preset: 'custom', from: '2026-07-01', to: '2026-07-31' },
      NOW,
    );

    expect(isWithin(range, '2026-07-31T14:00:00.000Z')).toBe(true);
  });
});

describe('validateRange', () => {
  const custom = (from: string | null, to: string | null) =>
    validateRange({ preset: 'custom', from, to }, NOW);

  it('hazır pencerelerde doğrulama yapmaz', () => {
    expect(validateRange({ preset: 'last30', from: null, to: null }, NOW)).toEqual([]);
  });

  it('eksik tarihleri bildirir', () => {
    expect(custom(null, '2026-07-31').map((i) => i.field)).toContain('from');
    expect(custom('2026-07-01', null).map((i) => i.field)).toContain('to');
  });

  it('ters aralığı reddeder', () => {
    const issues = custom('2026-07-31', '2026-07-01');
    expect(issues.some((i) => i.message.includes('önce olamaz'))).toBe(true);
  });

  it('gelecek tarihi reddeder', () => {
    const issues = custom('2027-01-01', '2027-02-01');
    expect(issues.map((i) => i.field)).toContain('from');
  });

  it('bir yılı aşan aralığı reddeder', () => {
    const issues = custom('2024-01-01', '2026-07-31');
    expect(issues.some((i) => i.message.includes(String(MAX_RANGE_DAYS)))).toBe(true);
  });

  it('geçerli aralığı kabul eder', () => {
    expect(custom('2026-07-01', '2026-07-31')).toEqual([]);
  });

  it('okunamayan tarihi bildirir', () => {
    expect(custom('gecersiz', '2026-07-31')[0].field).toBe('range');
  });
});

describe('previousRange', () => {
  /* Karşılaştırma için pencere uzunluğu AYNI olmalıdır. */
  it('aynı uzunlukta önceki pencereyi verir', () => {
    const current = resolveRange({ preset: 'last30', from: null, to: null }, NOW);
    const previous = previousRange(current);

    expect(rangeDays(previous)).toBe(rangeDays(current));
    expect(Date.parse(previous.to)).toBeLessThan(Date.parse(current.from));
  });
});

describe('isWithin', () => {
  const range = resolveRange({ preset: 'custom', from: '2026-07-01', to: '2026-07-31' }, NOW);

  it('aralık içindeki tarihi kabul eder', () => {
    expect(isWithin(range, '2026-07-15T10:00:00.000Z')).toBe(true);
  });

  it('aralık dışındaki tarihi reddeder', () => {
    expect(isWithin(range, '2026-06-30T10:00:00.000Z')).toBe(false);
    expect(isWithin(range, '2026-08-01T10:00:00.000Z')).toBe(false);
  });
});

describe('formatRange', () => {
  it('okunabilir aralık metni üretir', () => {
    const range = resolveRange({ preset: 'custom', from: '2026-07-01', to: '2026-07-31' }, NOW);
    expect(formatRange(range)).toMatch(/–/);
  });
});
