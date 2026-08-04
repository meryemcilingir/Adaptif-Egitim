import {
  CategoryValue,
  DistributionBucket,
  RankedEntry,
  TimeSeriesPoint,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
} from '../../../../../features/adaptive-learning/models/common.model';
import {
  FlaggedItemEntry,
  MeasurementDashboard,
  QuestionBankTotals,
  QuestionSummaryEntry,
  QuickAction,
  StatisticEntry,
} from '../../../../../features/adaptive-learning/models/dashboard.model';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_META,
  Question,
} from '../../../../../features/adaptive-learning/models/question.model';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import { ITEM_FLAG_LABELS } from '../../../../../features/adaptive-learning/models/item-analysis.model';
import {
  DashboardScope,
  average,
  buildNotifications,
  buildRecentActivity,
  kpi,
  percent,
} from './dashboard-context';

/** Kabul edilebilir ayırt edicilik alt sınırı (BR-19). */
const DISCRIMINATION_TARGET = 0.3;

const DIFFICULTY_BANDS: readonly { readonly label: string; readonly max: number }[] = [
  { label: 'Çok zor (<0.2)', max: 0.2 },
  { label: 'Zor (0.2–0.4)', max: 0.4 },
  { label: 'Orta (0.4–0.6)', max: 0.6 },
  { label: 'Kolay (0.6–0.8)', max: 0.8 },
  { label: 'Çok kolay (>0.8)', max: 1.01 },
];

const DISCRIMINATION_BANDS: readonly { readonly label: string; readonly max: number }[] = [
  { label: 'Zayıf (<0.1)', max: 0.1 },
  { label: 'Sınırda (0.1–0.2)', max: 0.2 },
  { label: 'Kabul edilebilir (0.2–0.3)', max: 0.3 },
  { label: 'İyi (0.3–0.4)', max: 0.4 },
  { label: 'Çok iyi (>0.4)', max: 1.01 },
];

/**
 * Ölçme uzmanı paneli: madde kalitesi, zorluk/ayırt edicilik dağılımı ve
 * blueprint kapsaması. Kişisel öğrenci verisi göstermez — odak sorulardadır.
 */
export function buildMeasurementDashboard(scope: DashboardScope): MeasurementDashboard {
  const { db, caller } = scope;

  const courseIds = new Set(scope.courses.map((course) => course.id));
  const analyses = db
    .collection('itemAnalyses')
    .filter((analysis) => courseIds.has(analysis.courseId));
  const questions = db
    .collection('questions')
    .filter((question) => courseIds.has(question.courseId));
  const flagged = analyses.filter((analysis) => analysis.flags.length > 0);

  const courseByCode = new Map(scope.courses.map((course) => [course.id, course.code]));

  /*
   * Ölçme uzmanının günlük işi değerlendirmedir; madde analizi ikinci plandadır.
   * Bu yüzden panel önce "ne yapmam gerekiyor" sorusunu yanıtlar.
   */
  const grading = summarizeGrading(scope, courseIds);

  return {
    role: 'ASSESSMENT_SPECIALIST',
    generatedAt: scope.nowIso,
    headline: 'Değerlendirme ve soru kalitesi',
    subline: `${grading.awaiting} deneme değerlendirme bekliyor · ${analyses.length} analiz edilmiş madde · ortalama zorluk %${Math.round(average(analyses.map((a) => a.difficultyIndex * 100)))}`,

    kpis: [
      kpi({
        key: 'active-exams',
        label: 'Açık sınav',
        value: grading.activeExams,
        icon: 'file-check',
        caption: 'Şu anda öğrencilere açık',
        series: [grading.activeExams],
      }),
      kpi({
        key: 'awaiting-evaluation',
        label: 'Değerlendirme bekleyen',
        value: grading.awaiting,
        icon: 'clipboard-list',
        caption: 'Elle puanlanacak deneme',
        series: grading.waitingHours,
        higherIsBetter: false,
      }),
      kpi({
        key: 'pending-regrade',
        label: 'İtiraz incelemesi',
        value: grading.regrades,
        icon: 'history',
        caption: 'Yeniden değerlendirilecek',
        series: [grading.regrades],
        higherIsBetter: false,
      }),
      kpi({
        key: 'completed-evaluations',
        label: 'Tamamlanan değerlendirme',
        value: grading.completed,
        icon: 'circle-check-big',
        caption: 'Puanlaması biten deneme',
        series: [grading.completed],
      }),
      kpi({
        key: 'avg-grading-time',
        label: 'Ortalama değerlendirme süresi',
        value: grading.averageHours,
        unit: ' sa',
        icon: 'clock',
        caption: 'Gönderimden puanlamaya',
        series: grading.gradingDurations,
        higherIsBetter: false,
      }),
      kpi({
        key: 'flagged-items',
        label: 'İnceleme bekleyen madde',
        value: flagged.length,
        icon: 'flag',
        caption: 'Eşik dışında kalan sorular',
        series: flagged.map((analysis) => Math.round(analysis.discrimination * 100)),
        higherIsBetter: false,
      }),
      kpi({
        key: 'avg-discrimination',
        label: 'Ortalama ayırt edicilik',
        value: Math.round(average(analyses.map((a) => a.discrimination * 100))),
        unit: '%',
        icon: 'microscope',
        caption: `Hedef: %${DISCRIMINATION_TARGET * 100}`,
        series: analyses.map((analysis) => Math.round(analysis.discrimination * 100)),
      }),
    ],

    quickActions: buildQuickActions(flagged.length, questions.length),
    notifications: buildNotifications(db, caller.userId),
    recentActivity: buildRecentActivity(db, (event) =>
      questions.some((question) => question.id === event.targetId),
    ),
    statistics: buildStatistics(analyses, questions.length),

    questionTotals: buildQuestionTotals(questions, caller.userId),
    recentlyEdited: toSummaries(
      [...questions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6),
      courseByCode,
    ),
    mostUsed: toSummaries(
      [...questions].sort((a, b) => b.usageCount - a.usageCount).slice(0, 6),
      courseByCode,
    ),
    favoriteQuestions: toSummaries(
      questions.filter((question) => question.favoritedBy.includes(caller.userId)).slice(0, 6),
      courseByCode,
    ),
    typeDistribution: buildTypeDistribution(questions),
    questionDifficultyDistribution: buildQuestionDifficulty(questions),
    outcomeDistribution: buildOutcomeDistribution(scope, questions),

    flaggedItems: buildFlaggedItems(flagged, courseByCode),
    difficultyDistribution: buildBands(
      analyses.map((analysis) => analysis.difficultyIndex),
      DIFFICULTY_BANDS,
    ),
    discriminationDistribution: buildBands(
      analyses.map((analysis) => analysis.discrimination),
      DISCRIMINATION_BANDS,
    ),
    itemScatter: analyses.slice(0, 120).map((analysis) => ({
      x: Math.round(analysis.difficultyIndex * 100),
      y: Math.round(analysis.discrimination * 100),
      code: analysis.questionCode,
    })),
    blueprintCoverage: buildBlueprintCoverage(scope),
    slowestItems: buildSlowestItems(analyses),
    qualityTrend: buildQualityTrend(scope, analyses),
  };
}

/* ── Soru bankası blokları ───────────────────────────────────────────────── */

function buildQuestionTotals(questions: readonly Question[], callerId: string): QuestionBankTotals {
  const countBy = (state: Question['state']) =>
    questions.filter((question) => question.state === state).length;

  return {
    total: questions.length,
    draft: countBy('DRAFT'),
    review: countBy('REVIEW'),
    published: countBy('PUBLISHED'),
    archived: countBy('ARCHIVED'),
    favorites: questions.filter((question) => question.favoritedBy.includes(callerId)).length,
  };
}

function toSummaries(
  questions: readonly Question[],
  courseByCode: ReadonlyMap<string, string>,
): QuestionSummaryEntry[] {
  return questions.map((question) => ({
    id: question.id,
    code: question.code,
    title: question.title,
    typeLabel: QUESTION_TYPE_META[question.type].shortLabel,
    difficultyLabel: DIFFICULTY_LABELS[question.difficulty],
    state: question.state,
    courseCode: courseByCode.get(question.courseId) ?? '',
    versionNumber: question.versionNumber,
    usageCount: question.usageCount,
    updatedAt: question.updatedAt,
  }));
}

/** Soru türü dağılımı — boş türler gösterilmez, grafik gereksiz dilim taşımaz. */
function buildTypeDistribution(questions: readonly Question[]): CategoryValue[] {
  return QUESTION_TYPES.map((type) => ({
    label: QUESTION_TYPE_META[type].label,
    value: questions.filter((question) => question.type === type).length,
  })).filter((entry) => entry.value > 0);
}

function buildQuestionDifficulty(questions: readonly Question[]): CategoryValue[] {
  return DIFFICULTIES.map((difficulty) => ({
    label: DIFFICULTY_LABELS[difficulty],
    value: questions.filter((question) => question.difficulty === difficulty).length,
  }));
}

/**
 * Kazanım başına soru sayısı.
 * En AZ soruya sahip kazanımlar önce gelir — boşluk olan yerler görünür olsun.
 */
function buildOutcomeDistribution(
  scope: DashboardScope,
  questions: readonly Question[],
): RankedEntry[] {
  const courseIds = new Set(scope.courses.map((course) => course.id));
  const outcomes = scope.db
    .collection('outcomes')
    .filter((outcome) => courseIds.has(outcome.courseId));

  const counts = outcomes.map((outcome) => ({
    outcome,
    count: questions.filter((question) => question.outcomeIds.includes(outcome.id)).length,
  }));

  const max = Math.max(1, ...counts.map((entry) => entry.count));

  return counts
    .sort((a, b) => a.count - b.count)
    .slice(0, 8)
    .map(({ outcome, count }) => ({
      id: outcome.id,
      label: outcome.code,
      sublabel: outcome.title,
      value: count,
      unit: 'soru',
      ratio: percent(count, max),
      tone: count === 0 ? 'danger' : count < 3 ? 'warning' : 'success',
    }));
}

/* ── Değerlendirme özeti ─────────────────────────────────────────────────── */

interface GradingSummary {
  readonly activeExams: number;
  readonly awaiting: number;
  readonly regrades: number;
  readonly completed: number;
  readonly averageHours: number;
  /** Bekleme süreleri — KPI kartındaki mini grafiği besler. */
  readonly waitingHours: readonly number[];
  readonly gradingDurations: readonly number[];
}

/**
 * Panelin değerlendirme kartları.
 *
 * Sayılar denemelerin durumundan TÜRETİLİR; ayrı bir sayaç tutulmaz, böylece
 * puanlama yapıldığı anda panel de doğru olur (ADR-017 ile aynı ilke).
 */
function summarizeGrading(scope: DashboardScope, courseIds: ReadonlySet<string>): GradingSummary {
  const attempts = scope.attempts.filter((attempt) => courseIds.has(attempt.courseId));

  const awaiting = attempts.filter((attempt) => attempt.state === 'PENDING_MANUAL');
  const regrades = attempts.filter((attempt) => attempt.state === 'UNDER_REVIEW');
  const completed = attempts.filter(
    (attempt) => attempt.state === 'GRADED' || attempt.state === 'RELEASED',
  );

  // Gönderimden puanlamaya geçen süre; yalnızca puanlanmış denemeler için ölçülebilir.
  const durations = completed
    .filter((attempt) => attempt.gradedAt !== null)
    .map((attempt) =>
      Math.max(
        0,
        Math.round((Date.parse(attempt.gradedAt!) - Date.parse(attempt.submittedAt)) / 3_600_000),
      ),
    );

  return {
    activeExams: scope.exams.filter((exam) => examRuntimeStatus(exam, scope.now) === 'active')
      .length,
    awaiting: awaiting.length,
    regrades: regrades.length,
    completed: completed.length,
    averageHours: durations.length === 0 ? 0 : Math.round(average(durations)),
    waitingHours: awaiting.map((attempt) =>
      Math.max(0, Math.round((scope.now - Date.parse(attempt.submittedAt)) / 3_600_000)),
    ),
    gradingDurations: durations,
  };
}

function buildQuickActions(flaggedCount: number, questionCount: number): QuickAction[] {
  return [
    {
      id: 'item-analysis',
      label: 'Madde analizi',
      description: 'Zorluk ve ayırt edicilik',
      icon: 'microscope',
      link: '/item-analysis',
      badge: flaggedCount > 0 ? flaggedCount : null,
      tone: flaggedCount > 0 ? 'warning' : 'neutral',
    },
    {
      id: 'question-bank',
      label: 'Soru bankası',
      description: `${questionCount} soru`,
      icon: 'circle-help',
      link: '/question-bank',
      badge: null,
      tone: 'primary',
    },
    {
      id: 'grading',
      label: 'Değerlendirme kuyruğu',
      description: 'Elle puanlanacak denemeler',
      icon: 'clipboard-list',
      link: '/grading',
      badge: null,
      tone: 'primary',
    },
    {
      id: 'blueprints',
      label: 'Blueprint yönetimi',
      description: 'Kısıt ve kapsama kontrolü',
      icon: 'file-text',
      link: '/blueprints',
      badge: null,
      tone: 'info',
    },
    {
      id: 'cohort',
      label: 'Cohort analitiği',
      description: 'Gruplar arası karşılaştırma',
      icon: 'users',
      link: '/cohort-analytics',
      badge: null,
      tone: 'neutral',
    },
  ];
}

function buildFlaggedItems(
  flagged: readonly {
    questionId: string;
    questionCode: string;
    questionStem: string;
    courseId: string;
    difficultyIndex: number;
    discrimination: number;
    sampleSize: number;
    flags: readonly string[];
  }[],
  courseByCode: ReadonlyMap<string, string>,
): FlaggedItemEntry[] {
  return flagged
    .slice()
    .sort((a, b) => a.discrimination - b.discrimination)
    .slice(0, 6)
    .map((analysis) => ({
      questionId: analysis.questionId,
      questionCode: analysis.questionCode,
      stem: analysis.questionStem,
      courseCode: courseByCode.get(analysis.courseId) ?? '',
      difficultyIndex: analysis.difficultyIndex,
      discrimination: analysis.discrimination,
      sampleSize: analysis.sampleSize,
      flags: analysis.flags.map(
        (flag) => ITEM_FLAG_LABELS[flag as keyof typeof ITEM_FLAG_LABELS] ?? flag,
      ),
    }));
}

/** Sürekli değerleri tanımlı bantlara dağıtır — histogram girdisi. */
function buildBands(
  values: readonly number[],
  bands: readonly { readonly label: string; readonly max: number }[],
): DistributionBucket[] {
  const total = Math.max(1, values.length);

  return bands.map((band, index) => {
    const min = index === 0 ? -Infinity : bands[index - 1]!.max;
    const count = values.filter((value) => value >= min && value < band.max).length;
    return { label: band.label, count, percent: percent(count, total) };
  });
}

function buildBlueprintCoverage(scope: DashboardScope): RankedEntry[] {
  const blueprints = scope.db
    .collection('blueprints')
    .filter((blueprint) => scope.courses.some((course) => course.id === blueprint.courseId));
  const questions = scope.db.collection('questions').all();
  const courseByCode = new Map(scope.courses.map((course) => [course.id, course.code]));

  return blueprints
    .map((blueprint) => {
      /* Bankada bu satırın istediği kadar YAYINDA soru var mı? */
      const requested = blueprint.rows.filter((row) => row.easy + row.medium + row.hard > 0);
      const satisfied = requested.filter((row) => {
        const available = questions.filter(
          (question) =>
            question.state === 'PUBLISHED' &&
            question.deletedAt === null &&
            question.outcomeIds.includes(row.outcomeId),
        ).length;
        return available >= row.easy + row.medium + row.hard;
      }).length;

      const ratio = percent(satisfied, Math.max(1, requested.length));

      return {
        id: blueprint.id,
        label: courseByCode.get(blueprint.courseId) ?? blueprint.name,
        sublabel: `${satisfied}/${requested.length} kazanım kısıtı karşılanıyor`,
        value: ratio,
        unit: '%',
        ratio,
        tone: ratio >= 100 ? 'success' : ratio >= 60 ? 'warning' : 'danger',
      } satisfies RankedEntry;
    })
    .sort((a, b) => a.value - b.value)
    .slice(0, 6);
}

function buildSlowestItems(
  analyses: readonly {
    questionId: string;
    questionCode: string;
    questionStem: string;
    averageTimeSeconds: number;
  }[],
): RankedEntry[] {
  const slowest = [...analyses]
    .sort((a, b) => b.averageTimeSeconds - a.averageTimeSeconds)
    .slice(0, 6);
  const max = Math.max(1, slowest[0]?.averageTimeSeconds ?? 1);

  return slowest.map((analysis) => ({
    id: analysis.questionId,
    label: analysis.questionCode,
    sublabel: analysis.questionStem.slice(0, 70),
    value: analysis.averageTimeSeconds,
    unit: 'sn',
    ratio: percent(analysis.averageTimeSeconds, max),
    tone: analysis.averageTimeSeconds > 240 ? 'danger' : 'warning',
  }));
}

/** Kalite trendi: sınav tarihlerine göre ortalama ayırt edicilik. */
function buildQualityTrend(
  scope: DashboardScope,
  analyses: readonly { questionId: string; discrimination: number }[],
): TimeSeriesPoint[] {
  const discriminationByQuestion = new Map(
    analyses.map((analysis) => [analysis.questionId, analysis.discrimination] as const),
  );

  const buckets = new Map<string, number[]>();
  for (const exam of scope.exams.filter(
    (item) => examRuntimeStatus(item, scope.now) === 'closed',
  )) {
    const values = exam.questions
      .map((ref) => discriminationByQuestion.get(ref.questionId))
      .filter((value): value is number => value !== undefined);
    if (values.length === 0) continue;

    const key = exam.opensAt.slice(0, 10);
    buckets.set(key, [...(buckets.get(key) ?? []), ...values]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([date, values]) => ({
      date,
      value: Math.round(average(values.map((value) => value * 100))),
      sampleSize: values.length,
    }));
}

function buildStatistics(
  analyses: readonly {
    discrimination: number;
    difficultyIndex: number;
    flags: readonly string[];
  }[],
  questionCount: number,
): StatisticEntry[] {
  const acceptable = analyses.filter(
    (analysis) => analysis.discrimination >= DISCRIMINATION_TARGET,
  ).length;

  return [
    {
      label: 'Hedefi tutturan madde',
      value: `%${percent(acceptable, Math.max(1, analyses.length))}`,
      hint: `Ayırt edicilik ≥ ${DISCRIMINATION_TARGET}`,
    },
    {
      label: 'Analiz kapsamı',
      value: `%${percent(analyses.length, Math.max(1, questionCount))}`,
      hint: 'Yeterli örnekleme sahip sorular',
    },
    {
      label: 'Etkisiz çeldirici içeren madde',
      value: String(analyses.filter((a) => a.flags.includes('weak_distractor')).length),
      hint: 'Seçilme oranı %5 altında',
    },
    {
      label: 'Aşırı kolay / zor madde',
      value: String(
        analyses.filter((a) => a.difficultyIndex > 0.9 || a.difficultyIndex < 0.2).length,
      ),
      hint: 'Ayırt etme gücü düşük',
    },
  ];
}
