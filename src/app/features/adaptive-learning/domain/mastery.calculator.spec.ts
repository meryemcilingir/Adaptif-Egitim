import { describe, expect, it } from 'vitest';

import { AnswerSignal, MASTERY_CONFIG, bandOf, calculateMastery } from './mastery.calculator';

const NOW = Date.parse('2026-07-27T09:00:00.000Z');

function answer(overrides: Partial<AnswerSignal> = {}): AnswerSignal {
  return {
    difficulty: 'medium',
    correct: true,
    creditRatio: 1,
    answeredAt: new Date(NOW - 86_400_000).toISOString(),
    ...overrides,
  };
}

describe('calculateMastery', () => {
  it('cevap yoksa sıfır skor ve kritik bant döndürür', () => {
    const result = calculateMastery([], NOW);

    expect(result.score).toBe(0);
    expect(result.band).toBe('critical');
    expect(result.confidence).toBe(0);
  });

  it('yeterli sayıda tam doğru cevapta yüksek skor üretir', () => {
    const answers = Array.from({ length: MASTERY_CONFIG.fullConfidenceCount }, () => answer());

    const result = calculateMastery(answers, NOW);

    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.band).toBe('mastered');
    expect(result.confidence).toBe(1);
  });

  it('az veriyle uç skor üretmez — güven düşükken ortalamaya çekilir', () => {
    const few = calculateMastery([answer(), answer()], NOW);
    const many = calculateMastery(
      Array.from({ length: MASTERY_CONFIG.fullConfidenceCount }, () => answer()),
      NOW,
    );

    expect(few.confidence).toBeLessThan(many.confidence);
    expect(few.score).toBeLessThan(many.score);
  });

  it('zor soruyu doğru bilmek kolay soruya göre daha çok değer taşır', () => {
    const hard = calculateMastery(
      Array.from({ length: 8 }, () => answer({ difficulty: 'hard' })),
      NOW,
    );
    const easy = calculateMastery(
      Array.from({ length: 8 }, () => answer({ difficulty: 'easy' })),
      NOW,
    );

    // İkisi de tam doğru olduğu için oran aynıdır; ağırlıklı toplam farklı olmalıdır.
    expect(hard.inputs.weightedTotal).toBeGreaterThan(easy.inputs.weightedTotal);
  });

  it('kısmi puan oranını ağırlıklı doğruluğa yansıtır', () => {
    const partial = calculateMastery(
      Array.from({ length: 8 }, () => answer({ correct: false, creditRatio: 0.5 })),
      NOW,
    );

    expect(partial.score).toBeGreaterThan(0);
    expect(partial.score).toBeLessThan(60);
  });

  it('uzun süre çalışılmayan kazanımda tazelik sönümü uygular', () => {
    const stale = calculateMastery(
      Array.from({ length: 8 }, () =>
        answer({ answeredAt: new Date(NOW - 60 * 86_400_000).toISOString() }),
      ),
      NOW,
    );
    const fresh = calculateMastery(
      Array.from({ length: 8 }, () => answer()),
      NOW,
    );

    expect(stale.score).toBeLessThan(fresh.score);
    expect(stale.inputs.daysSinceLastPractice).toBeGreaterThanOrEqual(
      MASTERY_CONFIG.decayStartsAfterDays,
    );
  });

  it('yalnızca en son cevapları değerlendirmeye alır', () => {
    const answers = Array.from({ length: MASTERY_CONFIG.windowSize + 10 }, () => answer());

    const result = calculateMastery(answers, NOW);

    expect(result.inputs.recentAnswerCount).toBe(MASTERY_CONFIG.windowSize);
  });

  it('tekrar sayısı arttıkça skoru bir miktar sönümler', () => {
    const answers = Array.from({ length: 8 }, () => answer());

    const single = calculateMastery(answers, NOW, 1);
    const repeated = calculateMastery(answers, NOW, 9);

    expect(repeated.score).toBeLessThan(single.score);
  });

  it('skoru 0–100 aralığında tutar', () => {
    const result = calculateMastery(
      Array.from({ length: 12 }, () => answer({ difficulty: 'hard', creditRatio: 1 })),
      NOW,
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('bandOf', () => {
  it('skor eşiklerini doğru banda eşler', () => {
    expect(bandOf(95)).toBe('mastered');
    expect(bandOf(85)).toBe('mastered');
    expect(bandOf(84)).toBe('proficient');
    expect(bandOf(70)).toBe('proficient');
    expect(bandOf(60)).toBe('developing');
    expect(bandOf(40)).toBe('weak');
    expect(bandOf(10)).toBe('critical');
  });
});
