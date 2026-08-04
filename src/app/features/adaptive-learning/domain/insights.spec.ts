import { describe, expect, it } from 'vitest';

import { MetricDelta } from '../models/analytics.model';
import { InsightInput, buildInsights, emptyInsight } from './insights';

const flat: MetricDelta = { current: 70, previous: 70, changePercent: 0, direction: 'flat' };

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    averageScore: flat,
    completionRate: flat,
    acceptanceRate: { current: 65, previous: 65, changePercent: 0, direction: 'flat' },
    averageMastery: 72,
    weakOutcomes: [],
    strongOutcomes: [],
    lowPassExams: [],
    atRiskCount: 0,
    studentCount: 100,
    flaggedQuestionCount: 0,
    totalQuestionCount: 200,
    slowQuestions: [],
    ...overrides,
  };
}

describe('buildInsights — kazanım kuralları', () => {
  it('eşiğin altındaki kazanımı bildirir', () => {
    const insights = buildInsights(
      input({ weakOutcomes: [{ id: 'o1', code: 'LO-8', mastery: 41 }] }),
    );

    const found = insights.find((i) => i.id === 'weak-outcome-o1');
    expect(found?.title).toContain('LO-8');
    expect(found?.kind).toBe('warning');
  });

  /* Tek zayıf kazanım uyarıdır; üç tanesi yapısal bir sorundur. */
  it('üç veya daha fazla zayıf kazanımı kritik sayar', () => {
    const insights = buildInsights(
      input({
        weakOutcomes: [
          { id: 'o1', code: 'LO-1', mastery: 40 },
          { id: 'o2', code: 'LO-2', mastery: 45 },
          { id: 'o3', code: 'LO-3', mastery: 50 },
        ],
      }),
    );

    expect(insights[0].kind).toBe('critical');
  });

  it('eşiğin üstündeki kazanımı olumlu bildirir', () => {
    const insights = buildInsights(
      input({ strongOutcomes: [{ code: 'LO-2', mastery: 88 }] }),
    );

    expect(insights.some((i) => i.id === 'strong-outcomes' && i.kind === 'positive')).toBe(true);
  });

  it('eşik içindeki kazanımlar için yorum üretmez', () => {
    const insights = buildInsights(input({ weakOutcomes: [{ id: 'o1', code: 'LO-1', mastery: 70 }] }));
    expect(insights.some((i) => i.id.startsWith('weak-outcome'))).toBe(false);
  });
});

describe('buildInsights — eğilim kuralları', () => {
  it('anlamlı düşüşü bildirir', () => {
    const insights = buildInsights(
      input({
        averageScore: { current: 60, previous: 70, changePercent: -14, direction: 'down' },
      }),
    );

    const found = insights.find((i) => i.id === 'score-trend');
    expect(found?.title).toContain('%14');
    expect(found?.kind).toBe('warning');
  });

  /* Küçük dalgalanmalar "eğilim" diye sunulmamalı. */
  it('küçük değişimi yorumlamaz', () => {
    const insights = buildInsights(
      input({ averageScore: { current: 71, previous: 70, changePercent: 3, direction: 'up' } }),
    );

    expect(insights.some((i) => i.id === 'score-trend')).toBe(false);
  });

  it('tamamlama yavaşlamasını bildirir', () => {
    const insights = buildInsights(
      input({
        completionRate: { current: 50, previous: 65, changePercent: -23, direction: 'down' },
      }),
    );

    expect(insights.some((i) => i.id === 'completion-trend')).toBe(true);
  });

  it('tamamlama artışını uyarı olarak göstermez', () => {
    const insights = buildInsights(
      input({
        completionRate: { current: 80, previous: 60, changePercent: 33, direction: 'up' },
      }),
    );

    expect(insights.some((i) => i.id === 'completion-trend')).toBe(false);
  });
});

describe('buildInsights — sınav ve risk', () => {
  it('düşük geçme oranını bildirir', () => {
    const insights = buildInsights(
      input({ lowPassExams: [{ id: 'e1', title: 'MAT101 Final', passRate: 38 }] }),
    );

    const found = insights.find((i) => i.id === 'low-pass-e1');
    expect(found?.kind).toBe('critical');
    expect(found?.link).toBe('/exams/e1');
  });

  it('risk oranı eşiği aşınca bildirir', () => {
    const insights = buildInsights(input({ atRiskCount: 30, studentCount: 100 }));
    expect(insights.some((i) => i.id === 'at-risk-share')).toBe(true);
  });

  it('düşük risk oranını yorumlamaz', () => {
    const insights = buildInsights(input({ atRiskCount: 5, studentCount: 100 }));
    expect(insights.some((i) => i.id === 'at-risk-share')).toBe(false);
  });

  it('öğrenci yokken sıfıra bölmez', () => {
    expect(() => buildInsights(input({ studentCount: 0, atRiskCount: 0 }))).not.toThrow();
  });
});

describe('buildInsights — öneri motoru', () => {
  it('düşük kabul oranını uyarır', () => {
    const insights = buildInsights(
      input({ acceptanceRate: { current: 25, previous: 25, changePercent: 0, direction: 'flat' } }),
    );

    expect(insights.some((i) => i.id === 'low-acceptance')).toBe(true);
  });

  it('kabul oranı artışını olumlu bildirir', () => {
    const insights = buildInsights(
      input({ acceptanceRate: { current: 70, previous: 55, changePercent: 27, direction: 'up' } }),
    );

    expect(insights.some((i) => i.id === 'acceptance-up' && i.kind === 'positive')).toBe(true);
  });
});

describe('buildInsights — sıralama', () => {
  it('kritik bulguları en üste alır', () => {
    const insights = buildInsights(
      input({
        lowPassExams: [{ id: 'e1', title: 'Final', passRate: 30 }],
        strongOutcomes: [{ code: 'LO-1', mastery: 95 }],
      }),
    );

    expect(insights[0].kind).toBe('critical');
  });

  it('her içgörü kanıt taşır', () => {
    const insights = buildInsights(
      input({ weakOutcomes: [{ id: 'o1', code: 'LO-1', mastery: 30 }] }),
    );

    expect(insights.every((i) => i.evidence.length > 0)).toBe(true);
  });
});

describe('emptyInsight', () => {
  it('veri yokken filtre genişletmeyi önerir', () => {
    expect(emptyInsight(0).evidence).toContain('Filtreleri');
  });

  it('veri varken incelenen kayıt sayısını söyler', () => {
    expect(emptyInsight(42).evidence).toContain('42');
  });
});
