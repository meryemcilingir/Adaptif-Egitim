import { describe, expect, it } from 'vitest';

import {
  LEARNING_THRESHOLDS,
  daysSince,
  evaluateUnlock,
  masteryBand,
  needsRefresh,
} from './learning-rules';

const NOW = Date.parse('2026-03-10T09:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

describe('masteryBand', () => {
  it('ölçüm yoksa kritik bant döner', () => {
    expect(masteryBand(null)).toBe('critical');
  });

  it('eşik değerlerini doğru bantlara ayırır', () => {
    expect(masteryBand(LEARNING_THRESHOLDS.lowMastery - 1)).toBe('critical');
    expect(masteryBand(LEARNING_THRESHOLDS.lowMastery)).toBe('developing');
    expect(masteryBand(LEARNING_THRESHOLDS.midMastery)).toBe('developing');
    expect(masteryBand(LEARNING_THRESHOLDS.midMastery + 1)).toBe('proficient');
    expect(masteryBand(LEARNING_THRESHOLDS.highMastery)).toBe('mastered');
  });
});

describe('evaluateUnlock', () => {
  it('önkoşulu olmayan kazanım açıktır', () => {
    expect(evaluateUnlock('out1', new Map(), new Map())).toEqual({
      unlocked: true,
      missingOutcomeIds: [],
    });
  });

  it('ölçümü olmayan önkoşul kazanımı kilitler', () => {
    const result = evaluateUnlock('out2', new Map([['out2', ['out1']]]), new Map());

    expect(result.unlocked).toBe(false);
    expect(result.missingOutcomeIds).toEqual(['out1']);
  });

  it('eşiğin altındaki önkoşul kazanımı kilitli tutar', () => {
    const mastery = new Map([['out1', LEARNING_THRESHOLDS.unlockMastery - 1]]);

    expect(evaluateUnlock('out2', new Map([['out2', ['out1']]]), mastery).unlocked).toBe(false);
  });

  it('eşiği karşılayan önkoşul kazanımı açar', () => {
    const mastery = new Map([['out1', LEARNING_THRESHOLDS.unlockMastery]]);

    expect(evaluateUnlock('out2', new Map([['out2', ['out1']]]), mastery).unlocked).toBe(true);
  });

  it('kazanımda eşik zaten geçilmişse önkoşula bakmaz', () => {
    const result = evaluateUnlock(
      'out2',
      new Map([['out2', ['out1']]]),
      // Önkoşul eksik ama öğrenci kazanımın kendisinde yeterliliğini göstermiş.
      new Map([
        ['out1', 10],
        ['out2', LEARNING_THRESHOLDS.unlockMastery],
      ]),
    );

    expect(result).toEqual({ unlocked: true, missingOutcomeIds: [] });
  });

  it('eksik önkoşulların tamamını listeler', () => {
    const result = evaluateUnlock(
      'out3',
      new Map([['out3', ['out1', 'out2']]]),
      new Map([['out1', 90]]),
    );

    expect(result.missingOutcomeIds).toEqual(['out2']);
  });
});

describe('daysSince / needsRefresh', () => {
  it('tarih yoksa null döner', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(needsRefresh(null, NOW)).toBe(false);
  });

  it('geçen tam gün sayısını hesaplar', () => {
    expect(daysSince(daysAgo(3), NOW)).toBe(3);
  });

  it('eşik gününde tekrar gerektirir', () => {
    expect(needsRefresh(daysAgo(LEARNING_THRESHOLDS.staleDays - 1), NOW)).toBe(false);
    expect(needsRefresh(daysAgo(LEARNING_THRESHOLDS.staleDays), NOW)).toBe(true);
  });
});
