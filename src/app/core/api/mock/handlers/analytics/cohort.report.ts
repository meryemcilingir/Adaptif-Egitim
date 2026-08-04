import {
  CohortAnalytics,
  OutcomeAnalytics,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import {
  bucketize,
  gradeDistribution,
  mean,
  percentOf,
  round1,
  standardDeviation,
  summarize,
} from '../../../../../features/adaptive-learning/domain/statistics';
import { ReportScope, buildMeta, dailySeries, performerRows } from './report-context';
import { groupMastery } from './overview.report';
import { outcomeStatusOf } from './student.report';

/**
 * Grup (cohort) analitiği (§3).
 *
 * Ortalamanın yanında MEDYAN ve STANDART SAPMA da verilir: bir grubun
 * ortalaması 65 olabilir ama sapma 25 ise "orta seviye bir grup" değil, ikiye
 * ayrılmış bir gruptur ve müdahale bambaşkadır.
 */
export function buildCohortAnalytics(
  scope: ReportScope,
  cohortId: string,
): CohortAnalytics | null {
  if (!scope.cohortIds.has(cohortId)) return null;

  const cohort = scope.db.collection('cohorts').findById(cohortId);
  if (!cohort) return null;

  const memberIds = new Set(cohort.studentIds.filter((id) => scope.studentIds.has(id)));
  const attempts = scope.attempts.filter((attempt) => memberIds.has(attempt.studentId));
  const progress = scope.progress.filter((item) => memberIds.has(item.studentId));
  const mastery = scope.mastery.filter((score) => memberIds.has(score.studentId));

  const scores = attempts.map((attempt) => attempt.scorePercent);
  const stats = summarize(scores);

  const completed = progress.filter((item) => item.state === 'completed').length;
  const passed = attempts.filter((attempt) => attempt.passed).length;

  const board = performerRows(
    { ...scope, studentIds: memberIds, attempts, progress, mastery },
    10,
  );

  return {
    meta: buildMeta(scope, attempts.length),
    cohortId,
    cohortName: cohort.name,
    studentCount: memberIds.size,
    averageScore: stats.mean,
    highestScore: stats.max,
    lowestScore: stats.min,
    medianScore: stats.median,
    standardDeviation: stats.standardDeviation,
    completionRate: percentOf(completed, progress.length),
    passRate: percentOf(passed, attempts.length),
    failRate: percentOf(attempts.length - passed, attempts.length),
    attendancePercent: syntheticAttendance(progress.length, attempts.length, memberIds.size),
    scoreDistribution: bucketize(scores),
    gradeDistribution: gradeDistribution(scores),
    masteryDistribution: bucketize(mastery.map((score) => score.score)),
    weeklyTrend: weeklyScoreTrend(scope, attempts),
    students: [...board.topPerformers, ...board.atRisk],
  };
}

/**
 * Haftalık puan eğilimi.
 *
 * Günlük seri bir grup için çok gürültülüdür (bazı günler hiç sınav yok);
 * haftalık toplama eğilimi görünür kılar.
 */
function weeklyScoreTrend(scope: ReportScope, attempts: readonly { submittedAt: string; scorePercent: number }[]) {
  const daily = dailySeries(scope, (dayStart, dayEnd) => {
    const inDay = attempts.filter((attempt) => {
      const at = Date.parse(attempt.submittedAt);
      return at > dayStart && at <= dayEnd;
    });

    return {
      value: inDay.length === 0 ? 0 : Math.round(mean(inDay.map((a) => a.scorePercent))),
      sampleSize: inDay.length,
    };
  });

  const weeks = [];
  for (let index = 0; index < daily.length; index += 7) {
    const chunk = daily.slice(index, index + 7).filter((point) => point.sampleSize > 0);
    if (chunk.length === 0) continue;

    weeks.push({
      date: daily[Math.min(index + 6, daily.length - 1)].date,
      value: Math.round(mean(chunk.map((point) => point.value))),
      sampleSize: chunk.reduce((sum, point) => sum + point.sampleSize, 0),
    });
  }

  return weeks;
}

/**
 * Katılım göstergesi (örnek veri).
 *
 * Sistemde yoklama kaydı YOKTUR. Öğrenci başına düşen etkinlikten türetilen
 * bir göstergedir ve ekranlarda "örnek" olarak işaretlenir.
 */
function syntheticAttendance(
  progressCount: number,
  attemptCount: number,
  studentCount: number,
): number {
  if (studentCount === 0) return 0;

  const perStudent = (progressCount + attemptCount * 3) / studentCount;
  return Math.round(Math.min(100, 45 + perStudent * 2));
}

/* ── Kazanım analitiği (§4) ──────────────────────────────────────────────── */

/**
 * Her kazanım için başarı analizi.
 *
 * "Kapsama" (coverage), kazanıma bağlı soruların yayınlanmış sınavlarda ne
 * kadar yer bulduğudur — bir kazanım tanımlı olabilir ama hiç ölçülmüyorsa
 * müfredat ile ölçme arasında bir kopukluk var demektir.
 */
export function buildOutcomeAnalytics(scope: ReportScope): OutcomeAnalytics[] {
  const { db } = scope;

  const outcomes = db
    .collection('outcomes')
    .filter((outcome) => scope.courseIds.has(outcome.courseId));

  const questions = db
    .collection('questions')
    .filter((question) => scope.courseIds.has(question.courseId) && question.deletedAt === null);

  const exams = db.collection('exams').filter((exam) => scope.courseIds.has(exam.courseId));
  const courses = db.collection('courses');

  const examQuestionIds = new Set(
    exams.flatMap((exam) => exam.questions.map((ref) => ref.questionId)),
  );

  const masteryByOutcome = new Map(
    groupMastery(scope).map((item) => [item.outcomeId, item]),
  );

  const recommendations = db
    .collection('recommendations')
    .filter((item) => scope.studentIds.has(item.studentId));

  const analyses = db
    .collection('itemAnalyses')
    .filter((analysis) => scope.courseIds.has(analysis.courseId));

  return outcomes
    .map<OutcomeAnalytics>((outcome) => {
      const outcomeQuestions = questions.filter((question) =>
        question.outcomeIds.includes(outcome.id),
      );

      const usedInExams = outcomeQuestions.filter((question) =>
        examQuestionIds.has(question.id),
      );

      const outcomeAnalyses = analyses.filter((analysis) => analysis.outcomeId === outcome.id);
      const mastery = masteryByOutcome.get(outcome.id);
      const course = courses.findById(outcome.courseId);

      /*
       * Kazanımın sınav başarısı, o kazanıma bağlı maddelerin doğru cevaplanma
       * oranıdır (`difficultyIndex`). Deneme puanlarının ortalaması kullanılamaz:
       * bir sınav birçok kazanımı ölçer ve toplam puan tek bir kazanıma
       * atfedilemez.
       */
      const examAverage =
        outcomeAnalyses.length === 0
          ? 0
          : Math.round(mean(outcomeAnalyses.map((analysis) => analysis.difficultyIndex * 100)));

      const masteryPercent = mastery ? round1(mastery.mastery) : 0;

      return {
        id: outcome.id,
        outcomeId: outcome.id,
        outcomeCode: outcome.code,
        outcomeTitle: outcome.title,
        courseCode: course?.code ?? '',
        coveragePercent: percentOf(usedInExams.length, outcomeQuestions.length),
        masteryPercent,
        examAveragePercent: examAverage,
        relatedCourseCount: 1,
        questionCount: outcomeQuestions.length,
        recommendationCount: recommendations.filter((item) => item.outcomeId === outcome.id)
          .length,
        status: outcomeStatusOf(masteryPercent),
      };
    })
    .sort((a, b) => a.masteryPercent - b.masteryPercent);
}

/** Kazanım × ders ustalık matrisi (§7). */
export function buildMasteryMatrix(scope: ReportScope) {
  const { db } = scope;

  const courses = db
    .collection('courses')
    .filter((course) => scope.courseIds.has(course.id))
    .sort((a, b) => a.code.localeCompare(b.code, 'tr-TR'));

  const outcomes = db
    .collection('outcomes')
    .filter((outcome) => scope.courseIds.has(outcome.courseId));

  const cells = [];

  for (const outcome of outcomes) {
    for (const course of courses) {
      /*
       * Kazanım yalnızca kendi dersinde anlamlıdır; diğer sütunlar BOŞ bırakılır
       * (`null`). Sıfır yazmak "bu derste hiç başarılamadı" demek olurdu ve
       * matrisi baştan sona kırmızıya boyardı.
       */
      const scores =
        outcome.courseId === course.id
          ? scope.mastery.filter((score) => score.outcomeId === outcome.id)
          : [];

      cells.push({
        rowId: outcome.id,
        rowLabel: outcome.code,
        columnLabel: course.code,
        value: scores.length === 0 ? null : Math.round(mean(scores.map((s) => s.score))),
        sampleSize: scores.length,
      });
    }
  }

  return {
    columns: courses.map((course) => course.code),
    rows: outcomes.map((outcome) => ({
      id: outcome.id,
      label: outcome.code,
      title: outcome.title,
    })),
    cells,
  };
}

/** Grup dağılımının ne kadar dengesiz olduğunu anlatan yardımcı. */
export function spreadOf(values: readonly number[]): number {
  return round1(standardDeviation(values));
}
