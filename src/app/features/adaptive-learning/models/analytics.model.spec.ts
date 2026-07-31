import { describe, expect, it } from 'vitest';

import { computeDelta } from './analytics.model';

describe('computeDelta', () => {
  it('artışı yukarı yön olarak raporlar', () => {
    const delta = computeDelta(120, 100);

    expect(delta.direction).toBe('up');
    expect(delta.changePercent).toBe(20);
  });

  it('azalışı aşağı yön olarak raporlar ve yüzdeyi mutlak değer verir', () => {
    const delta = computeDelta(80, 100);

    expect(delta.direction).toBe('down');
    expect(delta.changePercent).toBe(20);
  });

  it('ihmal edilebilir değişimi düz kabul eder', () => {
    expect(computeDelta(100.2, 100).direction).toBe('flat');
  });

  it('önceki değer sıfırken sıfıra bölme yapmaz', () => {
    expect(computeDelta(5, 0)).toEqual({
      current: 5,
      previous: 0,
      changePercent: 100,
      direction: 'up',
    });

    expect(computeDelta(0, 0).direction).toBe('flat');
  });
});
