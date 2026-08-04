import {
  AnalyticsOverview,
  OverviewMetric,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import { computeDelta } from '../../../../../features/adaptive-learning/models/analytics.model';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import { buildInsights } from '../../../../../features/adaptive-learning/domain/insights';
import { mean, percentOf } from '../../../../../features/adaptive-learning/domain/statistics';
import { isWithin, previousRange } from '../../../../../features/adaptive-learning/domain/analytics-range';
import {
  ReportScope,
  buildMeta,
  masteryTrend,
  performerRows,
  scoreTrend,
} from './report-context';
import { progressIndex, tallyRecommendations } from './recommendation.report';

/**
 * Analitik genel bakış (§1).
 *
 * On KPI, kural tabanlı içgörüler ve iki trend. Her KPI bir DETAY EKRANINA
 * bağlanır (§15 drill-down): rakamın arkasına bakmak isteyen kullanıcı tek
 * tıkla oraya gider.
 *
 * Karşılaştırmalı değerler (`delta`) bir ÖNCEKİ eşit uzunlukta pencereden
 * hesaplanır; farklı uzunlukta pencereleri karşılaştırmak anlamsız olurdu.
 */
export function buildOverview(scope: ReportScope): AnalyticsOverview {
  const { db } = scope;

  const students = [...scope.studentIds];
  const courses = [...scope.courseIds];

  const exams = db.collection('exams').filter((exam) => scope.courseIds.has(exam.courseId));
  const questions = db
    .collection('questions')
    .filter((question) => scope.courseIds.has(question.courseId) && question.deletedAt === null);

  const recommendations = db
    .collection('recommendations')
    .filter((item) => scope.studentIds.has(item.studentId));

  /* Aktif öğrenci: pencere içinde içerik açmış ya da sınava girmiş olan. */
  const activeStudentIds = new Set([
    ...scope.attempts.map((attempt) => attempt.studentId),
    ...scope.progress
      .filter((item) => item.lastAccessedAt && isWithin(scope.range, item.lastAccessedAt))
      .map((item) => item.studentId),
  ]);

  /*
   * Tamamlama oranı BİRİKEN bir durumdur: "açtığım içeriğin ne kadarını
   * bitirdim". Akış gibi ölçülürse (yalnızca bu dönemde bitenler / tüm içerik)
   * veri yoğunluğuna göre yüzlerce puanlık sahte değişimler üretir.
   *
   * Bu yüzden karşılaştırma da biriken hâl üzerinden yapılır: dönem SONU
   * itibarıyla oran ile önceki dönem sonu itibarıyla oran.
   */
  const completionRate = completionRateAsOf(scope.progress, Date.parse(scope.range.to));

  /*
   * Öneri kabulü, önerinin kendi kaydından değil ÖĞRENCİNİN DAVRANIŞINDAN
   * çıkarılır (bkz. `recommendation.report.ts`): öneri sonrası içeriği açtıysa
   * kabul, açmadıysa yok sayılmış demektir.
   */
  const progressByKey = progressIndex(scope);
  const tally = tallyRecommendations(
    recommendations.filter((item) => isWithin(scope.range, item.generatedAt)),
    progressByKey,
  );
  const acceptanceRate = tally.acceptanceRate;

  const averageScore =
    scope.attempts.length === 0
      ? 0
      : Math.round(mean(scope.attempts.map((attempt) => attempt.scorePercent)));

  const averageMastery =
    scope.mastery.length === 0 ? 0 : Math.round(mean(scope.mastery.map((score) => score.score)));

  /* ── Önceki pencere: karşılaştırmalı metrikler için ──────────────────── */

  const previous = previousRange(scope.range);
  const previousAttempts = db
    .collection('attempts')
    .filter(
      (attempt) =>
        scope.courseIds.has(attempt.courseId) &&
        scope.studentIds.has(attempt.studentId) &&
        isWithin(previous, attempt.submittedAt),
    );

  const previousScore =
    previousAttempts.length === 0
      ? 0
      : Math.round(mean(previousAttempts.map((attempt) => attempt.scorePercent)));

  const previousCompletionRate = completionRateAsOf(scope.progress, Date.parse(previous.to));


  const previousAcceptance = tallyRecommendations(
    recommendations.filter((item) => isWithin(previous, item.generatedAt)),
    progressByKey,
  ).acceptanceRate;

  const scoreDelta = computeDelta(averageScore, previousScore);
  const completionDelta = computeDelta(completionRate, previousCompletionRate);
  const acceptanceDelta = computeDelta(acceptanceRate, previousAcceptance);

  /* ── KPI kartları ─────────────────────────────────────────────────────── */

  /*
   * Grup ortalaması yalnızca ÖĞRENCİ görünümünde hesaplanır.
   *
   * Öğrencinin kapsamı `own` olduğu için "Ortalama ustalık"/"Ortalama sınav
   * puanı" aksi hâlde kendi değeriyle aynı çıkar — karşılaştırma yapamaz.
   * Bireysel öğrenci kayıtları sızdırılmaz; tek bir toplu ortalama eklenir.
   */
  const peers = peerAverages(scope);

  const metrics: OverviewMetric[] = [
    metric('students', 'Toplam öğrenci', students.length, '', 'users', 'Kapsamınızdaki öğrenciler', null, '/analytics/performers'),
    metric(
      'active-students',
      'Aktif öğrenci',
      activeStudentIds.size,
      '',
      'activity',
      'Seçili dönemde etkinlik gösteren',
      null,
      '/analytics/velocity',
    ),
    metric('courses', 'Ders', courses.length, '', 'library', 'Kapsamınızdaki dersler', null, '/courses'),
    metric('exams', 'Sınav', exams.length, '', 'file-check', 'Tanımlı sınavlar', null, '/exams'),
    metric('questions', 'Soru', questions.length, '', 'circle-help', 'Soru bankasındaki maddeler', null, '/question-bank'),
    metric(
      'mastery',
      'Ortalama ustalık',
      averageMastery,
      '%',
      'target',
      'Kazanım bazlı ortalama',
      null,
      '/analytics/heatmap',
      peers.mastery,
    ),
    metric(
      'exam-score',
      'Ortalama sınav puanı',
      averageScore,
      '%',
      'chart-column',
      'Seçili dönemdeki denemeler',
      scoreDelta,
      '/analytics/trends',
      peers.examScore,
    ),
    metric(
      'completion',
      'Tamamlama oranı',
      completionRate,
      '%',
      'circle-check-big',
      'Açılan içeriklerin tamamlanma oranı',
      completionDelta,
      '/analytics/velocity',
    ),
    /*
     * Öneri kabul oranı, dönemde HİÇ öneri üretilmediyse "%0 kabul" gibi
     * okunmamalı: veri yokluğu ile başarısızlık farklı şeylerdir. Bu durumda
     * karşılaştırma da gösterilmez, çünkü sıfırı sıfırla kıyaslamanın anlamı yok.
     */
    metric(
      'acceptance',
      'Öneri kabul oranı',
      acceptanceRate,
      '%',
      'sparkles',
      tally.total === 0
        ? 'Bu dönemde öneri üretilmedi'
        : `${tally.total} öneriden ${tally.accepted + tally.completed} tanesi açıldı`,
      tally.total === 0 ? null : acceptanceDelta,
      '/analytics/recommendations',
    ),
    metric(
      'cohorts',
      'Aktif grup',
      scope.cohortIds.size,
      '',
      'users',
      'Kapsamınızdaki gruplar',
      null,
      '/cohort-analytics',
    ),
  ];

  /* ── İçgörüler ────────────────────────────────────────────────────────── */

  const board = performerRows(scope, 5);
  const outcomeMastery = groupMastery(scope);

  const analyses = db
    .collection('itemAnalyses')
    .filter((analysis) => scope.courseIds.has(analysis.courseId));

  /* Beklenen çözüm süresi sorunun kendisinde tutulur, analizde değil. */
  const expectedSeconds = new Map(
    questions.map((question) => [question.id, question.estimatedSolveTimeSeconds]),
  );

  const lowPassExams = exams
    .filter((exam) => examRuntimeStatus(exam, scope.now) === 'closed')
    .map((exam) => {
      const attempts = scope.attempts.filter((attempt) => attempt.examId === exam.id);
      return {
        id: exam.id,
        title: exam.title,
        passRate: percentOf(attempts.filter((a) => a.passed).length, attempts.length),
        sampleSize: attempts.length,
      };
    })
    // Az örneklemli sınavdan "geçme oranı düşük" sonucu çıkarmak yanıltıcı olur.
    .filter((exam) => exam.sampleSize >= 5);

  const insights = buildInsights({
    averageScore: scoreDelta,
    completionRate: completionDelta,
    acceptanceRate: acceptanceDelta,
    averageMastery,
    weakOutcomes: outcomeMastery.map((item) => ({
      id: item.outcomeId,
      code: item.outcomeCode,
      mastery: item.mastery,
    })),
    strongOutcomes: outcomeMastery.map((item) => ({
      code: item.outcomeCode,
      mastery: item.mastery,
    })),
    lowPassExams,
    atRiskCount: board.atRiskCount,
    studentCount: board.studentCount,
    flaggedQuestionCount: analyses.filter((analysis) => analysis.flags.length > 0).length,
    totalQuestionCount: analyses.length,
    slowQuestions: analyses
      .filter((analysis) => analysis.averageTimeSeconds > 0)
      .map((analysis) => ({
        code: analysis.questionCode,
        ratio: analysis.averageTimeSeconds / Math.max(1, expectedSeconds.get(analysis.questionId) ?? 60),
      })),
  });

  return {
    meta: buildMeta(scope, scope.attempts.length),
    metrics,
    insights,
    scoreTrend: scoreTrend(scope),
    masteryTrend: masteryTrend(scope),
    topPerformers: board.topPerformers,
    atRisk: board.atRisk,
  };
}

/** Kazanım bazında ortalama ustalık — içgörü kurallarının girdisi. */
export function groupMastery(scope: ReportScope) {
  const byOutcome = new Map<string, { code: string; title: string; scores: number[] }>();

  for (const score of scope.mastery) {
    const entry = byOutcome.get(score.outcomeId) ?? {
      code: score.outcomeCode,
      title: score.outcomeTitle,
      scores: [],
    };
    entry.scores.push(score.score);
    byOutcome.set(score.outcomeId, entry);
  }

  return [...byOutcome.entries()].map(([outcomeId, entry]) => ({
    outcomeId,
    outcomeCode: entry.code,
    outcomeTitle: entry.title,
    mastery: mean(entry.scores),
    sampleSize: entry.scores.length,
  }));
}

/**
 * Belirli bir ana kadarki tamamlama oranı.
 *
 * O ana kadar AÇILMIŞ içerikler paydayı, o ana kadar BİTİRİLMİŞ olanlar payı
 * oluşturur. Böylece iki farklı an karşılaştırılabilir hâle gelir.
 */
function completionRateAsOf(
  progress: readonly { startedAt: string | null; completedAt: string | null }[],
  asOfMs: number,
): number {
  const touched = progress.filter(
    (item) => item.startedAt !== null && Date.parse(item.startedAt) <= asOfMs,
  );

  const completed = touched.filter(
    (item) => item.completedAt !== null && Date.parse(item.completedAt) <= asOfMs,
  );

  return percentOf(completed.length, touched.length);
}

function metric(
  key: string,
  label: string,
  value: number,
  unit: string,
  icon: string,
  caption: string,
  delta: OverviewMetric['delta'],
  link: string | null,
  peerAverage: number | null = null,
): OverviewMetric {
  return { key, label, value, unit, icon, caption, delta, link, peerAverage };
}

/**
 * Öğrenci görünümü için grup ortalaması.
 *
 * Kapsam daraltmasından (`buildReportScope`) ÖNCEKİ hâliyle, çağıranın kayıtlı
 * olduğu grupların TÜMÜ sorgulanır — ama yalnızca TOPLU ortalama döner, hangi
 * öğrencinin ne aldığı hiçbir zaman istemciye gitmez.
 */
function peerAverages(scope: ReportScope): { mastery: number | null; examScore: number | null } {
  if (scope.caller.role !== 'STUDENT') return { mastery: null, examScore: null };

  const peerIds = new Set(
    scope.db
      .collection('cohorts')
      .filter((cohort) => scope.caller.cohortIds.includes(cohort.id))
      .flatMap((cohort) => cohort.studentIds),
  );

  const peerMastery = scope.db
    .collection('masteryScores')
    .filter((score) => peerIds.has(score.studentId));

  const peerAttempts = scope.db
    .collection('attempts')
    .filter(
      (attempt) => peerIds.has(attempt.studentId) && isWithin(scope.range, attempt.submittedAt),
    );

  return {
    mastery: peerMastery.length === 0 ? null : Math.round(mean(peerMastery.map((s) => s.score))),
    examScore:
      peerAttempts.length === 0 ? null : Math.round(mean(peerAttempts.map((a) => a.scorePercent))),
  };
}
