import { describe, expect, it } from 'vitest';

import {
  bucketize,
  gradeDistribution,
  gradeOf,
  mean,
  median,
  percentOf,
  percentile,
  standardDeviation,
  summarize,
} from './statistics';

describe('mean / median', () => {
  it('ortalamayı hesaplar', () => {
    expect(mean([10, 20, 30])).toBe(20);
  });

  it('tek sayıda değerde ortadakini verir', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('çift sayıda değerde ortadaki ikisinin ortalamasını verir', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  /* Analitik ekranlarında filtre sonucu boş küme olağandır; çökmemeli. */
  it('boş dizide sıfır döner', () => {
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
  });

  it('birkaç uç değer ortalamayı çekerken medyan dayanıklı kalır', () => {
    const scores = [70, 72, 75, 74, 0, 0];
    expect(mean(scores)).toBeCloseTo(48.5, 1);
    expect(median(scores)).toBe(71);
  });
});

describe('standardDeviation', () => {
  it('popülasyon standart sapmasını hesaplar', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('tüm değerler aynıysa sıfırdır', () => {
    expect(standardDeviation([50, 50, 50])).toBe(0);
  });

  it('boş dizide sıfır döner', () => {
    expect(standardDeviation([])).toBe(0);
  });
});

describe('percentile', () => {
  it('çeyreklikleri ara değerlemeyle hesaplar', () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 0.5)).toBe(3);
    expect(percentile(values, 0.25)).toBe(2);
  });

  it('sınırların dışındaki p değerlerini kırpar', () => {
    expect(percentile([10, 20], -1)).toBe(10);
    expect(percentile([10, 20], 5)).toBe(20);
  });

  it('tek değerde onu döner', () => {
    expect(percentile([42], 0.9)).toBe(42);
  });
});

describe('summarize', () => {
  it('tüm özet istatistikleri üretir', () => {
    const result = summarize([60, 70, 80, 90]);

    expect(result.count).toBe(4);
    expect(result.mean).toBe(75);
    expect(result.median).toBe(75);
    expect(result.min).toBe(60);
    expect(result.max).toBe(90);
    expect(result.q1).toBe(67.5);
    expect(result.q3).toBe(82.5);
  });

  it('boş dizide güvenli varsayılan verir', () => {
    expect(summarize([]).count).toBe(0);
    expect(summarize([]).max).toBe(0);
  });
});

describe('bucketize', () => {
  it('değerleri puan bantlarına dağıtır', () => {
    const buckets = bucketize([10, 30, 55, 75, 95, 100]);

    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 2]);
    expect(buckets[4].percent).toBe(33);
  });

  it('sınır değerleri alt banda koyar', () => {
    expect(bucketize([20])[0].count).toBe(1);
    expect(bucketize([21])[1].count).toBe(1);
  });

  it('boş dizide yüzdeleri sıfırlar', () => {
    expect(bucketize([]).every((b) => b.percent === 0)).toBe(true);
  });
});

describe('gradeOf / gradeDistribution', () => {
  it('yüzdeyi harf notuna çevirir', () => {
    expect(gradeOf(95)).toBe('AA');
    expect(gradeOf(86)).toBe('BA');
    expect(gradeOf(60)).toBe('CC');
    expect(gradeOf(49)).toBe('FF');
  });

  it('not dağılımını üretir', () => {
    const dist = gradeDistribution([95, 95, 40]);
    const aa = dist.find((item) => item.label === 'AA');
    const ff = dist.find((item) => item.label === 'FF');

    expect(aa?.count).toBe(2);
    expect(ff?.count).toBe(1);
    expect(aa?.percent).toBe(67);
  });

  it('tüm harfleri döner, boş olanlar sıfır sayılır', () => {
    expect(gradeDistribution([100])).toHaveLength(7);
  });
});

describe('percentOf', () => {
  it('yüzde hesaplar', () => {
    expect(percentOf(3, 4)).toBe(75);
  });

  /* "0/0 = %100" yanıltıcı olurdu: veri yokken başarı iddia edilmez. */
  it('payda sıfırken sıfır döner', () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});
