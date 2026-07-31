import { Role } from '../../../auth/permission.model';
import { DashboardSnapshot } from '../../../../features/adaptive-learning/models/dashboard.model';
import { ItemAnalysis } from '../../../../features/adaptive-learning/models/item-analysis.model';
import {
  CohortComparison,
  CohortMetric,
} from '../../../../features/adaptive-learning/models/item-analysis.model';
import { equals, inList } from '../db/query-engine';
import { FakeDb } from '../db/fake-db';
import { isWithinScope, requirePermission } from '../mock-auth';
import { MockCaller, MockHandler, ok } from '../mock-router';
import { buildAdminDashboard } from './dashboard/admin.dashboard';
import { DashboardScope, average, buildScope } from './dashboard/dashboard-context';
import { buildInstructorDashboard } from './dashboard/instructor.dashboard';
import { buildMeasurementDashboard } from './dashboard/measurement.dashboard';
import { buildObserverDashboard } from './dashboard/observer.dashboard';
import {
  MIN_COHORT_SIZE,
  buildProgramManagerDashboard,
} from './dashboard/program-manager.dashboard';
import { buildStudentDashboard } from './dashboard/student.dashboard';

export { MIN_COHORT_SIZE };

/**
 * Rol → dashboard üreticisi kaydı.
 *
 * Open/Closed: yeni bir rol eklemek = yeni bir builder dosyası yazıp buraya
 * satır eklemek. Handler kodu değişmez, `switch` zinciri büyümez (ADR-005).
 */
const DASHBOARD_BUILDERS: Readonly<Record<Role, (scope: DashboardScope) => DashboardSnapshot>> = {
  STUDENT: buildStudentDashboard,
  INSTRUCTOR: buildInstructorDashboard,
  ASSESSMENT_SPECIALIST: buildMeasurementDashboard,
  PROGRAM_MANAGER: buildProgramManagerDashboard,
  OBSERVER: buildObserverDashboard,
  PLATFORM_ADMIN: buildAdminDashboard,
};

export const ANALYTICS_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/analytics/dashboard',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:student');
      const scope = buildScope(context.db, caller, context.now);
      return ok(DASHBOARD_BUILDERS[caller.role](scope));
    },
  },

  {
    method: 'GET',
    path: '/api/analytics/mastery',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:student');
      const studentId = context.query.get('studentId') ?? caller.userId;

      if (!isWithinScope(caller, { ownerId: studentId })) return ok([]);

      return ok(
        context.db
          .collection('masteryScores')
          .filter((score) => score.studentId === studentId)
          .sort((a, b) => a.outcomeCode.localeCompare(b.outcomeCode, 'tr-TR')),
      );
    },
  },

  {
    method: 'GET',
    path: '/api/analytics/cohort',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:cohort');
      return ok(buildCohortComparison(context.db, caller));
    },
  },

  {
    method: 'GET',
    path: '/api/analytics/item-analysis',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:item');

      return ok(
        context.db
          .collection('itemAnalyses')
          .queryWithin(
            (analysis) => isWithinScope(caller, { courseId: analysis.courseId }),
            context.page,
            {
              searchable: (analysis: ItemAnalysis) => [
                analysis.questionCode,
                analysis.questionStem,
              ],
              filters: {
                courseId: equals<ItemAnalysis>((analysis) => analysis.courseId),
                outcomeId: equals<ItemAnalysis>((analysis) => analysis.outcomeId),
                type: inList<ItemAnalysis>((analysis) => analysis.questionType),
                flags: (analysis, value) =>
                  Array.isArray(value)
                    ? value.some((flag) => analysis.flags.includes(flag as never))
                    : analysis.flags.includes(String(value) as never),
              },
              defaultSort: { field: 'discrimination', direction: 'asc' },
            },
          ),
      );
    },
  },

  {
    method: 'GET',
    path: '/api/analytics/recommendations',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:student');
      const studentId = context.query.get('studentId') ?? caller.userId;

      if (!isWithinScope(caller, { ownerId: studentId })) return ok([]);

      return ok(
        context.db
          .collection('recommendations')
          .filter((recommendation) => recommendation.studentId === studentId)
          .sort((a, b) => b.priority - a.priority),
      );
    },
  },
];

/**
 * Cohort karşılaştırması.
 *
 * BR-17: Öğrenci sayısı `MIN_COHORT_SIZE` altındaki cohort'larda bireysel
 * karşılaştırma verisi GÖNDERİLMEZ. Gizleme sunucu tarafında yapılır —
 * yalnızca arayüzde saklamak yeterli olmazdı.
 */
function buildCohortComparison(db: FakeDb, caller: MockCaller): CohortComparison {
  const attempts = db.collection('attempts').all();
  const mastery = db.collection('masteryScores').all();

  const cohorts = db
    .collection('cohorts')
    .filter(
      (cohort) => isWithinScope(caller, { cohortId: cohort.id }) || caller.role !== 'OBSERVER',
    );

  const metrics: CohortMetric[] = cohorts.map((cohort) => {
    const suppressed = cohort.studentIds.length < MIN_COHORT_SIZE;
    const cohortAttempts = attempts.filter((attempt) => attempt.cohortId === cohort.id);
    const cohortMastery = mastery.filter((score) => cohort.studentIds.includes(score.studentId));

    return {
      cohortId: cohort.id,
      cohortName: cohort.name,
      studentCount: cohort.studentIds.length,
      averageMastery: suppressed ? 0 : average(cohortMastery.map((score) => score.score)),
      averageScore: suppressed ? 0 : average(cohortAttempts.map((attempt) => attempt.scorePercent)),
      completionPercent: suppressed
        ? 0
        : average(cohortMastery.map((score) => score.confidence * 100)),
      atRiskCount: suppressed ? 0 : countAtRisk(cohortMastery),
      privacySuppressed: suppressed,
    };
  });

  const outcomeIds = [...new Set(mastery.map((score) => score.outcomeId))].slice(0, 10);
  const outcomeMeta = new Map(mastery.map((score) => [score.outcomeId, score] as const));

  return {
    metrics,
    outcomeBreakdown: outcomeIds.map((outcomeId) => {
      const scores: Record<string, number | null> = {};

      for (const metric of metrics) {
        const cohort = cohorts.find((item) => item.id === metric.cohortId);
        scores[metric.cohortId] = metric.privacySuppressed
          ? null
          : average(
              mastery
                .filter(
                  (score) =>
                    score.outcomeId === outcomeId && cohort?.studentIds.includes(score.studentId),
                )
                .map((score) => score.score),
            );
      }

      return { outcomeId, outcomeCode: outcomeMeta.get(outcomeId)?.outcomeCode ?? '', scores };
    }),
    minCohortSize: MIN_COHORT_SIZE,
  };
}

function countAtRisk(mastery: readonly { studentId: string; score: number }[]): number {
  const byStudent = new Map<string, number[]>();
  for (const score of mastery) {
    byStudent.set(score.studentId, [...(byStudent.get(score.studentId) ?? []), score.score]);
  }
  return [...byStudent.values()].filter((scores) => average(scores) < 45).length;
}
