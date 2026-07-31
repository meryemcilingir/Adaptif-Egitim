import { Attempt } from '../../../../../features/adaptive-learning/models/attempt.model';
import { Cohort } from '../../../../../features/adaptive-learning/models/common.model';
import { ContentProgress } from '../../../../../features/adaptive-learning/models/content-item.model';
import { Course } from '../../../../../features/adaptive-learning/models/course.model';
import { Exam } from '../../../../../features/adaptive-learning/models/exam.model';
import {
  ActivityEntry,
  KpiCard,
  TrendDirection,
  UpcomingExamCard,
} from '../../../../../features/adaptive-learning/models/dashboard.model';
import { TimeSeriesPoint } from '../../../../../features/adaptive-learning/models/analytics.model';
import { MasteryScore } from '../../../../../features/adaptive-learning/models/mastery.model';
import { Notification } from '../../../../../features/adaptive-learning/models/notification.model';
import { AppIconName } from '../../../../../shared/icons/app-icons';
import { AuditAction } from '../../../../observability/audit.model';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import { FakeDb } from '../../db/fake-db';
import { MockCaller } from '../../mock-router';
import { isWithinScope } from '../../mock-auth';

/**
 * Rol dashboard'larının ortak zemini.
 *
 * Her rol kendi payload'ını üretir; ancak "hangi kayıtları görebilir" ve
 * "ortak bloklar nasıl hesaplanır" soruları TEK yerde cevaplanır. Böylece
 * yeni bir rol eklendiğinde kapsam mantığı yeniden yazılmaz (DRY + SRP).
 */
export interface DashboardScope {
  readonly db: FakeDb;
  readonly caller: MockCaller;
  readonly now: number;
  readonly nowIso: string;
  readonly courses: readonly Course[];
  readonly cohorts: readonly Cohort[];
  readonly attempts: readonly Attempt[];
  readonly mastery: readonly MasteryScore[];
  readonly progress: readonly ContentProgress[];
  readonly exams: readonly Exam[];
}

export function buildScope(db: FakeDb, caller: MockCaller, now: number): DashboardScope {
  const isStudent = caller.role === 'STUDENT';

  const courses = db
    .collection('courses')
    .filter(
      (course) =>
        isWithinScope(caller, { courseId: course.id, cohortIds: course.cohortIds }) ||
        caller.courseIds.includes(course.id),
    );

  const courseIds = new Set(courses.map((course) => course.id));

  return {
    db,
    caller,
    now,
    nowIso: new Date(now).toISOString(),
    courses,
    /*
     * Cohort kapsamı: öğrenci ve gözlemci YALNIZCA kendi/yetkili gruplarını görür.
     * Diğer roller program genelinde çalıştığı için tüm gruplara erişir.
     */
    cohorts: db
      .collection('cohorts')
      .filter((cohort) =>
        isStudent || caller.role === 'OBSERVER' ? caller.cohortIds.includes(cohort.id) : true,
      ),
    attempts: db
      .collection('attempts')
      .filter(
        (attempt) =>
          courseIds.has(attempt.courseId) && (!isStudent || attempt.studentId === caller.userId),
      ),
    mastery: db
      .collection('masteryScores')
      .filter(
        (score) =>
          courseIds.has(score.courseId) && (!isStudent || score.studentId === caller.userId),
      ),
    progress: db
      .collection('contentProgress')
      .filter((item) => !isStudent || item.studentId === caller.userId),
    exams: db.collection('exams').filter((exam) => courseIds.has(exam.courseId)),
  };
}

/* ── Ortak bloklar ───────────────────────────────────────────────────────── */

export function buildNotifications(db: FakeDb, userId: string, limit = 6): Notification[] {
  return db
    .collection('notifications')
    .filter((notification) => notification.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

const AUDIT_TONES: Partial<Record<AuditAction, ActivityEntry['tone']>> = {
  'course.published': 'success',
  'exam.published': 'primary',
  'attempt.graded': 'info',
  'attempt.score.overridden': 'warning',
  'session.terminated': 'danger',
  'permission.denied': 'danger',
};

const AUDIT_ICONS: Partial<Record<AuditAction, AppIconName>> = {
  'course.published': 'book-open-check',
  'exam.published': 'file-check',
  'attempt.graded': 'clipboard-list',
  'attempt.score.overridden': 'pencil-line',
  'session.terminated': 'octagon-x',
  'permission.denied': 'lock',
};

export function buildRecentActivity(
  db: FakeDb,
  filter: (event: { targetId: string; actorId: string }) => boolean,
  limit = 8,
): ActivityEntry[] {
  return db
    .collection('auditEvents')
    .filter((event) => filter(event))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      title: event.targetLabel,
      description: event.reason ?? describeChanges(event.changes),
      at: event.createdAt,
      icon: AUDIT_ICONS[event.action] ?? 'activity',
      tone: AUDIT_TONES[event.action] ?? 'neutral',
      actor: event.actorName,
    }));
}

function describeChanges(
  changes: readonly { label: string; oldValue: string | null; newValue: string | null }[],
): string {
  if (changes.length === 0) return 'Değişiklik ayrıntısı yok.';
  return changes
    .map((change) => `${change.label}: ${change.oldValue ?? '—'} → ${change.newValue ?? '—'}`)
    .join(' · ');
}

export function buildUpcomingExams(scope: DashboardScope, limit = 5): UpcomingExamCard[] {
  const courseByCode = new Map(scope.courses.map((course) => [course.id, course.code]));
  const cohortNames = new Map(scope.cohorts.map((cohort) => [cohort.id, cohort.name]));
  const isStudent = scope.caller.role === 'STUDENT';

  return scope.exams
    .filter(
      (exam) =>
        // Yalnızca yayındaki ve henüz başlamamış sınavlar "yaklaşan" sayılır.
        examRuntimeStatus(exam, scope.now) === 'scheduled' &&
        (!isStudent || exam.cohortIds.some((id) => scope.caller.cohortIds.includes(id))),
    )
    .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt))
    .slice(0, limit)
    .map((exam) => ({
      id: exam.id,
      title: exam.title,
      courseCode: courseByCode.get(exam.courseId) ?? '',
      opensAt: exam.opensAt,
      durationMinutes: exam.durationMinutes,
      questionCount: exam.questions.length,
      state: exam.state,
      cohortNames: exam.cohortIds
        .map((id) => cohortNames.get(id))
        .filter((name): name is string => name !== undefined),
    }));
}

/** Denemeleri güne göre gruplayıp ortalama başarı serisi üretir. */
export function buildScoreTrend(attempts: readonly Attempt[], limit = 14): TimeSeriesPoint[] {
  const buckets = new Map<string, { total: number; count: number }>();

  for (const attempt of attempts) {
    const key = attempt.submittedAt.slice(0, 10);
    const bucket = buckets.get(key) ?? { total: 0, count: 0 };
    bucket.total += attempt.scorePercent;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([date, bucket]) => ({
      date,
      value: Math.round(bucket.total / bucket.count),
      sampleSize: bucket.count,
    }));
}

/* ── Sayısal yardımcılar ─────────────────────────────────────────────────── */

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Değer dizisinden 7 noktalı sparkline üretir. */
export function sparkline(values: readonly number[]): number[] {
  if (values.length === 0) return [0, 0, 0, 0, 0, 0, 0];
  if (values.length <= 7) return [...values];

  const bucketSize = Math.ceil(values.length / 7);
  return Array.from({ length: 7 }, (_, index) =>
    average(values.slice(index * bucketSize, (index + 1) * bucketSize)),
  );
}

/** Sparkline'ın ilk ve son değerinden yön/eğilim çıkarır — uydurma trend kullanılmaz. */
export function trendOf(values: readonly number[]): {
  trendPercent: number;
  direction: TrendDirection;
} {
  const points = sparkline(values).filter((value) => value !== 0);
  if (points.length < 2) return { trendPercent: 0, direction: 'flat' };

  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first === 0) return { trendPercent: 0, direction: 'flat' };

  const change = Math.round(((last - first) / first) * 1000) / 10;
  return {
    trendPercent: Math.abs(change),
    direction: change > 1 ? 'up' : change < -1 ? 'down' : 'flat',
  };
}

/** KPI kartı üretimini tek kalıba bağlar — her rolde aynı alanlar doldurulur. */
export function kpi(input: {
  key: string;
  label: string;
  value: number;
  unit?: string;
  icon: AppIconName;
  caption: string;
  series: readonly number[];
  higherIsBetter?: boolean;
}): KpiCard {
  const { trendPercent, direction } = trendOf(input.series);

  return {
    key: input.key,
    label: input.label,
    value: input.value,
    unit: input.unit ?? '',
    trendPercent,
    direction,
    higherIsBetter: input.higherIsBetter ?? true,
    icon: input.icon,
    caption: input.caption,
    sparkline: sparkline(input.series),
  };
}
