import { describe, expect, it } from 'vitest';

import { ContentProgress } from '../models/content-item.model';
import {
  buildAchievements,
  buildWeeklyStudy,
  calculateStreak,
} from './engagement';

const NOW = Date.parse('2026-03-10T09:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function progress(overrides: Partial<ContentProgress> = {}): ContentProgress {
  return {
    id: 'prg1',
    contentId: 'c1',
    studentId: 'std1',
    state: 'in_progress',
    completionPercent: 50,
    spentMinutes: 20,
    startedAt: null,
    completedAt: null,
    lastAccessedAt: daysAgo(0),
    scorePercent: null,
    ...overrides,
  };
}

describe('calculateStreak', () => {
  it('kayıt yoksa sıfır seri döner', () => {
    expect(calculateStreak([], NOW)).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      atRisk: false,
      lastStudyDate: null,
    });
  });

  it('kesintisiz günleri sayar', () => {
    const result = calculateStreak([daysAgo(0), daysAgo(1), daysAgo(2)], NOW);

    expect(result.currentStreak).toBe(3);
    expect(result.atRisk).toBe(false);
  });

  it('aynı gündeki birden fazla kaydı tek gün sayar', () => {
    const result = calculateStreak([daysAgo(0), daysAgo(0), daysAgo(1)], NOW);

    expect(result.currentStreak).toBe(2);
  });

  it('dünle biten seriyi riskli işaretler', () => {
    const result = calculateStreak([daysAgo(1), daysAgo(2)], NOW);

    expect(result.currentStreak).toBe(2);
    expect(result.atRisk).toBe(true);
  });

  it('iki gün boşluk seriyi kırar', () => {
    const result = calculateStreak([daysAgo(3), daysAgo(4)], NOW);

    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(2);
  });
});

describe('buildWeeklyStudy', () => {
  // NOW = 2026-03-10T09:00:00.000Z bir Salı; hafta Pazartesi (03-09) ile başlar.
  const MONDAY = '2026-03-09';
  const TUESDAY = '2026-03-10';

  it('her zaman 7 gün döner ve Pazartesi ile başlar', () => {
    const days = buildWeeklyStudy([], NOW);

    expect(days).toHaveLength(7);
    expect(days[0]!.date).toBe(MONDAY);
    expect(days[0]!.label).toBe('Pzt');
  });

  it('bugünün konumu haftanın gününe göre sabittir, en sağda değildir', () => {
    const days = buildWeeklyStudy([], NOW);

    expect(days[1]!.date).toBe(TUESDAY);
    expect(days[1]!.label).toBe('Sal');
  });

  it('süreleri ve tamamlanan içerikleri güne göre toplar', () => {
    const days = buildWeeklyStudy(
      [
        progress({ id: 'p1', spentMinutes: 20, lastAccessedAt: daysAgo(0), state: 'completed' }),
        progress({ id: 'p2', spentMinutes: 10, lastAccessedAt: daysAgo(0) }),
        progress({ id: 'p3', spentMinutes: 45, lastAccessedAt: daysAgo(2) }),
      ],
      NOW,
    );

    // daysAgo(0) = bugün = Salı (index 1); daysAgo(2) = Pazar (index 6, önceki hafta değil bu haftanın Pazarı bir önceki haftada kalır)
    expect(days[1]!.minutes).toBe(30);
    expect(days[1]!.completedCount).toBe(1);
  });

  it('haftanın dışındaki kayıtları saymaz', () => {
    const days = buildWeeklyStudy(
      [progress({ spentMinutes: 99, lastAccessedAt: daysAgo(30) })],
      NOW,
    );

    expect(days.reduce((sum, day) => sum + day.minutes, 0)).toBe(0);
  });
});

describe('buildAchievements', () => {
  const base = {
    completedCount: 0,
    completedQuizCount: 0,
    currentStreak: 0,
    completedCourseCount: 0,
    masteredOutcomeCount: 0,
  };

  it('kilitli başarımları da döndürür', () => {
    const achievements = buildAchievements(base);

    expect(achievements.length).toBeGreaterThan(0);
    expect(achievements.every((item) => !item.unlocked)).toBe(true);
  });

  it('hedefe ulaşan başarımı açar', () => {
    const achievements = buildAchievements({ ...base, completedQuizCount: 1 });

    expect(achievements.find((item) => item.id === 'first-quiz')!.unlocked).toBe(true);
  });

  it('kilitli başarımda ilerleme yüzdesi gösterir', () => {
    const streak = buildAchievements({ ...base, currentStreak: 3 }).find(
      (item) => item.id === 'streak-7',
    )!;

    expect(streak.unlocked).toBe(false);
    expect(streak.progressPercent).toBe(43);
  });

  it('ilerleme yüzdesi 100 sınırını aşmaz', () => {
    const achievements = buildAchievements({ ...base, completedCount: 50 });

    expect(achievements.find((item) => item.id === 'content-10')!.progressPercent).toBe(100);
  });
});
