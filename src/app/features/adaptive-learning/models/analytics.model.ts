/**
 * Analitik ekranlarının paylaştığı temel veri şekilleri.
 *
 * Grafik bileşenleri doğrudan ApexCharts tiplerine değil, bu nötr şekillere bağlanır;
 * grafik kütüphanesi değişse bile domain sözleşmesi bozulmaz.
 */

export interface CategoryValue {
  readonly label: string;
  readonly value: number;
}

export interface TimeSeriesPoint {
  readonly date: string;
  readonly value: number;
  /** Nokta arkasındaki örneklem büyüklüğü — tooltip'te güven bilgisi olarak kullanılır. */
  readonly sampleSize: number;
}

export interface NamedSeries {
  readonly name: string;
  readonly points: readonly TimeSeriesPoint[];
}

/** İki boyutlu ısı haritası hücresi (kazanım × dönem, eğitmen × ders vb.). */
export interface MatrixCell {
  readonly rowId: string;
  readonly rowLabel: string;
  readonly columnLabel: string;
  readonly value: number | null;
  readonly sampleSize: number;
}

export interface MatrixData {
  readonly columns: readonly string[];
  readonly rows: readonly { readonly id: string; readonly label: string; readonly title: string }[];
  readonly cells: readonly MatrixCell[];
}

/** Sıralı liste görünümleri (en zayıf kazanımlar, en yavaş sorular…). */
export interface RankedEntry {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly value: number;
  readonly unit: string;
  /** 0–100 arası; liste içindeki göreli bar genişliği. */
  readonly ratio: number;
  readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface DistributionBucket {
  readonly label: string;
  readonly count: number;
  readonly percent: number;
}

/** Karşılaştırmalı özet: bir metriğin geçmiş dönemle farkı. */
export interface MetricDelta {
  readonly current: number;
  readonly previous: number;
  readonly changePercent: number;
  readonly direction: 'up' | 'down' | 'flat';
}

export function computeDelta(current: number, previous: number): MetricDelta {
  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: current === 0 ? 0 : 100,
      direction: current === 0 ? 'flat' : 'up',
    };
  }

  const changePercent = Math.round(((current - previous) / previous) * 1000) / 10;
  return {
    current,
    previous,
    changePercent: Math.abs(changePercent),
    direction: changePercent > 0.5 ? 'up' : changePercent < -0.5 ? 'down' : 'flat',
  };
}


/* ── Rapor sözleşmeleri (Sprint 8) ───────────────────────────────────────── */

/**
 * Analitik raporlarının ortak kimlik kartı.
 *
 * Her rapor hangi filtreyle ve kaç kayıt üzerinden üretildiğini TAŞIR. Bir
 * sayının nereden geldiği görünmüyorsa rapor güvenilir değildir; ekranlar bu
 * bilgiyi başlıkta gösterir ve boş sonucu "hata" ile karıştırmaz.
 */
export interface ReportMeta {
  readonly generatedAt: string;
  readonly rangeFrom: string;
  readonly rangeTo: string;
  readonly rangeLabel: string;
  /** Rapora giren kayıt sayısı — sıfırsa ekran boş durum gösterir. */
  readonly sampleSize: number;
  /** Kullanıcının kapsamı gereği veri kısıtlandıysa açıklaması. */
  readonly scopeNote: string | null;
}

/** Genel bakış KPI kartı. */
export interface OverviewMetric {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly icon: string;
  readonly caption: string;
  readonly delta: MetricDelta | null;
  /** Tıklanınca gidilecek detay ekranı (drill-down). */
  readonly link: string | null;
  /**
   * Öğrenci görünümünde kendi değerinin yanına eklenen grup ortalaması.
   *
   * Öğrenci kapsamı `own`'dır — bireysel diğer öğrenci kayıtlarına erişemez;
   * bu alan yalnızca karşılaştırma amacıyla tek bir toplu ortalama taşır.
   */
  readonly peerAverage: number | null;
}

export interface AnalyticsOverview {
  readonly meta: ReportMeta;
  readonly metrics: readonly OverviewMetric[];
  readonly insights: readonly AnalyticsInsight[];
  readonly scoreTrend: readonly TimeSeriesPoint[];
  readonly masteryTrend: readonly TimeSeriesPoint[];
  readonly topPerformers: readonly PerformerRow[];
  readonly atRisk: readonly PerformerRow[];
}

/** Kural tabanlı yorum (BR-54) — `domain/insights.ts` üretir. */
export interface AnalyticsInsight {
  readonly id: string;
  readonly kind: 'positive' | 'warning' | 'critical' | 'neutral';
  readonly title: string;
  readonly evidence: string;
  readonly link: string | null;
}

export interface PerformerRow {
  readonly studentId: string;
  readonly studentName: string;
  readonly cohortName: string;
  readonly masteryPercent: number;
  readonly examAveragePercent: number;
  readonly completionRate: number;
  readonly compositeScore: number;
  readonly riskReasons: readonly string[];
}

/* ── Öğrenci analitiği ───────────────────────────────────────────────────── */

export interface StudentAnalytics {
  readonly meta: ReportMeta;
  readonly studentId: string;
  readonly studentName: string;
  readonly cohortName: string;
  readonly masteryPercent: number;
  readonly completionRate: number;
  readonly quizAveragePercent: number | null;
  readonly examAveragePercent: number | null;
  readonly streakDays: number;
  readonly totalStudyMinutes: number;
  readonly weeklyStudyMinutes: readonly TimeSeriesPoint[];
  readonly dailyStudyMinutes: readonly TimeSeriesPoint[];
  readonly courseProgress: readonly CourseProgressRow[];
  readonly outcomeProgress: readonly OutcomeProgressRow[];
  readonly weakestOutcomes: readonly RankedEntry[];
  readonly strongestOutcomes: readonly RankedEntry[];
  readonly timePerCourse: readonly CategoryValue[];
  readonly recommendationHistory: readonly RecommendationHistoryRow[];
  readonly achievements: readonly AchievementRow[];
}

export interface CourseProgressRow {
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly completionRate: number;
  readonly masteryPercent: number;
  readonly minutesSpent: number;
}

export interface OutcomeProgressRow {
  readonly outcomeId: string;
  readonly outcomeCode: string;
  readonly outcomeTitle: string;
  readonly courseCode: string;
  readonly masteryPercent: number;
  readonly attemptCount: number;
  readonly status: OutcomeStatus;
}

export const OUTCOME_STATUSES = ['strong', 'average', 'needs_improvement'] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const OUTCOME_STATUS_LABELS: Readonly<Record<OutcomeStatus, string>> = {
  strong: 'Güçlü',
  average: 'Orta',
  needs_improvement: 'Geliştirilmeli',
};

export interface RecommendationHistoryRow {
  readonly id: string;
  readonly contentTitle: string;
  readonly outcomeCode: string;
  readonly createdAt: string;
  readonly state: string;
  readonly stateLabel: string;
}

export interface AchievementRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly earnedAt: string;
}

/* ── Cohort analitiği ────────────────────────────────────────────────────── */

export interface CohortAnalytics {
  readonly meta: ReportMeta;
  readonly cohortId: string;
  readonly cohortName: string;
  readonly studentCount: number;
  readonly averageScore: number;
  readonly highestScore: number;
  readonly lowestScore: number;
  readonly medianScore: number;
  readonly standardDeviation: number;
  readonly completionRate: number;
  readonly passRate: number;
  readonly failRate: number;
  /** Katılım verisi gerçek değildir; ekranda örnek olarak işaretlenir. */
  readonly attendancePercent: number;
  readonly scoreDistribution: readonly DistributionBucket[];
  readonly gradeDistribution: readonly DistributionBucket[];
  readonly masteryDistribution: readonly DistributionBucket[];
  readonly weeklyTrend: readonly TimeSeriesPoint[];
  readonly students: readonly PerformerRow[];
}

/* ── Kazanım analitiği ───────────────────────────────────────────────────── */

export interface OutcomeAnalytics {
  /** Tablo bileşeni satır kimliği bekler; kazanım kimliğiyle aynıdır. */
  readonly id: string;
  readonly outcomeId: string;
  readonly outcomeCode: string;
  readonly outcomeTitle: string;
  readonly courseCode: string;
  readonly coveragePercent: number;
  readonly masteryPercent: number;
  readonly examAveragePercent: number;
  readonly relatedCourseCount: number;
  readonly questionCount: number;
  readonly recommendationCount: number;
  readonly status: OutcomeStatus;
}

/* ── Zorluk analitiği ────────────────────────────────────────────────────── */

export interface DifficultyAnalytics {
  readonly meta: ReportMeta;
  readonly distribution: readonly CategoryValue[];
  readonly trend: readonly NamedSeries[];
  readonly byCourse: readonly NamedSeries[];
  readonly byOutcome: readonly CategoryValue[];
  /** Zorluk indeksi ile ayırt edicilik saçılımı — madde kalitesi haritası. */
  readonly scatter: readonly ScatterPoint[];
}

export interface ScatterPoint {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

/* ── Trendler ────────────────────────────────────────────────────────────── */

export interface TrendBundle {
  readonly meta: ReportMeta;
  readonly studyTime: readonly TimeSeriesPoint[];
  readonly examScore: readonly TimeSeriesPoint[];
  readonly completion: readonly TimeSeriesPoint[];
  readonly recommendations: readonly TimeSeriesPoint[];
  readonly mastery: readonly TimeSeriesPoint[];
}

/* ── Öneri analitiği ─────────────────────────────────────────────────────── */

export interface RecommendationAnalytics {
  readonly meta: ReportMeta;
  readonly total: number;
  readonly accepted: number;
  readonly ignored: number;
  readonly completed: number;
  readonly acceptanceRate: MetricDelta;
  /** Kabul edilenlerin ne kadarının tamamlandığı — motorun isabeti. */
  readonly accuracyPercent: number;
  readonly byState: readonly CategoryValue[];
  readonly mostRecommended: readonly RankedEntry[];
  readonly byReason: readonly CategoryValue[];
  readonly trend: readonly TimeSeriesPoint[];
}

/* ── Öğrenme hızı ────────────────────────────────────────────────────────── */

export interface VelocityAnalytics {
  readonly meta: ReportMeta;
  readonly averageItemsPerWeek: number;
  readonly averageMinutesPerItem: number;
  readonly weeklyProgress: readonly TimeSeriesPoint[];
  readonly monthlyProgress: readonly TimeSeriesPoint[];
  readonly fastLearners: readonly VelocityRow[];
  readonly slowLearners: readonly VelocityRow[];
  readonly entries: readonly VelocityRow[];
}

export interface VelocityRow {
  readonly studentId: string;
  readonly studentName: string;
  readonly itemsPerWeek: number;
  readonly averageMinutesPerItem: number;
  readonly completionRate: number;
  readonly masteryPercent: number;
}

/* ── Karşılaştırma ───────────────────────────────────────────────────────── */

export const COMPARE_KINDS = ['student', 'cohort', 'course', 'exam'] as const;
export type CompareKind = (typeof COMPARE_KINDS)[number];

export const COMPARE_KIND_LABELS: Readonly<Record<CompareKind, string>> = {
  student: 'Öğrenci',
  cohort: 'Grup',
  course: 'Ders',
  exam: 'Sınav',
};

/** Karşılaştırmada bir taraf. */
export interface CompareSubject {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly metrics: readonly CompareMetric[];
  readonly trend: readonly TimeSeriesPoint[];
}

export interface CompareMetric {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  /** Ölçüm adedi — 0 ise değer bir ölçüm değil, veri yokluğudur. */
  readonly sampleSize: number;
  /** İlk tarafa göre fark; ilk taraf için her zaman 0. */
  readonly difference: number;
}

export interface ComparisonResult {
  readonly meta: ReportMeta;
  readonly kind: CompareKind;
  readonly subjects: readonly CompareSubject[];
}

/* ── Kayıtlı ve zamanlanmış raporlar ─────────────────────────────────────── */

export const REPORT_WIDGET_KINDS = ['kpi', 'chart', 'table', 'heatmap', 'trend'] as const;
export type ReportWidgetKind = (typeof REPORT_WIDGET_KINDS)[number];

export const REPORT_WIDGET_LABELS: Readonly<Record<ReportWidgetKind, string>> = {
  kpi: 'KPI kartı',
  chart: 'Grafik',
  table: 'Tablo',
  heatmap: 'Isı haritası',
  trend: 'Trend',
};

export interface ReportWidget {
  readonly id: string;
  readonly kind: ReportWidgetKind;
  readonly title: string;
  /** Hangi veri kaynağından besleneceği. */
  readonly source: string;
  readonly span: 1 | 2;
}

export interface SavedReport {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly ownerId: string;
  /** Rapor açıldığında uygulanacak filtreler. */
  readonly filters: Readonly<Record<string, string>>;
  readonly widgets: readonly ReportWidget[];
  readonly schedule: ReportSchedule | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const REPORT_FREQUENCIES = ['weekly', 'monthly'] as const;
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

export const REPORT_FREQUENCY_LABELS: Readonly<Record<ReportFrequency, string>> = {
  weekly: 'Haftalık',
  monthly: 'Aylık',
};

/**
 * Zamanlanmış rapor.
 *
 * Gerçek bir zamanlayıcı YOKTUR: e-posta gönderilmez, iş kuyruğu çalışmaz.
 * Ekran kurumsal bir raporlama akışının nasıl görüneceğini gösterir ve bunu
 * kullanıcıya açıkça söyler.
 */
export interface ReportSchedule {
  readonly frequency: ReportFrequency;
  /** Haftalıkta 1-7 (Pazartesi=1), aylıkta ayın günü. */
  readonly dayOfPeriod: number;
  readonly hour: number;
  readonly recipients: readonly string[];
  readonly enabled: boolean;
  readonly nextRunAt: string;
}

export const REPORT_LIMITS = {
  name: { min: 3, max: 80 },
  description: { max: 300 },
  widgets: { max: 12 },
  recipients: { max: 10 },
} as const;

/*
 * Dışa aktarım biçimleri Sprint 9'da `shared/components/app-export-menu`
 * altına taşındı: dışa aktarım analitiğe özgü değil, tüm liste ekranlarının
 * ortak yeteneğidir (Sprint 9 §12).
 */
