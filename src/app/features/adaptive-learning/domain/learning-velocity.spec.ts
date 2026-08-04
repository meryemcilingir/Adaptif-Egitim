import { describe, expect, it } from 'vitest';

import {
  MIN_RISK_SIGNALS,
  PerformanceInput,
  VelocityInput,
  buildPerformerBoard,
  computeVelocity,
  evaluatePerformance,
  summarizeVelocity,
} from './learning-velocity';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');
const FOUR_WEEKS_AGO = '2026-07-03T12:00:00.000Z';

function velocityInput(overrides: Partial<VelocityInput> = {}): VelocityInput {
  return {
    studentId: 'stu1',
    studentName: 'Elif Yılmaz',
    completedCount: 20,
    totalCount: 40,
    minutesSpent: 600,
    startedAt: FOUR_WEEKS_AGO,
    masteryPercent: 70,
    ...overrides,
  };
}

function performanceInput(overrides: Partial<PerformanceInput> = {}): PerformanceInput {
  return {
    studentId: 'stu1',
    studentName: 'Elif Yılmaz',
    cohortName: '2026-A',
    masteryPercent: 80,
    examAveragePercent: 78,
    completionRate: 75,
    failedExams: 0,
    attemptCount: 4,
    masteryCount: 12,
    touchedContentCount: 20,
    attendancePercent: 90,
    ...overrides,
  };
}

describe('computeVelocity', () => {
  it('haftalık içerik hızını hesaplar', () => {
    const entry = computeVelocity(velocityInput(), NOW);

    expect(entry.weeksActive).toBe(4);
    expect(entry.itemsPerWeek).toBe(5);
    expect(entry.completionRate).toBe(50);
  });

  it('içerik başına ortalama süreyi hesaplar', () => {
    expect(computeVelocity(velocityInput(), NOW).averageMinutesPerItem).toBe(30);
  });

  /* İlk günlerinde 3 içerik biten öğrenci "haftada 21" gibi görünmemeli. */
  it('bir haftadan yeni öğrencide hızı şişirmez', () => {
    const entry = computeVelocity(
      velocityInput({ completedCount: 3, startedAt: '2026-07-30T12:00:00.000Z' }),
      NOW,
    );

    expect(entry.weeksActive).toBe(1);
    expect(entry.itemsPerWeek).toBe(3);
  });

  it('hiç içerik tamamlanmamışsa sıfıra bölmez', () => {
    const entry = computeVelocity(velocityInput({ completedCount: 0 }), NOW);

    expect(entry.averageMinutesPerItem).toBe(0);
    expect(entry.itemsPerWeek).toBe(0);
  });
});

describe('summarizeVelocity', () => {
  const entries = [
    computeVelocity(velocityInput({ studentId: 'a', completedCount: 32 }), NOW),
    computeVelocity(velocityInput({ studentId: 'b', completedCount: 20 }), NOW),
    computeVelocity(velocityInput({ studentId: 'c', completedCount: 4 }), NOW),
    computeVelocity(velocityInput({ studentId: 'd', completedCount: 0 }), NOW),
  ];

  it('hızlı öğrenenleri seçer', () => {
    expect(summarizeVelocity(entries).fastLearners.map((e) => e.studentId)).toEqual(['a', 'b']);
  });

  it('yavaş öğrenenleri seçer', () => {
    expect(summarizeVelocity(entries).slowLearners.map((e) => e.studentId)).toEqual(['c']);
  });

  /* Hiç başlamamış öğrencinin sorunu hız değil katılımdır. */
  it('hiç içerik tamamlamamış öğrenciyi yavaş listesine koymaz', () => {
    expect(summarizeVelocity(entries).slowLearners.some((e) => e.studentId === 'd')).toBe(false);
  });

  it('ortalamaları yalnızca aktif öğrencilerden hesaplar', () => {
    const report = summarizeVelocity(entries);
    expect(report.averageItemsPerWeek).toBeGreaterThan(0);
  });

  it('boş listede çökmez', () => {
    expect(summarizeVelocity([]).averageItemsPerWeek).toBe(0);
  });
});

describe('evaluatePerformance', () => {
  it('iyi öğrencide risk gerekçesi üretmez', () => {
    expect(evaluatePerformance(performanceInput()).riskReasons).toEqual([]);
  });

  it('düşük ustalığı gerekçe olarak yazar', () => {
    const entry = evaluatePerformance(performanceInput({ masteryPercent: 35 }));
    expect(entry.riskReasons[0]).toContain('Ustalık');
  });

  it('her risk sinyali için ayrı gerekçe verir', () => {
    const entry = evaluatePerformance(
      performanceInput({
        masteryPercent: 30,
        examAveragePercent: 40,
        completionRate: 20,
        attendancePercent: 50,
        failedExams: 3,
      }),
    );

    expect(entry.riskReasons).toHaveLength(5);
  });

  /* Hiç sınava girmemiş öğrenci "sınav ortalaması düşük" diye işaretlenmemeli. */
  it('sınava girmemiş öğrenciye sınav gerekçesi yazmaz', () => {
    const entry = evaluatePerformance(
      performanceInput({ attemptCount: 0, examAveragePercent: 0 }),
    );

    expect(entry.riskReasons.some((r) => r.includes('Sınav'))).toBe(false);
  });

  it('bileşik puanda başarıyı çabadan ağır tartar', () => {
    const achiever = evaluatePerformance(
      performanceInput({ masteryPercent: 90, examAveragePercent: 90, completionRate: 30 }),
    );
    const busy = evaluatePerformance(
      performanceInput({ masteryPercent: 50, examAveragePercent: 50, completionRate: 100 }),
    );

    expect(achiever.compositeScore).toBeGreaterThan(busy.compositeScore);
  });
});

describe('buildPerformerBoard', () => {
  const students = [
    performanceInput({ studentId: 'top', masteryPercent: 95, examAveragePercent: 92 }),
    performanceInput({ studentId: 'orta', masteryPercent: 70, examAveragePercent: 68 }),
    performanceInput({
      studentId: 'risk',
      masteryPercent: 30,
      examAveragePercent: 35,
      completionRate: 20,
      attendancePercent: 40,
    }),
    performanceInput({ studentId: 'tek-sinyal', attendancePercent: 40 }),
  ];

  it('en iyileri bileşik puana göre sıralar', () => {
    expect(buildPerformerBoard(students).topPerformers[0].studentId).toBe('top');
  });

  it('risk altındakileri en düşükten sıralar', () => {
    expect(buildPerformerBoard(students).atRisk[0].studentId).toBe('risk');
  });

  /* Tek başına düşük katılım risk sayılmaz — en az iki sinyal aranır. */
  it('tek sinyalli öğrenciyi riskli saymaz', () => {
    const board = buildPerformerBoard(students);
    expect(board.atRisk.some((e) => e.studentId === 'tek-sinyal')).toBe(false);
    expect(MIN_RISK_SIGNALS).toBe(2);
  });

  it('riskli öğrenciyi en iyiler listesine koymaz', () => {
    const board = buildPerformerBoard(students);
    expect(board.topPerformers.some((e) => e.studentId === 'risk')).toBe(false);
  });

  it('sayıları raporlar', () => {
    const board = buildPerformerBoard(students);
    expect(board.studentCount).toBe(4);
    expect(board.atRiskCount).toBe(1);
  });

  it('boş listede çökmez', () => {
    expect(buildPerformerBoard([]).studentCount).toBe(0);
  });
});


describe('ölçülmemiş öğrenci', () => {
  it('hiç ölçümü olmayan öğrenciye risk gerekçesi yazmaz', () => {
    const entry = evaluatePerformance(
      performanceInput({
        masteryPercent: 0,
        examAveragePercent: 0,
        completionRate: 0,
        attendancePercent: 0,
        attemptCount: 0,
        masteryCount: 0,
        touchedContentCount: 0,
      }),
    );

    expect(entry.isMeasured).toBe(false);
    expect(entry.riskReasons).toEqual([]);
  });

  it('ustalık ölçümü yoksa sıfır ustalığı gerekçe saymaz', () => {
    const entry = evaluatePerformance(
      performanceInput({ masteryPercent: 0, masteryCount: 0 }),
    );

    expect(entry.riskReasons.some((reason) => reason.startsWith('Ustalık'))).toBe(false);
  });

  it('panoda ölçülmemiş öğrenciler ayrı sayılır ve listelere girmez', () => {
    const board = buildPerformerBoard([
      performanceInput({ studentId: 'olculen' }),
      performanceInput({
        studentId: 'olculmeyen',
        masteryPercent: 0,
        examAveragePercent: 0,
        completionRate: 0,
        attendancePercent: 0,
        attemptCount: 0,
        masteryCount: 0,
        touchedContentCount: 0,
      }),
    ]);

    expect(board.studentCount).toBe(2);
    expect(board.measuredCount).toBe(1);
    expect(board.unmeasuredCount).toBe(1);
    expect(board.atRiskCount).toBe(0);
    expect(board.topPerformers.map((entry) => entry.studentId)).toEqual(['olculen']);
  });
});
