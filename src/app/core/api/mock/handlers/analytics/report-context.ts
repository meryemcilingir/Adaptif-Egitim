import {
  PerformerRow,
  ReportMeta,
  TimeSeriesPoint,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import { Attempt } from '../../../../../features/adaptive-learning/models/attempt.model';
import { ContentProgress } from '../../../../../features/adaptive-learning/models/content-item.model';
import { MasteryScore } from '../../../../../features/adaptive-learning/models/mastery.model';
import {
  DateRange,
  RangeSelection,
  formatRange,
  isWithin,
  rangeDays,
  resolveRange,
} from '../../../../../features/adaptive-learning/domain/analytics-range';
import {
  PerformanceInput,
  buildPerformerBoard,
} from '../../../../../features/adaptive-learning/domain/learning-velocity';
import { mean, percentOf } from '../../../../../features/adaptive-learning/domain/statistics';
import { FakeDb } from '../../db/fake-db';
import { isWithinScope } from '../../mock-auth';
import { MockCaller, MockContext } from '../../mock-router';

/**
 * Analitik raporlarının ortak bağlamı.
 *
 * İki sorumluluğu var:
 *
 * 1. **Kapsam (Privacy Rules, §20).** Kullanıcı ne görebiliyorsa rapor da onu
 *    içerir. Filtreleme EKRANDA değil burada yapılır: bir ekranın filtreyi
 *    uygulamayı unutması, başkasının verisini sızdırmak demektir.
 *
 * 2. **Zaman penceresi.** Tüm raporlar aynı aralık sözleşmesini kullanır
 *    (`domain/analytics-range.ts`), böylece iki ekran aynı filtrede farklı
 *    sayı göstermez.
 */
export interface ReportScope {
  readonly db: FakeDb;
  readonly caller: MockCaller;
  readonly now: number;
  readonly range: DateRange;
  /** Kapsam ve filtreler uygulandıktan sonra kalan veriler. */
  readonly attempts: readonly Attempt[];
  readonly progress: readonly ContentProgress[];
  readonly mastery: readonly MasteryScore[];
  readonly studentIds: ReadonlySet<string>;
  readonly courseIds: ReadonlySet<string>;
  readonly cohortIds: ReadonlySet<string>;
  readonly scopeNote: string | null;
}

/** Ekranlardan gelen ortak filtreler. */
export interface ReportFilters {
  readonly selection: RangeSelection;
  readonly programId: string | null;
  readonly courseId: string | null;
  readonly cohortId: string | null;
  readonly studentId: string | null;
  readonly outcomeId: string | null;
  readonly examId: string | null;
}

export function readFilters(context: MockContext): ReportFilters {
  const query = context.query;
  const preset = (query.get('preset') ?? 'last30') as RangeSelection['preset'];

  return {
    selection: {
      preset,
      from: query.get('from'),
      to: query.get('to'),
    },
    programId: query.get('programId'),
    courseId: query.get('courseId'),
    cohortId: query.get('cohortId'),
    studentId: query.get('studentId'),
    outcomeId: query.get('outcomeId'),
    examId: query.get('examId'),
  };
}

/**
 * Rol bazlı kapsam (§20).
 *
 * Öğrenci yalnızca kendi verisini, eğitmen kendi ders ve gruplarını, program
 * yöneticisi programındaki her şeyi görür. Ölçme uzmanı soru/madde analizine
 * erişir ama öğrenci kimliklerini de görebilir — çünkü madde analizi kimliksiz
 * yapılamaz; bunun yerine ONA ÖZEL bir not eklenir ve ekranlar kişisel
 * kırılımları göstermez.
 */
export function buildReportScope(
  context: MockContext,
  caller: MockCaller,
  filters: ReportFilters,
): ReportScope {
  const db = context.db;
  const range = resolveRange(filters.selection, context.now);

  const isStudent = caller.role === 'STUDENT';

  /* Öğrenci başkasının kimliğini sorgulasa bile kendi verisine indirgenir. */
  const targetStudentId = isStudent ? caller.userId : filters.studentId;

  const courses = db
    .collection('courses')
    .filter(
      (course) =>
        isWithinScope(caller, { courseId: course.id, cohortIds: course.cohortIds }) ||
        caller.courseIds.includes(course.id),
    )
    .filter((course) => !filters.programId || course.programId === filters.programId)
    .filter((course) => !filters.courseId || course.id === filters.courseId);

  const courseIds = new Set(courses.map((course) => course.id));

  const cohorts = db
    .collection('cohorts')
    .filter((cohort) =>
      isStudent || caller.role === 'OBSERVER' ? caller.cohortIds.includes(cohort.id) : true,
    )
    .filter((cohort) => !filters.cohortId || cohort.id === filters.cohortId)
    .filter((cohort) => !filters.programId || cohort.programId === filters.programId);

  const cohortIds = new Set(cohorts.map((cohort) => cohort.id));
  const studentIds = new Set(cohorts.flatMap((cohort) => cohort.studentIds));

  if (targetStudentId) {
    for (const id of [...studentIds]) {
      if (id !== targetStudentId) studentIds.delete(id);
    }
    // Kapsam dışı bir öğrenci istendiyse liste boş kalır; veri sızmaz.
    if (isStudent) studentIds.add(caller.userId);
  }

  const attempts = db
    .collection('attempts')
    .filter(
      (attempt) =>
        courseIds.has(attempt.courseId) &&
        studentIds.has(attempt.studentId) &&
        (!filters.examId || attempt.examId === filters.examId) &&
        isWithin(range, attempt.submittedAt),
    );

  const contentIds = new Set(
    db
      .collection('contents')
      .filter((content) => courseIds.has(content.courseId))
      .map((content) => content.id),
  );

  const progress = db
    .collection('contentProgress')
    .filter((item) => contentIds.has(item.contentId) && studentIds.has(item.studentId));

  const mastery = db
    .collection('masteryScores')
    .filter(
      (score) =>
        courseIds.has(score.courseId) &&
        studentIds.has(score.studentId) &&
        (!filters.outcomeId || score.outcomeId === filters.outcomeId),
    );

  return {
    db,
    caller,
    now: context.now,
    range,
    attempts,
    progress,
    mastery,
    studentIds,
    courseIds,
    cohortIds,
    scopeNote: scopeNoteFor(caller),
  };
}

function scopeNoteFor(caller: MockCaller): string | null {
  switch (caller.role) {
    case 'STUDENT':
      return 'Yalnızca kendi verileriniz gösteriliyor.';
    case 'INSTRUCTOR':
      return 'Yalnızca sorumlu olduğunuz ders ve gruplar gösteriliyor.';
    case 'OBSERVER':
      return 'Gözlemci rolünde bireysel kırılımlar gizlenir.';
    case 'ASSESSMENT_SPECIALIST':
      return 'Ölçme uzmanı görünümü: soru ve madde analizine odaklıdır.';
    default:
      return null;
  }
}

export function buildMeta(scope: ReportScope, sampleSize: number): ReportMeta {
  return {
    generatedAt: new Date(scope.now).toISOString(),
    rangeFrom: scope.range.from,
    rangeTo: scope.range.to,
    rangeLabel: formatRange(scope.range),
    sampleSize,
    scopeNote: scope.scopeNote,
  };
}

/* ── Ortak türetmeler ────────────────────────────────────────────────────── */

/**
 * Günlük zaman serisi üretir.
 *
 * Veri olmayan günler ATLANMAZ, sıfırla doldurulur: eksik günleri çizgiden
 * çıkarmak, iki hafta boyunca hiç çalışılmamış bir dönemi kesintisiz bir
 * çizgi gibi gösterirdi.
 */
export function dailySeries(
  scope: ReportScope,
  valueAt: (dayStart: number, dayEnd: number) => { value: number; sampleSize: number },
): TimeSeriesPoint[] {
  const days = Math.min(rangeDays(scope.range), 120);
  const end = Date.parse(scope.range.to);
  const points: TimeSeriesPoint[] = [];

  for (let index = days - 1; index >= 0; index--) {
    const dayEnd = end - index * 86_400_000;
    const dayStart = dayEnd - 86_400_000;
    const { value, sampleSize } = valueAt(dayStart, dayEnd);

    points.push({
      date: new Date(dayEnd).toISOString().slice(0, 10),
      value,
      sampleSize,
    });
  }

  return points;
}

/** Denemelerden günlük ortalama puan serisi. */
export function scoreTrend(scope: ReportScope): TimeSeriesPoint[] {
  return dailySeries(scope, (dayStart, dayEnd) => {
    const inDay = scope.attempts.filter((attempt) => {
      const at = Date.parse(attempt.submittedAt);
      return at > dayStart && at <= dayEnd;
    });

    return {
      value: inDay.length === 0 ? 0 : Math.round(mean(inDay.map((a) => a.scorePercent))),
      sampleSize: inDay.length,
    };
  });
}

/** İlerleme kayıtlarından günlük çalışma süresi (dakika). */
export function studyTimeTrend(scope: ReportScope): TimeSeriesPoint[] {
  return dailySeries(scope, (dayStart, dayEnd) => {
    const inDay = scope.progress.filter((item) => {
      if (!item.lastAccessedAt) return false;
      const at = Date.parse(item.lastAccessedAt);
      return at > dayStart && at <= dayEnd;
    });

    return {
      value: inDay.reduce((sum, item) => sum + item.spentMinutes, 0),
      sampleSize: inDay.length,
    };
  });
}

export function completionTrend(scope: ReportScope): TimeSeriesPoint[] {
  return dailySeries(scope, (dayStart, dayEnd) => {
    const completed = scope.progress.filter((item) => {
      if (!item.completedAt) return false;
      const at = Date.parse(item.completedAt);
      return at > dayStart && at <= dayEnd;
    });

    return { value: completed.length, sampleSize: completed.length };
  });
}

/**
 * Ustalık trendi.
 *
 * Ustalık skorları ANLIK hesaplanır ve geçmişe dönük saklanmaz; bu yüzden
 * günlük seri, o güne kadar hesaplanmış skorların ortalamasıdır. Gerçek bir
 * zaman serisi değildir ve grafik başlığında bu belirtilir.
 */
export function masteryTrend(scope: ReportScope): TimeSeriesPoint[] {
  return dailySeries(scope, (_dayStart, dayEnd) => {
    const upTo = scope.mastery.filter((score) => Date.parse(score.calculatedAt) <= dayEnd);

    return {
      value: upTo.length === 0 ? 0 : Math.round(mean(upTo.map((score) => score.score))),
      sampleSize: upTo.length,
    };
  });
}

/* ── Öğrenci performansı ─────────────────────────────────────────────────── */

/**
 * Kapsam içindeki öğrencilerin performans girdilerini toplar.
 *
 * Katılım (`attendancePercent`) GERÇEK BİR VERİ DEĞİLDİR: sistemde yoklama
 * kaydı yok. Tamamlama ve deneme sayısından türetilen bir gösterge üretilir ve
 * ekranlarda "örnek" olarak işaretlenir — uydurulmuş bir sayıyı gerçek gibi
 * sunmak, raporun tamamına duyulan güveni zedeler.
 */
export function performanceInputs(scope: ReportScope): PerformanceInput[] {
  const users = scope.db.collection('users');
  const cohorts = scope.db.collection('cohorts');
  const cohortNameByStudent = new Map<string, string>();

  for (const cohort of cohorts.all()) {
    for (const studentId of cohort.studentIds) {
      if (!cohortNameByStudent.has(studentId)) cohortNameByStudent.set(studentId, cohort.name);
    }
  }

  return [...scope.studentIds].map((studentId) => {
    const user = users.findById(studentId);
    const attempts = scope.attempts.filter((attempt) => attempt.studentId === studentId);
    const progress = scope.progress.filter((item) => item.studentId === studentId);
    const mastery = scope.mastery.filter((score) => score.studentId === studentId);

    const completed = progress.filter((item) => item.state === 'completed').length;
    const touched = progress.length;

    return {
      studentId,
      studentName: user?.fullName ?? 'Bilinmeyen öğrenci',
      cohortName: cohortNameByStudent.get(studentId) ?? '',
      masteryPercent: mastery.length === 0 ? 0 : mean(mastery.map((score) => score.score)),
      examAveragePercent:
        attempts.length === 0 ? 0 : mean(attempts.map((attempt) => attempt.scorePercent)),
      completionRate: percentOf(completed, touched),
      failedExams: attempts.filter((attempt) => !attempt.passed).length,
      attemptCount: attempts.length,
      masteryCount: mastery.length,
      touchedContentCount: touched,
      attendancePercent: syntheticAttendance(touched, attempts.length),
    };
  });
}

/**
 * Katılım göstergesi (örnek veri).
 *
 * Yoklama kaydı olmadığı için etkinlikten türetilir: hiç içerik açmamış ve hiç
 * sınava girmemiş öğrenci düşük, ikisini de yapan yüksek görünür. Deterministiktir
 * (rastgele değil) → aynı öğrenci her raporda aynı değeri alır.
 */
function syntheticAttendance(touchedContent: number, attemptCount: number): number {
  const activity = Math.min(1, touchedContent / 20) * 0.6 + Math.min(1, attemptCount / 4) * 0.4;
  return Math.round(40 + activity * 60);
}

export function performerRows(scope: ReportScope, limit = 5) {
  const board = buildPerformerBoard(performanceInputs(scope), limit);

  const toRow = (entry: (typeof board.topPerformers)[number]): PerformerRow => ({
    studentId: entry.studentId,
    studentName: entry.studentName,
    cohortName: entry.cohortName,
    masteryPercent: Math.round(entry.masteryPercent),
    examAveragePercent: Math.round(entry.examAveragePercent),
    completionRate: Math.round(entry.completionRate),
    compositeScore: entry.compositeScore,
    riskReasons: entry.riskReasons,
  });

  return {
    topPerformers: board.topPerformers.map(toRow),
    atRisk: board.atRisk.map(toRow),
    atRiskCount: board.atRiskCount,
    measuredCount: board.measuredCount,
    unmeasuredCount: board.unmeasuredCount,
    studentCount: board.studentCount,
  };
}
