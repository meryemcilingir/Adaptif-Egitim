import {
  CompareKind,
  CompareMetric,
  CompareSubject,
  ComparisonResult,
  TimeSeriesPoint,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import { mean, percentOf, round1 } from '../../../../../features/adaptive-learning/domain/statistics';
import { ReportScope, buildMeta, dailySeries } from './report-context';

/**
 * Karşılaştırma raporu (§12).
 *
 * Dört karşılaştırma türü (öğrenci, grup, ders, sınav) TEK bir yapıya indirgenir:
 * her taraf bir `CompareSubject`'tir ve aynı metrik listesini taşır. Böylece
 * ekran dört ayrı bileşen yazmak zorunda kalmaz ve yeni bir tür eklemek yalnızca
 * bir "toplayıcı" fonksiyon yazmaktır (Open/Closed).
 *
 * Farklar HER ZAMAN ilk tarafa göre hesaplanır; "kim referans?" sorusu ekranda
 * belirsiz kalmasın diye ilk seçilen taraf temel alınır.
 */

type SubjectCollector = (scope: ReportScope, id: string) => CompareSubject | null;

const COLLECTORS: Readonly<Record<CompareKind, SubjectCollector>> = {
  student: collectStudent,
  cohort: collectCohort,
  course: collectCourse,
  exam: collectExam,
};

export function buildComparison(
  scope: ReportScope,
  kind: CompareKind,
  ids: readonly string[],
): ComparisonResult {
  const collector = COLLECTORS[kind];

  const subjects = ids
    .map((id) => collector(scope, id))
    .filter((subject): subject is CompareSubject => subject !== null);

  return {
    meta: buildMeta(scope, subjects.length),
    kind,
    subjects: withDifferences(subjects),
  };
}

/** İlk tarafı referans alarak farkları doldurur. */
function withDifferences(subjects: readonly CompareSubject[]): CompareSubject[] {
  const baseline = subjects[0];
  if (!baseline) return [];

  const baseByKey = new Map(
    baseline.metrics.map((metric) => [metric.key, metric] as const),
  );

  return subjects.map((subject, index) => ({
    ...subject,
    metrics: subject.metrics.map((metric) => {
      const base = baseByKey.get(metric.key);

      // Taraflardan biri ölçülmemişse fark hesaplanamaz; 0 yerine 0 farkı
      // gösterilir ve ekran hücreyi "ölçüm yok" olarak işaretler.
      const comparable = index > 0 && metric.sampleSize > 0 && (base?.sampleSize ?? 0) > 0;

      return {
        ...metric,
        difference: comparable ? round1(metric.value - (base?.value ?? 0)) : 0,
      };
    }),
  }));
}

/**
 * Bir ölçüm satırı.
 *
 * `sampleSize` zorunludur: ölçüm yokken 0 göstermek, "sıfır puan aldı" ile
 * "hiç sınava girmedi"yi aynı hücrede birleştirir ve karşılaştırmayı yanıltır.
 */
function metric(
  key: string,
  label: string,
  value: number,
  unit: string,
  sampleSize: number,
): CompareMetric {
  return { key, label, value: round1(value), unit, sampleSize, difference: 0 };
}

/* ── Toplayıcılar ────────────────────────────────────────────────────────── */

function collectStudent(scope: ReportScope, studentId: string): CompareSubject | null {
  if (!scope.studentIds.has(studentId)) return null;

  const user = scope.db.collection('users').findById(studentId);
  if (!user) return null;

  const attempts = scope.attempts.filter((attempt) => attempt.studentId === studentId);
  const progress = scope.progress.filter((item) => item.studentId === studentId);
  const mastery = scope.mastery.filter((score) => score.studentId === studentId);
  const completed = progress.filter((item) => item.state === 'completed').length;

  const cohort = scope.db
    .collection('cohorts')
    .filter((item) => item.studentIds.includes(studentId))
    .at(0);

  return {
    id: studentId,
    label: user.fullName,
    sublabel: cohort?.name ?? '',
    metrics: [
      metric(
        'mastery',
        'Ustalık',
        mastery.length === 0 ? 0 : mean(mastery.map((s) => s.score)),
        '%',
        mastery.length,
      ),
      metric(
        'exam',
        'Sınav ortalaması',
        attempts.length === 0 ? 0 : mean(attempts.map((a) => a.scorePercent)),
        '%',
        attempts.length,
      ),
      metric('completion', 'Tamamlama', percentOf(completed, progress.length), '%', progress.length),
      metric(
        'minutes',
        'Çalışma süresi',
        progress.reduce((s, i) => s + i.spentMinutes, 0),
        ' dk',
        progress.length,
      ),
      metric('attempts', 'Sınav sayısı', attempts.length, '', 1),
    ],
    trend: attemptTrend(scope, attempts),
  };
}

function collectCohort(scope: ReportScope, cohortId: string): CompareSubject | null {
  if (!scope.cohortIds.has(cohortId)) return null;

  const cohort = scope.db.collection('cohorts').findById(cohortId);
  if (!cohort) return null;

  const memberIds = new Set(cohort.studentIds.filter((id) => scope.studentIds.has(id)));
  const attempts = scope.attempts.filter((attempt) => memberIds.has(attempt.studentId));
  const progress = scope.progress.filter((item) => memberIds.has(item.studentId));
  const mastery = scope.mastery.filter((score) => memberIds.has(score.studentId));
  const completed = progress.filter((item) => item.state === 'completed').length;

  return {
    id: cohortId,
    label: cohort.name,
    sublabel: `${memberIds.size} öğrenci`,
    metrics: [
      metric(
        'mastery',
        'Ortalama ustalık',
        mastery.length === 0 ? 0 : mean(mastery.map((s) => s.score)),
        '%',
        mastery.length,
      ),
      metric(
        'exam',
        'Sınav ortalaması',
        attempts.length === 0 ? 0 : mean(attempts.map((a) => a.scorePercent)),
        '%',
        attempts.length,
      ),
      metric(
        'pass',
        'Geçme oranı',
        percentOf(attempts.filter((a) => a.passed).length, attempts.length),
        '%',
        attempts.length,
      ),
      metric('completion', 'Tamamlama', percentOf(completed, progress.length), '%', progress.length),
      metric('students', 'Öğrenci sayısı', memberIds.size, '', 1),
    ],
    trend: attemptTrend(scope, attempts),
  };
}

function collectCourse(scope: ReportScope, courseId: string): CompareSubject | null {
  if (!scope.courseIds.has(courseId)) return null;

  const course = scope.db.collection('courses').findById(courseId);
  if (!course) return null;

  const attempts = scope.attempts.filter((attempt) => attempt.courseId === courseId);
  const mastery = scope.mastery.filter((score) => score.courseId === courseId);

  const contentIds = new Set(
    scope.db
      .collection('contents')
      .filter((content) => content.courseId === courseId)
      .map((content) => content.id),
  );

  const progress = scope.progress.filter((item) => contentIds.has(item.contentId));
  const completed = progress.filter((item) => item.state === 'completed').length;

  const questions = scope.db
    .collection('questions')
    .filter((question) => question.courseId === courseId && question.deletedAt === null);

  return {
    id: courseId,
    label: course.code,
    sublabel: course.name,
    metrics: [
      metric(
        'mastery',
        'Ortalama ustalık',
        mastery.length === 0 ? 0 : mean(mastery.map((s) => s.score)),
        '%',
        mastery.length,
      ),
      metric(
        'exam',
        'Sınav ortalaması',
        attempts.length === 0 ? 0 : mean(attempts.map((a) => a.scorePercent)),
        '%',
        attempts.length,
      ),
      metric('completion', 'Tamamlama', percentOf(completed, progress.length), '%', progress.length),
      metric('questions', 'Soru sayısı', questions.length, '', 1),
      metric('attempts', 'Deneme sayısı', attempts.length, '', 1),
    ],
    trend: attemptTrend(scope, attempts),
  };
}

function collectExam(scope: ReportScope, examId: string): CompareSubject | null {
  const exam = scope.db.collection('exams').findById(examId);
  if (!exam || !scope.courseIds.has(exam.courseId)) return null;

  const attempts = scope.attempts.filter((attempt) => attempt.examId === examId);
  const course = scope.db.collection('courses').findById(exam.courseId);

  return {
    id: examId,
    label: exam.title,
    sublabel: course?.code ?? '',
    metrics: [
      metric(
        'average',
        'Ortalama puan',
        attempts.length === 0 ? 0 : mean(attempts.map((a) => a.scorePercent)),
        '%',
        attempts.length,
      ),
      metric(
        'pass',
        'Geçme oranı',
        percentOf(attempts.filter((a) => a.passed).length, attempts.length),
        '%',
        attempts.length,
      ),
      metric('attempts', 'Deneme sayısı', attempts.length, '', 1),
      metric('questions', 'Soru sayısı', exam.questions.length, '', 1),
      metric(
        'duration',
        'Ortalama süre',
        attempts.length === 0 ? 0 : mean(attempts.map((a) => a.durationSeconds / 60)),
        ' dk',
        attempts.length,
      ),
    ],
    trend: attemptTrend(scope, attempts),
  };
}

/** Karşılaştırmalarda ortak trend: günlük ortalama puan. */
function attemptTrend(
  scope: ReportScope,
  attempts: readonly { submittedAt: string; scorePercent: number }[],
): TimeSeriesPoint[] {
  return dailySeries(scope, (dayStart, dayEnd) => {
    const inDay = attempts.filter((attempt) => {
      const at = Date.parse(attempt.submittedAt);
      return at > dayStart && at <= dayEnd;
    });

    return {
      value: inDay.length === 0 ? 0 : Math.round(mean(inDay.map((a) => a.scorePercent))),
      sampleSize: inDay.length,
    };
  });
}
