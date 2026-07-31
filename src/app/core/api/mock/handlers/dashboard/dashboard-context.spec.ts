import { describe, expect, it } from 'vitest';

import { average, kpi, percent, sparkline, trendOf } from './dashboard-context';

describe('average', () => {
  it('boş dizide sıfır döner', () => {
    expect(average([])).toBe(0);
  });

  it('ortalamayı tam sayıya yuvarlar', () => {
    expect(average([10, 20, 25])).toBe(18);
  });
});

describe('percent', () => {
  it('toplam sıfırken sıfıra bölme yapmaz', () => {
    expect(percent(5, 0)).toBe(0);
  });

  it('oranı yüzdeye çevirir', () => {
    expect(percent(3, 4)).toBe(75);
  });
});

describe('sparkline', () => {
  it('veri yoksa yedi sıfırdan oluşan seri döner', () => {
    expect(sparkline([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('yedi veya daha az değeri olduğu gibi bırakır', () => {
    expect(sparkline([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('uzun serileri yedi kovaya indirger', () => {
    const result = sparkline(Array.from({ length: 40 }, (_, index) => index));

    expect(result).toHaveLength(7);
    expect(result[0]).toBeLessThan(result[6]!);
  });
});

describe('trendOf', () => {
  it('yükselen seride yukarı yön verir', () => {
    const trend = trendOf([10, 20, 30, 40, 50, 60, 70]);

    expect(trend.direction).toBe('up');
    expect(trend.trendPercent).toBeGreaterThan(0);
  });

  it('düşen seride aşağı yön verir', () => {
    expect(trendOf([70, 60, 50, 40, 30, 20, 10]).direction).toBe('down');
  });

  it('tek noktalı seride yön üretmez — uydurma trend gösterilmez', () => {
    expect(trendOf([42])).toEqual({ trendPercent: 0, direction: 'flat' });
  });

  it('sabit seride düz yön verir', () => {
    expect(trendOf([50, 50, 50, 50, 50, 50, 50]).direction).toBe('flat');
  });
});

describe('kpi', () => {
  it('trend ve sparkline değerlerini seriden türetir', () => {
    const card = kpi({
      key: 'test',
      label: 'Test',
      value: 42,
      icon: 'target',
      caption: 'açıklama',
      series: [10, 20, 30, 40, 50, 60, 70],
    });

    expect(card.value).toBe(42);
    expect(card.direction).toBe('up');
    expect(card.sparkline).toHaveLength(7);
    expect(card.higherIsBetter).toBe(true);
  });

  it('düşmesi istenen metriklerde higherIsBetter bayrağını korur', () => {
    const card = kpi({
      key: 'pending',
      label: 'Bekleyen',
      value: 3,
      icon: 'clipboard-list',
      caption: '',
      series: [9, 7, 5, 3],
      higherIsBetter: false,
    });

    expect(card.higherIsBetter).toBe(false);
    expect(card.direction).toBe('down');
  });
});
