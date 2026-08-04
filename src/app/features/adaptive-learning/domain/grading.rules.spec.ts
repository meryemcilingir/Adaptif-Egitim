import { describe, expect, it } from 'vitest';

import { AttemptAnswer, GraderScore } from '../models/attempt.model';
import {
  computeTotals,
  detectConflict,
  nextAttemptState,
  pendingManualCount,
  validateGrading,
  validateScore,
} from './grading.rules';

const NOW = '2026-03-10T09:00:00.000Z';

function answer(overrides: Partial<AttemptAnswer> = {}): AttemptAnswer {
  return {
    questionId: 'q1',
    questionVersionId: 'v1',
    value: { kind: 'choice', optionIds: ['a'] },
    maxPoints: 10,
    awardedPoints: 10,
    autoGraded: true,
    correct: true,
    gradedBy: null,
    feedback: '',
    rubricScores: [],
    timeSpentSeconds: 30,
    ...overrides,
  };
}

function graderScore(graderId: string, points: number): GraderScore {
  return {
    graderId,
    graderName: `Uzman ${graderId}`,
    points,
    feedback: '',
    rubricScores: [],
    gradedAt: NOW,
  };
}

describe('validateScore', () => {
  it('geçerli puanı kabul eder', () => {
    expect(validateScore(8, 10, 'q1')).toBeNull();
  });

  it('negatif puanı reddeder', () => {
    expect(validateScore(-1, 10, 'q1')?.field).toBe('awardedPoints');
  });

  it('soru puanını aşan değeri reddeder', () => {
    expect(validateScore(11, 10, 'q1')?.message).toContain('10');
  });

  it('sayısal olmayan değeri reddeder', () => {
    expect(validateScore(Number.NaN, 10, 'q1')).not.toBeNull();
  });
});

describe('validateGrading', () => {
  const input = (awarded: number, previous: number, feedback = '', previouslyGraded = true) => ({
    questionId: 'q1',
    awardedPoints: awarded,
    feedback,
    maxPoints: 10,
    previousPoints: previous,
    previouslyGraded,
  });

  /* BR-12: gerekçe yalnızca MEVCUT puan değişirken zorunlu. */
  it('değişiklik yoksa gerekçe istemez', () => {
    expect(validateGrading([input(8, 8)], '', 'PENDING_MANUAL')).toEqual([]);
  });

  it('hiç puanlanmamış cevaba ilk puanı verirken gerekçe istemez', () => {
    expect(validateGrading([input(8, 0, '', false)], '', 'PENDING_MANUAL')).toEqual([]);
  });

  it('puan değişiyorsa gerekçe zorunlu kılar', () => {
    const issues = validateGrading([input(9, 8)], '', 'GRADED');
    expect(issues.map((issue) => issue.field)).toContain('reason');
  });

  it('çok kısa gerekçeyi kabul etmez', () => {
    const issues = validateGrading([input(9, 8)], 'yanlış', 'GRADED');
    expect(issues).toHaveLength(1);
  });

  it('yeterli gerekçeyle puan değişimine izin verir', () => {
    expect(validateGrading([input(9, 8)], 'Kısmi çözüm hesaba katıldı.', 'GRADED')).toEqual([]);
  });

  it('geri bildirim sınırını denetler', () => {
    const issues = validateGrading([input(8, 8, 'x'.repeat(1001))], '', 'PENDING_MANUAL');
    expect(issues.map((issue) => issue.field)).toContain('feedback');
  });

  it('sonucu açıklanmış denemenin doğrudan puanlanmasını engeller', () => {
    const issues = validateGrading([input(8, 8)], '', 'RELEASED');
    expect(issues.map((issue) => issue.field)).toContain('state');
  });

  it('puanı aşan girdide hem puan hem gerekçe hatası verir', () => {
    const issues = validateGrading([input(15, 8)], '', 'GRADED');
    expect(issues.map((issue) => issue.field).sort()).toEqual(['awardedPoints', 'reason']);
  });
});

describe('detectConflict', () => {
  it('tek değerlendiricide çakışma yoktur', () => {
    expect(detectConflict('q1', 'Soru', [graderScore('a', 16)], null)).toBeNull();
  });

  it('aynı puanı veren iki uzmanda çakışma yoktur', () => {
    expect(detectConflict('q1', 'Soru', [graderScore('a', 16), graderScore('b', 16)], null))
      .toBeNull();
  });

  it('farklı puanlarda çakışma üretir', () => {
    const conflict = detectConflict(
      'q1',
      'Soru',
      [graderScore('a', 16), graderScore('b', 20)],
      null,
    );

    expect(conflict?.minPoints).toBe(16);
    expect(conflict?.maxPoints).toBe(20);
    expect(conflict?.spread).toBe(4);
    expect(conflict?.resolvedPoints).toBeNull();
  });

  /* Aynı uzman iki kez puanlarsa bu bir çakışma değil, güncellemedir. */
  it('aynı uzmanın tekrar puanlamasını çakışma saymaz', () => {
    const conflict = detectConflict(
      'q1',
      'Soru',
      [graderScore('a', 16), graderScore('a', 20)],
      null,
    );

    expect(conflict).toBeNull();
  });

  it('çözülmüş çakışmada kararı taşır', () => {
    const conflict = detectConflict(
      'q1',
      'Soru',
      [graderScore('a', 16), graderScore('b', 20)],
      { points: 18, by: 'usr9', reason: 'Ortak değerlendirme yapıldı.' },
    );

    expect(conflict?.resolvedPoints).toBe(18);
    expect(conflict?.resolvedBy).toBe('usr9');
  });
});

describe('computeTotals', () => {
  it('cevaplardan toplamı ve yüzdeyi hesaplar', () => {
    const totals = computeTotals(
      [answer({ awardedPoints: 8 }), answer({ questionId: 'q2', awardedPoints: 5 })],
      10,
    );

    expect(totals.totalScore).toBe(13);
    expect(totals.maxScore).toBe(20);
    expect(totals.scorePercent).toBe(65);
    expect(totals.passed).toBe(true);
  });

  it('geçme puanının altında kalırsa geçmemiş sayar', () => {
    expect(computeTotals([answer({ awardedPoints: 4 })], 5).passed).toBe(false);
  });

  it('cevap yoksa sıfıra bölmez', () => {
    expect(computeTotals([], 0).scorePercent).toBe(0);
  });
});

describe('pendingManualCount / nextAttemptState', () => {
  const manualUngraded = answer({ questionId: 'q2', autoGraded: false, gradedBy: null });
  const manualGraded = answer({ questionId: 'q2', autoGraded: false, gradedBy: 'usr9' });

  it('elle puanlanmamış cevapları sayar', () => {
    expect(pendingManualCount([answer(), manualUngraded])).toBe(1);
    expect(pendingManualCount([answer(), manualGraded])).toBe(0);
  });

  it('bekleyen cevap varken PENDING_MANUAL kalır', () => {
    expect(nextAttemptState([answer(), manualUngraded], 'AUTO_GRADED')).toBe('PENDING_MANUAL');
  });

  it('hepsi puanlanınca GRADED olur', () => {
    expect(nextAttemptState([answer(), manualGraded], 'PENDING_MANUAL')).toBe('GRADED');
  });

  /* Sonucun açıklanması ayrı bir karardır; puanlama onu geri almaz. */
  it('açıklanmış veya incelemedeki denemenin durumunu değiştirmez', () => {
    expect(nextAttemptState([answer()], 'RELEASED')).toBe('RELEASED');
    expect(nextAttemptState([answer()], 'UNDER_REVIEW')).toBe('UNDER_REVIEW');
  });
});
