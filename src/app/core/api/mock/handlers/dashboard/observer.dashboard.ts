import {
  CategoryValue,
  RankedEntry,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import {
  ObserverDashboard,
  QuickAction,
  StatisticEntry,
} from '../../../../../features/adaptive-learning/models/dashboard.model';
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
import { MIN_COHORT_SIZE } from './program-manager.dashboard';

/**
 * Gözlemci paneli: yalnızca yetkili cohort'lar için SALT OKUNUR özet.
 *
 * Gizlilik kuralı burada özellikle görünür kılınır: eşiğin altındaki gruplar
 * hem gizlenir hem de "hangi gruplar gizlendi" bilgisi açıkça raporlanır (BR-17).
 */
export function buildObserverDashboard(scope: DashboardScope): ObserverDashboard {
  const { db, caller } = scope;

  const visibleCohorts = scope.cohorts.filter(
    (cohort) => cohort.studentIds.length >= MIN_COHORT_SIZE,
  );
  const suppressed = scope.cohorts.filter((cohort) => cohort.studentIds.length < MIN_COHORT_SIZE);

  const visibleStudentIds = new Set(visibleCohorts.flatMap((cohort) => cohort.studentIds));
  const visibleAttempts = scope.attempts.filter((attempt) =>
    visibleStudentIds.has(attempt.studentId),
  );
  const visibleMastery = scope.mastery.filter((score) => visibleStudentIds.has(score.studentId));

  const completed = scope.progress.filter((item) => item.state === 'completed').length;

  return {
    role: 'OBSERVER',
    generatedAt: scope.nowIso,
    headline: 'İzleme özeti',
    subline: `${visibleCohorts.length} cohort görüntüleniyor · salt okunur`,

    kpis: [
      kpi({
        key: 'cohort-count',
        label: 'İzlenen cohort',
        value: visibleCohorts.length,
        icon: 'users',
        caption: `${suppressed.length} grup gizlilik eşiği altında`,
        series: visibleCohorts.map((cohort) => cohort.studentIds.length),
      }),
      kpi({
        key: 'observed-mastery',
        label: 'Ortalama ustalık',
        value: average(visibleMastery.map((score) => score.score)),
        unit: '%',
        icon: 'target',
        caption: `${visibleMastery.length} kazanım ölçümü`,
        series: visibleMastery.map((score) => score.score),
      }),
      kpi({
        key: 'observed-score',
        label: 'Sınav başarı ortalaması',
        value: average(visibleAttempts.map((attempt) => attempt.scorePercent)),
        unit: '%',
        icon: 'trending-up',
        caption: `${visibleAttempts.length} deneme`,
        series: visibleAttempts.map((attempt) => attempt.scorePercent),
      }),
      kpi({
        key: 'completion',
        label: 'İçerik tamamlama',
        value: percent(completed, Math.max(1, scope.progress.length)),
        unit: '%',
        icon: 'circle-check-big',
        caption: `${completed} içerik tamamlandı`,
        series: scope.progress.map((item) => item.completionPercent),
      }),
    ],

    quickActions: buildQuickActions(),
    notifications: buildNotifications(db, caller.userId),
    recentActivity: buildRecentActivity(db, () => true, 6),
    statistics: buildStatistics(scope, visibleAttempts, suppressed.length),

    cohortComparison: buildCohortComparison(visibleCohorts, visibleMastery),
    completionTrend: buildScoreTrend(visibleAttempts, 10),
    outcomeCoverage: buildOutcomeCoverage(visibleMastery),
    upcomingExams: buildUpcomingExams(scope, 4),
    suppressedCohorts: suppressed.map((cohort) => cohort.name),
    minCohortSize: MIN_COHORT_SIZE,
  };
}

function buildQuickActions(): QuickAction[] {
  return [
    {
      id: 'cohort-analytics',
      label: 'Cohort raporları',
      description: 'Gruplar arası karşılaştırma',
      icon: 'users',
      link: '/cohort-analytics',
      badge: null,
      tone: 'primary',
    },
    {
      id: 'courses',
      label: 'Dersler',
      description: 'İzlenen ders listesi',
      icon: 'library',
      link: '/courses',
      badge: null,
      tone: 'info',
    },
    {
      id: 'exams',
      label: 'Sınav takvimi',
      description: 'Yaklaşan sınavlar',
      icon: 'calendar',
      link: '/exams',
      badge: null,
      tone: 'neutral',
    },
  ];
}

function buildCohortComparison(
  cohorts: readonly { name: string; studentIds: readonly string[] }[],
  mastery: readonly { studentId: string; score: number }[],
): CategoryValue[] {
  return cohorts.map((cohort) => ({
    label: cohort.name,
    value: average(
      mastery.filter((score) => cohort.studentIds.includes(score.studentId)).map((s) => s.score),
    ),
  }));
}

function buildOutcomeCoverage(
  mastery: readonly {
    outcomeId: string;
    outcomeCode: string;
    outcomeTitle: string;
    score: number;
  }[],
): RankedEntry[] {
  const grouped = new Map<string, { code: string; title: string; scores: number[] }>();

  for (const score of mastery) {
    const entry = grouped.get(score.outcomeId) ?? {
      code: score.outcomeCode,
      title: score.outcomeTitle,
      scores: [],
    };
    entry.scores.push(score.score);
    grouped.set(score.outcomeId, entry);
  }

  return [...grouped.entries()]
    .map(([outcomeId, entry]) => {
      const value = average(entry.scores);
      return {
        id: outcomeId,
        label: entry.code,
        sublabel: entry.title,
        value,
        unit: '%',
        ratio: value,
        tone: value < 35 ? 'danger' : value < 60 ? 'warning' : value < 80 ? 'info' : 'success',
      } satisfies RankedEntry;
    })
    .sort((a, b) => a.value - b.value)
    .slice(0, 6);
}

function buildStatistics(
  scope: DashboardScope,
  attempts: readonly { passed: boolean }[],
  suppressedCount: number,
): StatisticEntry[] {
  const passed = attempts.filter((attempt) => attempt.passed).length;

  return [
    {
      label: 'Geçme oranı',
      value: `%${percent(passed, attempts.length)}`,
      hint: `${attempts.length} deneme üzerinden`,
    },
    {
      label: 'Gizlenen grup',
      value: String(suppressedCount),
      hint: `Öğrenci sayısı ${MIN_COHORT_SIZE} altında olanlar`,
    },
    {
      label: 'İzlenen ders',
      value: String(scope.courses.length),
      hint: 'Yetkili olduğunuz kapsam',
    },
    {
      label: 'Erişim türü',
      value: 'Salt okunur',
      hint: 'Değişiklik yapma yetkiniz yok',
    },
  ];
}
