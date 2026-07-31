import { ContentProgress } from '../models/content-item.model';

/**
 * Motivasyon göstergeleri: çalışma serisi, haftalık ilerleme ve başarımlar.
 *
 * Oyunlaştırma yalnızca ARAYÜZ seviyesindedir; puanlar gerçek çalışma verisinden
 * türetilir, uydurma sayı üretilmez. Saf fonksiyonlardır → doğrudan test edilir.
 */

const DAY_MS = 86_400_000;

/* ── Çalışma serisi ──────────────────────────────────────────────────────── */

export interface StreakResult {
  /** Bugün veya dün dâhil, kesintisiz çalışılan gün sayısı. */
  readonly currentStreak: number;
  readonly longestStreak: number;
  /** Seri bugün henüz sürdürülmediyse true — arayüz uyarı gösterir. */
  readonly atRisk: boolean;
  readonly lastStudyDate: string | null;
}

/**
 * Çalışma serisini hesaplar.
 *
 * Seri "bugün" ya da "dün" ile bitmelidir; iki gün boşluk seriyi kırar.
 * Dünle biten seri `atRisk` işaretlenir — kullanıcı bugün çalışmazsa serisi bozulur.
 */
export function calculateStreak(timestamps: readonly string[], nowMs: number): StreakResult {
  const days = [
    ...new Set(
      timestamps
        .map((value) => Date.parse(value))
        .filter((value) => !Number.isNaN(value))
        .map((value) => Math.floor(value / DAY_MS)),
    ),
  ].sort((a, b) => b - a);

  if (days.length === 0) {
    return { currentStreak: 0, longestStreak: 0, atRisk: false, lastStudyDate: null };
  }

  const today = Math.floor(nowMs / DAY_MS);
  const lastDay = days[0]!;

  // Seri yalnızca bugün veya dün çalışıldıysa canlıdır.
  let currentStreak = 0;
  if (lastDay === today || lastDay === today - 1) {
    currentStreak = 1;
    for (let index = 1; index < days.length; index++) {
      if (days[index - 1]! - days[index]! !== 1) break;
      currentStreak++;
    }
  }

  let longestStreak = 1;
  let run = 1;
  for (let index = 1; index < days.length; index++) {
    if (days[index - 1]! - days[index]! === 1) {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 1;
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    atRisk: currentStreak > 0 && lastDay !== today,
    lastStudyDate: new Date(lastDay * DAY_MS).toISOString().slice(0, 10),
  };
}

/* ── Haftalık ilerleme ───────────────────────────────────────────────────── */

export interface DailyStudy {
  readonly date: string;
  readonly label: string;
  readonly minutes: number;
  readonly completedCount: number;
}

const DAY_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** Son 7 günün günlük çalışma dökümü (bugün en sağda). */
export function buildWeeklyStudy(
  progress: readonly ContentProgress[],
  nowMs: number,
): DailyStudy[] {
  const today = Math.floor(nowMs / DAY_MS);

  return Array.from({ length: 7 }, (_, index) => {
    const day = today - (6 - index);
    const date = new Date(day * DAY_MS);

    const sameDay = progress.filter(
      (item) =>
        item.lastAccessedAt !== null &&
        Math.floor(Date.parse(item.lastAccessedAt) / DAY_MS) === day,
    );

    return {
      date: date.toISOString().slice(0, 10),
      label: DAY_LABELS[date.getUTCDay()]!,
      minutes: sameDay.reduce((sum, item) => sum + item.spentMinutes, 0),
      completedCount: sameDay.filter((item) => item.state === 'completed').length,
    };
  });
}

/* ── Deneyim puanı ───────────────────────────────────────────────────────── */

export const XP_RULES = {
  perCompletedContent: 50,
  perStudyMinute: 1,
  perStreakDay: 10,
  /** Bir seviyenin gerektirdiği puan. */
  perLevel: 500,
} as const;

export interface ExperienceResult {
  readonly totalXp: number;
  readonly level: number;
  readonly xpIntoLevel: number;
  readonly xpForNextLevel: number;
  readonly percentToNextLevel: number;
}

export function calculateExperience(
  completedCount: number,
  studyMinutes: number,
  streakDays: number,
): ExperienceResult {
  const totalXp =
    completedCount * XP_RULES.perCompletedContent +
    studyMinutes * XP_RULES.perStudyMinute +
    streakDays * XP_RULES.perStreakDay;

  const level = Math.floor(totalXp / XP_RULES.perLevel) + 1;
  const xpIntoLevel = totalXp % XP_RULES.perLevel;

  return {
    totalXp,
    level,
    xpIntoLevel,
    xpForNextLevel: XP_RULES.perLevel,
    percentToNextLevel: Math.round((xpIntoLevel / XP_RULES.perLevel) * 100),
  };
}

/* ── Başarımlar ──────────────────────────────────────────────────────────── */

export interface AchievementInput {
  readonly completedCount: number;
  readonly completedQuizCount: number;
  readonly currentStreak: number;
  readonly completedCourseCount: number;
  readonly masteredOutcomeCount: number;
}

export interface Achievement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly unlocked: boolean;
  /** Kilitliyse ilerleme oranı gösterilir. */
  readonly progressPercent: number;
}

/**
 * Başarım listesi.
 *
 * Kilitli başarımlar da döner — kullanıcı neyi hedefleyeceğini görür.
 * Abartılı rozet yerine sade, ölçülebilir kilometre taşları tanımlıdır.
 */
export function buildAchievements(input: AchievementInput): Achievement[] {
  const define = (
    id: string,
    title: string,
    description: string,
    icon: string,
    current: number,
    target: number,
  ): Achievement => ({
    id,
    title,
    description,
    icon,
    unlocked: current >= target,
    progressPercent: Math.min(100, Math.round((current / target) * 100)),
  });

  return [
    define(
      'first-quiz',
      'İlk değerlendirme',
      'İlk kısa sınavını tamamla.',
      'list-checks',
      input.completedQuizCount,
      1,
    ),
    define('streak-7', '7 gün seri', 'Yedi gün üst üste çalış.', 'flag', input.currentStreak, 7),
    define(
      'content-10',
      '10 içerik',
      'On içerik tamamla.',
      'circle-check-big',
      input.completedCount,
      10,
    ),
    define(
      'outcome-5',
      '5 kazanım',
      'Beş kazanımda ustalaş.',
      'target',
      input.masteredOutcomeCount,
      5,
    ),
    define(
      'first-course',
      'İlk ders',
      'Bir dersin tüm içeriklerini tamamla.',
      'graduation-cap',
      input.completedCourseCount,
      1,
    ),
  ];
}
