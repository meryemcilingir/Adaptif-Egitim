import {
  CategoryValue,
  DistributionBucket,
  MatrixData,
  NamedSeries,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import {
  DIFFICULTY_LABELS,
  PUBLISH_STATE_LABELS,
  PublishState,
} from '../../../../../features/adaptive-learning/models/common.model';
import {
  CatalogTotals,
  ProgramCourseHealth,
  ProgramManagerDashboard,
  ProgressCard,
  QuickAction,
  StatisticEntry,
} from '../../../../../features/adaptive-learning/models/dashboard.model';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import {
  DashboardScope,
  average,
  buildNotifications,
  buildRecentActivity,
  buildScoreTrend,
  buildUpcomingExams,
  kpi,
  percent,
} from './dashboard-context';

/** Gizlilik eşiği (BR-17) — bu sayının altındaki cohort'lar karşılaştırmada gizlenir. */
export const MIN_COHORT_SIZE = 5;
const AT_RISK_THRESHOLD = 45;

/**
 * Program yöneticisi paneli: ders sağlığı, cohort karşılaştırması ve yayın hattı.
 */
export function buildProgramManagerDashboard(scope: DashboardScope): ProgramManagerDashboard {
  const { db, caller } = scope;

  const courseHealth = buildCourseHealth(scope);
  const publishedCourses = scope.courses.filter((course) => course.state === 'PUBLISHED');
  const atRiskCount = courseHealth.reduce((sum, course) => sum + course.atRiskCount, 0);
  const totals = buildTotals(scope);

  return {
    role: 'PROGRAM_MANAGER',
    generatedAt: scope.nowIso,
    headline: 'Program sağlığı',
    subline: `${totals.programs} program · ${totals.courses} ders · ${totals.outcomes} kazanım`,

    kpis: [
      kpi({
        key: 'total-programs',
        label: 'Toplam program',
        value: totals.programs,
        icon: 'graduation-cap',
        caption: `${totals.published} kayıt yayında`,
        series: buildProgramDistribution(scope).map((entry) => entry.value),
      }),
      kpi({
        key: 'total-courses',
        label: 'Toplam ders',
        value: totals.courses,
        icon: 'library',
        caption: `${publishedCourses.length} ders yayında`,
        series: courseHealth.map((course) => course.averageMastery),
      }),
      kpi({
        key: 'total-outcomes',
        label: 'Toplam kazanım',
        value: totals.outcomes,
        icon: 'target',
        caption: `${totals.draft} kayıt taslak durumda`,
        series: courseHealth.map((course) => course.outcomeCount),
      }),
      kpi({
        key: 'at-risk',
        label: 'Risk altındaki öğrenci',
        value: atRiskCount,
        icon: 'triangle-alert',
        caption: `Ustalık < ${AT_RISK_THRESHOLD}`,
        series: courseHealth.map((course) => course.atRiskCount),
        higherIsBetter: false,
      }),
    ],

    quickActions: buildQuickActions(scope),
    notifications: buildNotifications(db, caller.userId),
    recentActivity: buildRecentActivity(db, () => true),
    statistics: buildStatistics(scope, atRiskCount, totals),

    progress: buildProgress(scope, publishedCourses.length),
    totals,
    courseHealth,
    programDistribution: buildProgramDistribution(scope),
    publishPipeline: buildPublishPipeline(scope),
    outcomeStatistics: buildOutcomeStatistics(scope),
    cohortComparison: buildCohortComparison(scope),
    cohortMasteryMatrix: buildCohortMatrix(scope),
    programTrend: buildProgramTrend(scope),
    upcomingExams: buildUpcomingExams(scope, 6),
  };
}

/**
 * Katalog toplamları.
 * Taslak/yayında sayıları program + ders + kazanım kayıtlarının TAMAMI üzerinden
 * hesaplanır; kullanıcı "kaç kayıt yayına hazır değil?" sorusunu tek bakışta görür.
 */
function buildTotals(scope: DashboardScope): CatalogTotals {
  const programs = scope.db.collection('programs').all();
  const courseIds = new Set(scope.courses.map((course) => course.id));
  const outcomes = scope.db
    .collection('outcomes')
    .filter((outcome) => courseIds.has(outcome.courseId));

  const allStates = [
    ...programs.map((program) => program.state),
    ...scope.courses.map((course) => course.state),
    ...outcomes.map((outcome) => outcome.state),
  ];

  return {
    programs: programs.length,
    courses: scope.courses.length,
    outcomes: outcomes.length,
    draft: allStates.filter((state) => state === 'DRAFT').length,
    published: allStates.filter((state) => state === 'PUBLISHED').length,
  };
}

/** Program başına ders sayısı — katalog dengesizliklerini görünür kılar. */
function buildProgramDistribution(scope: DashboardScope): CategoryValue[] {
  return scope.db
    .collection('programs')
    .all()
    .map((program) => ({
      label: program.code,
      value: scope.courses.filter((course) => course.programId === program.id).length,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

/** Kazanımların zorluk dağılımı — ölçme dengesinin göstergesi. */
function buildOutcomeStatistics(scope: DashboardScope): DistributionBucket[] {
  const courseIds = new Set(scope.courses.map((course) => course.id));
  const outcomes = scope.db
    .collection('outcomes')
    .filter((outcome) => courseIds.has(outcome.courseId));
  const total = Math.max(1, outcomes.length);

  return (Object.keys(DIFFICULTY_LABELS) as (keyof typeof DIFFICULTY_LABELS)[]).map(
    (difficulty) => {
      const count = outcomes.filter((outcome) => outcome.difficulty === difficulty).length;
      return { label: DIFFICULTY_LABELS[difficulty], count, percent: percent(count, total) };
    },
  );
}

function buildQuickActions(scope: DashboardScope): QuickAction[] {
  const reviewCount = scope.courses.filter((course) => course.state === 'REVIEW').length;
  const draftPrograms = scope.db
    .collection('programs')
    .count((program) => program.state !== 'PUBLISHED');

  return [
    {
      id: 'programs',
      label: 'Programlar',
      description: 'Program oluştur ve yayınla',
      icon: 'graduation-cap',
      link: '/programs',
      badge: draftPrograms > 0 ? draftPrograms : null,
      tone: 'primary',
    },
    {
      id: 'course-review',
      label: 'Yayın onayı bekleyenler',
      description: 'İncelemedeki dersler',
      icon: 'book-open-check',
      link: '/courses',
      badge: reviewCount > 0 ? reviewCount : null,
      tone: reviewCount > 0 ? 'warning' : 'neutral',
    },
    {
      id: 'outcome-map',
      label: 'Kazanım haritası',
      description: 'Önkoşul grafiği ve döngü kontrolü',
      icon: 'workflow',
      link: '/outcomes/map',
      badge: null,
      tone: 'info',
    },
    {
      id: 'cohort-analytics',
      label: 'Cohort analitiği',
      description: 'Gruplar arası karşılaştırma',
      icon: 'users',
      link: '/cohort-analytics',
      badge: null,
      tone: 'neutral',
    },
  ];
}

function buildProgress(scope: DashboardScope, publishedCount: number): ProgressCard[] {
  const publishedOutcomes = scope.db
    .collection('outcomes')
    .filter(
      (outcome) =>
        scope.courses.some((course) => course.id === outcome.courseId) &&
        outcome.state === 'PUBLISHED',
    ).length;
  const totalOutcomes = scope.db
    .collection('outcomes')
    .filter((outcome) => scope.courses.some((course) => course.id === outcome.courseId)).length;

  const scheduledExams = scope.exams.filter(
    (exam) => examRuntimeStatus(exam, scope.now) === 'scheduled',
  ).length;

  return [
    {
      key: 'course-publish',
      label: 'Ders yayın oranı',
      value: publishedCount,
      max: Math.max(1, scope.courses.length),
      caption: `${scope.courses.length - publishedCount} ders hazırlık aşamasında`,
      tone:
        percent(publishedCount, Math.max(1, scope.courses.length)) >= 80 ? 'success' : 'warning',
    },
    {
      key: 'outcome-publish',
      label: 'Kazanım yayın oranı',
      value: publishedOutcomes,
      max: Math.max(1, totalOutcomes),
      caption: `${totalOutcomes - publishedOutcomes} kazanım taslak durumda`,
      tone: 'primary',
    },
    {
      key: 'exam-planning',
      label: 'Planlanmış sınavlar',
      value: scheduledExams,
      max: Math.max(1, scope.exams.length),
      caption: `${scope.exams.length} sınav tanımlı`,
      tone: 'success',
    },
  ];
}

function buildCourseHealth(scope: DashboardScope): ProgramCourseHealth[] {
  const outcomes = scope.db.collection('outcomes').all();

  return scope.courses
    .map((course) => {
      const courseOutcomes = outcomes.filter((outcome) => outcome.courseId === course.id);
      const courseMastery = scope.mastery.filter((score) => score.courseId === course.id);

      const byStudent = new Map<string, number[]>();
      for (const score of courseMastery) {
        byStudent.set(score.studentId, [...(byStudent.get(score.studentId) ?? []), score.score]);
      }

      return {
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        state: course.state,
        instructorName: course.instructorName,
        outcomeCount: courseOutcomes.length,
        publishedOutcomeCount: courseOutcomes.filter((outcome) => outcome.state === 'PUBLISHED')
          .length,
        averageMastery: average(courseMastery.map((score) => score.score)),
        atRiskCount: [...byStudent.values()].filter((scores) => average(scores) < AT_RISK_THRESHOLD)
          .length,
      };
    })
    .sort((a, b) => a.averageMastery - b.averageMastery);
}

/**
 * Cohort karşılaştırması.
 * Gizlilik eşiğinin altındaki gruplar 0 değerle ve ayrı biçimde raporlanır (BR-17).
 */
function buildCohortComparison(scope: DashboardScope): CategoryValue[] {
  return scope.cohorts.map((cohort) => {
    const suppressed = cohort.studentIds.length < MIN_COHORT_SIZE;
    const scores = scope.mastery
      .filter((score) => cohort.studentIds.includes(score.studentId))
      .map((score) => score.score);

    return {
      label: suppressed ? `${cohort.name} (gizli)` : cohort.name,
      value: suppressed ? 0 : average(scores),
    };
  });
}

function buildCohortMatrix(scope: DashboardScope): MatrixData {
  const cohorts = scope.cohorts.filter((cohort) => cohort.studentIds.length >= MIN_COHORT_SIZE);
  const outcomeIds = [...new Set(scope.mastery.map((score) => score.outcomeId))].slice(0, 10);
  const outcomeMeta = new Map(scope.mastery.map((score) => [score.outcomeId, score] as const));

  return {
    columns: cohorts.map((cohort) => cohort.name),
    rows: outcomeIds.map((outcomeId) => ({
      id: outcomeId,
      label: outcomeMeta.get(outcomeId)?.outcomeCode ?? '',
      title: outcomeMeta.get(outcomeId)?.outcomeTitle ?? '',
    })),
    cells: outcomeIds.flatMap((outcomeId) =>
      cohorts.map((cohort) => {
        const scores = scope.mastery
          .filter(
            (score) => score.outcomeId === outcomeId && cohort.studentIds.includes(score.studentId),
          )
          .map((score) => score.score);

        return {
          rowId: outcomeId,
          rowLabel: outcomeMeta.get(outcomeId)?.outcomeCode ?? '',
          columnLabel: cohort.name,
          value: scores.length > 0 ? average(scores) : null,
          sampleSize: scores.length,
        };
      }),
    ),
  };
}

function buildPublishPipeline(scope: DashboardScope): DistributionBucket[] {
  const total = Math.max(1, scope.courses.length);

  return (Object.keys(PUBLISH_STATE_LABELS) as PublishState[]).map((state) => {
    const count = scope.courses.filter((course) => course.state === state).length;
    return { label: PUBLISH_STATE_LABELS[state], count, percent: percent(count, total) };
  });
}

function buildProgramTrend(scope: DashboardScope): NamedSeries[] {
  return scope.cohorts
    .filter((cohort) => cohort.studentIds.length >= MIN_COHORT_SIZE)
    .slice(0, 4)
    .map((cohort) => ({
      name: cohort.name,
      points: buildScoreTrend(
        scope.attempts.filter((attempt) => cohort.studentIds.includes(attempt.studentId)),
        8,
      ),
    }));
}

function buildStatistics(
  scope: DashboardScope,
  atRiskCount: number,
  totals: CatalogTotals,
): StatisticEntry[] {
  const passed = scope.attempts.filter((attempt) => attempt.passed).length;
  const suppressed = scope.cohorts.filter(
    (cohort) => cohort.studentIds.length < MIN_COHORT_SIZE,
  ).length;

  return [
    {
      label: 'Yayında olan kayıt',
      value: String(totals.published),
      hint: 'Program + ders + kazanım toplamı',
    },
    {
      label: 'Taslak kayıt',
      value: String(totals.draft),
      hint: 'Henüz yayına alınmamış kayıtlar',
    },
    {
      label: 'Program geçme oranı',
      value: `%${percent(passed, scope.attempts.length)}`,
      hint: `${scope.attempts.length} deneme üzerinden`,
    },
    {
      label: 'Risk altındaki öğrenci',
      value: String(atRiskCount),
      hint: `Ustalık ortalaması < ${AT_RISK_THRESHOLD}`,
    },
    {
      label: 'Gizlilik eşiği altındaki cohort',
      value: String(suppressed),
      hint: `Karşılaştırmada gizlenir (min. ${MIN_COHORT_SIZE} öğrenci)`,
    },
  ];
}
