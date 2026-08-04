import {
  AchievementRow,
  CategoryValue,
  CourseProgressRow,
  OutcomeProgressRow,
  OutcomeStatus,
  RankedEntry,
  RecommendationHistoryRow,
  StudentAnalytics,
  TimeSeriesPoint,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import { calculateStreak } from '../../../../../features/adaptive-learning/domain/engagement';
import { mean, percentOf } from '../../../../../features/adaptive-learning/domain/statistics';
import { ReportScope, buildMeta, dailySeries } from './report-context';
import {
  RECOMMENDATION_OUTCOME_LABELS,
  outcomeOf,
  progressIndex,
} from './recommendation.report';

/**
 * Öğrenci analitiği (§2).
 *
 * Tek çağrıda 14 metrik döner; ekran başka istek atmaz. Öğrencinin kendi
 * gelişimini görmesi için tasarlandığı gibi, eğitmenin bir öğrenciyi
 * incelemesi için de aynı rapor kullanılır — kapsam denetimi `ReportScope`
 * içinde yapıldığı için ikinci bir yol gerekmez.
 */

/** Kazanım durumu eşikleri — kazanım analitiğiyle AYNI tablodan okunur. */
export const OUTCOME_STATUS_THRESHOLDS = { strong: 75, average: 50 } as const;

export function outcomeStatusOf(masteryPercent: number): OutcomeStatus {
  if (masteryPercent >= OUTCOME_STATUS_THRESHOLDS.strong) return 'strong';
  if (masteryPercent >= OUTCOME_STATUS_THRESHOLDS.average) return 'average';
  return 'needs_improvement';
}

export function buildStudentAnalytics(
  scope: ReportScope,
  studentId: string,
): StudentAnalytics | null {
  if (!scope.studentIds.has(studentId)) return null;

  const { db } = scope;
  const student = db.collection('users').findById(studentId);
  if (!student) return null;

  const cohort = db
    .collection('cohorts')
    .filter((item) => item.studentIds.includes(studentId))
    .at(0);

  const attempts = scope.attempts.filter((attempt) => attempt.studentId === studentId);
  const progress = scope.progress.filter((item) => item.studentId === studentId);
  const mastery = scope.mastery.filter((score) => score.studentId === studentId);

  const contents = db.collection('contents');
  const courses = db.collection('courses');

  /* ── Ders bazında ilerleme ────────────────────────────────────────────── */

  const courseRows: CourseProgressRow[] = [...scope.courseIds]
    .map((courseId) => {
      const course = courses.findById(courseId);
      if (!course) return null;

      const courseContentIds = new Set(
        contents.filter((content) => content.courseId === courseId).map((content) => content.id),
      );

      const courseProgress = progress.filter((item) => courseContentIds.has(item.contentId));
      const completed = courseProgress.filter((item) => item.state === 'completed').length;
      const courseMastery = mastery.filter((score) => score.courseId === courseId);

      return {
        courseId,
        courseCode: course.code,
        courseName: course.name,
        completedCount: completed,
        totalCount: courseContentIds.size,
        completionRate: percentOf(completed, courseContentIds.size),
        masteryPercent:
          courseMastery.length === 0
            ? 0
            : Math.round(mean(courseMastery.map((score) => score.score))),
        minutesSpent: courseProgress.reduce((sum, item) => sum + item.spentMinutes, 0),
      };
    })
    .filter((row): row is CourseProgressRow => row !== null)
    // Hiç dokunulmamış dersler listeyi şişirir; öğrenci kendi ilerlemesini arar.
    .filter((row) => row.totalCount > 0)
    .sort((a, b) => b.completionRate - a.completionRate);

  /* ── Kazanım bazında ilerleme ─────────────────────────────────────────── */

  const outcomeRows: OutcomeProgressRow[] = mastery
    .map((score) => {
      const course = courses.findById(score.courseId);

      return {
        outcomeId: score.outcomeId,
        outcomeCode: score.outcomeCode,
        outcomeTitle: score.outcomeTitle,
        courseCode: course?.code ?? '',
        masteryPercent: Math.round(score.score),
        attemptCount: score.inputs.recentAnswerCount,
        status: outcomeStatusOf(score.score),
      };
    })
    .sort((a, b) => a.masteryPercent - b.masteryPercent);

  const toRanked = (rows: readonly OutcomeProgressRow[], tone: RankedEntry['tone']) =>
    rows.map<RankedEntry>((row) => ({
      id: row.outcomeId,
      label: row.outcomeCode,
      sublabel: row.outcomeTitle,
      value: row.masteryPercent,
      unit: '%',
      ratio: row.masteryPercent,
      tone,
    }));

  /* ── Sınav ve quiz ortalamaları ───────────────────────────────────────── */

  const quizScores = progress
    .map((item) => item.scorePercent)
    .filter((score): score is number => score !== null);

  /*
   * Ortalamalar veri yoksa 0 DEĞİL null döner: "%0 ortalama" ile "henüz sınava
   * girmedi" farklı şeylerdir ve ekran ikisini farklı gösterir.
   */
  const examAverage =
    attempts.length === 0 ? null : Math.round(mean(attempts.map((a) => a.scorePercent)));
  const quizAverage = quizScores.length === 0 ? null : Math.round(mean(quizScores));

  /* ── Çalışma süresi serileri ──────────────────────────────────────────── */

  const dailyStudy = dailySeries(scope, (dayStart, dayEnd) => {
    const inDay = progress.filter((item) => {
      if (!item.lastAccessedAt) return false;
      const at = Date.parse(item.lastAccessedAt);
      return at > dayStart && at <= dayEnd;
    });

    return {
      value: inDay.reduce((sum, item) => sum + item.spentMinutes, 0),
      sampleSize: inDay.length,
    };
  });

  const completedProgress = progress.filter((item) => item.state === 'completed');

  return {
    meta: buildMeta(scope, progress.length + attempts.length),
    studentId,
    studentName: student.fullName,
    cohortName: cohort?.name ?? '',
    masteryPercent: mastery.length === 0 ? 0 : Math.round(mean(mastery.map((s) => s.score))),
    completionRate: percentOf(completedProgress.length, progress.length),
    quizAveragePercent: quizAverage,
    examAveragePercent: examAverage,
    streakDays: calculateStreak(
      progress
        .map((item) => item.lastAccessedAt)
        .filter((date): date is string => date !== null),
      scope.now,
    ).currentStreak,
    totalStudyMinutes: progress.reduce((sum, item) => sum + item.spentMinutes, 0),
    weeklyStudyMinutes: toWeekly(dailyStudy),
    dailyStudyMinutes: dailyStudy,
    courseProgress: courseRows,
    outcomeProgress: outcomeRows,
    weakestOutcomes: toRanked(outcomeRows.slice(0, 5), 'danger'),
    strongestOutcomes: toRanked([...outcomeRows].reverse().slice(0, 5), 'success'),
    timePerCourse: courseRows
      .filter((row) => row.minutesSpent > 0)
      .map<CategoryValue>((row) => ({ label: row.courseCode, value: row.minutesSpent })),
    recommendationHistory: recommendationHistory(scope, studentId),
    achievements: achievements(scope, studentId, completedProgress.length, attempts.length),
  };
}

/**
 * Günlük seriyi haftalık toplamlara indirger.
 *
 * 90 günlük pencerede günlük çubuklar okunamaz hâle gelir; haftalık toplam
 * eğilimi bozmadan grafiği okunur kılar.
 */
function toWeekly(daily: readonly TimeSeriesPoint[]): TimeSeriesPoint[] {
  const weeks: TimeSeriesPoint[] = [];

  for (let index = 0; index < daily.length; index += 7) {
    const chunk = daily.slice(index, index + 7);
    if (chunk.length === 0) continue;

    weeks.push({
      date: chunk[chunk.length - 1].date,
      value: chunk.reduce((sum, point) => sum + point.value, 0),
      sampleSize: chunk.reduce((sum, point) => sum + point.sampleSize, 0),
    });
  }

  return weeks;
}

function recommendationHistory(
  scope: ReportScope,
  studentId: string,
): RecommendationHistoryRow[] {
  const index = progressIndex(scope);

  return scope.db
    .collection('recommendations')
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, 10)
    .map((recommendation) => {
      const state = outcomeOf(recommendation, index);

      return {
        id: recommendation.id,
        contentTitle: recommendation.targetTitle,
        outcomeCode: recommendation.outcomeCode,
        createdAt: recommendation.generatedAt,
        state,
        stateLabel: RECOMMENDATION_OUTCOME_LABELS[state],
      };
    });
}

/**
 * Başarım zaman çizelgesi.
 *
 * Başarımlar SAKLANMAZ, gerçek ilerlemeden türetilir (Sprint 4, ADR-033 ile
 * aynı ilke). Kazanılma anı, eşiği geçtiği ilk kaydın tarihidir; uydurulmuş
 * bir tarih verilmez.
 */
function achievements(
  scope: ReportScope,
  studentId: string,
  completedCount: number,
  attemptCount: number,
): AchievementRow[] {
  const progress = scope.progress
    .filter((item) => item.studentId === studentId && item.completedAt !== null)
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));

  const rows: AchievementRow[] = [];

  const milestones: readonly { count: number; title: string; description: string }[] = [
    { count: 1, title: 'İlk adım', description: 'İlk içeriği tamamladınız.' },
    { count: 10, title: 'İstikrarlı', description: '10 içerik tamamlandı.' },
    { count: 25, title: 'Kararlı', description: '25 içerik tamamlandı.' },
    { count: 50, title: 'Usta', description: '50 içerik tamamlandı.' },
  ];

  for (const milestone of milestones) {
    if (completedCount < milestone.count) continue;
    const earnedAt = progress[milestone.count - 1]?.completedAt;
    if (!earnedAt) continue;

    rows.push({
      id: `content-${milestone.count}`,
      title: milestone.title,
      description: milestone.description,
      icon: 'award',
      earnedAt,
    });
  }

  const attempts = scope.attempts
    .filter((attempt) => attempt.studentId === studentId)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  if (attemptCount > 0 && attempts[0]) {
    rows.push({
      id: 'first-exam',
      title: 'İlk sınav',
      description: 'İlk sınavınızı tamamladınız.',
      icon: 'file-check',
      earnedAt: attempts[0].submittedAt,
    });
  }

  const firstPass = attempts.find((attempt) => attempt.passed);
  if (firstPass) {
    rows.push({
      id: 'first-pass',
      title: 'Başarılı sonuç',
      description: 'Bir sınavı geçme puanının üzerinde tamamladınız.',
      icon: 'circle-check-big',
      earnedAt: firstPass.submittedAt,
    });
  }

  return rows.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}
