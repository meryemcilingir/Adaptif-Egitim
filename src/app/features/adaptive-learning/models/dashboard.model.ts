import { Role } from '../../../core/auth/permission.model';
import { AppIconName } from '../../../shared/icons/app-icons';
import {
  CategoryValue,
  DistributionBucket,
  MatrixData,
  NamedSeries,
  RankedEntry,
  TimeSeriesPoint,
} from './analytics.model';
import { LearningPath } from './learning-path.model';
import { Notification } from './notification.model';
import { Recommendation } from './recommendation.model';

/**
 * Dashboard veri sözleşmesi.
 *
 * Her rol KENDİ payload tipine sahiptir ve hepsi `role` alanı üzerinden
 * ayrıştırılan bir birleşim (discriminated union) oluşturur. Böylece:
 *  · sunucu her role yalnızca anlamlı veriyi gönderir,
 *  · şablonda `@switch (snapshot.role)` ile tip güvenli daraltma yapılır,
 *  · yeni bir rol eklemek mevcut rollerin kodunu değiştirmez (Open/Closed).
 *
 * Ortak parçalar (`DashboardCommon`) tüm rollerde aynıdır; bu sayede KPI satırı,
 * hızlı işlemler, bildirimler ve etkinlik akışı TEK bileşen kümesiyle render edilir.
 */

/* ── Ortak yapı taşları ─────────────────────────────────────────────────── */

export type TrendDirection = 'up' | 'down' | 'flat';
export type CardTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface KpiCard {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly trendPercent: number;
  readonly direction: TrendDirection;
  /** Artışın olumlu sayılıp sayılmayacağı metriğe göre değişir. */
  readonly higherIsBetter: boolean;
  readonly icon: AppIconName;
  readonly caption: string;
  readonly sparkline: readonly number[];
}

export interface ProgressCard {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly caption: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger';
}

export interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: AppIconName;
  readonly link: string;
  /** Rozet sayısı (bekleyen iş sayısı gibi). */
  readonly badge: number | null;
  readonly tone: CardTone;
}

export interface ActivityEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly at: string;
  readonly icon: AppIconName;
  readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';
  readonly actor: string;
}

export interface StatisticEntry {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}

export interface UpcomingExamCard {
  readonly id: string;
  readonly title: string;
  readonly courseCode: string;
  readonly opensAt: string;
  readonly durationMinutes: number;
  readonly questionCount: number;
  readonly state: string;
  readonly cohortNames: readonly string[];
}

export interface RecentContentEntry {
  readonly id: string;
  readonly title: string;
  readonly courseCode: string;
  readonly format: string;
  readonly icon: AppIconName;
  readonly progressPercent: number;
  readonly lastAccessedAt: string;
  readonly durationMinutes: number;
}

export interface DashboardCommon {
  readonly generatedAt: string;
  readonly headline: string;
  readonly subline: string;
  readonly kpis: readonly KpiCard[];
  readonly quickActions: readonly QuickAction[];
  readonly notifications: readonly Notification[];
  readonly recentActivity: readonly ActivityEntry[];
  readonly statistics: readonly StatisticEntry[];
}

/* ── Rol bazlı payload'lar ──────────────────────────────────────────────── */

/* ── Öğrenci paneli bileşenleri ─────────────────────────────────────────── */

/** Panelin en üstündeki karşılama kartı. */
export interface HeroCard {
  readonly greeting: string;
  readonly headline: string;
  readonly message: string;
  /** Devam edilecek içerik — "Devam et" butonu buraya götürür. */
  readonly continueContentId: string | null;
  readonly continueCourseId: string | null;
  readonly progressPercent: number;
}

/** Kaldığı yerden devam kartı. */
export interface ContinueLearningCard {
  readonly contentId: string;
  readonly title: string;
  readonly type: string;
  readonly icon: AppIconName;
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly outcomeCode: string;
  readonly outcomeTitle: string;
  readonly progressPercent: number;
  readonly estimatedDurationMinutes: number;
  readonly lastAccessedAt: string | null;
}

/** Bugünün hedef görevleri. */
export interface DailyGoalTask {
  readonly contentId: string;
  readonly title: string;
  readonly type: string;
  readonly icon: AppIconName;
  readonly estimatedDurationMinutes: number;
  readonly completed: boolean;
}

export interface DailyGoal {
  readonly tasks: readonly DailyGoalTask[];
  readonly targetMinutes: number;
  readonly completedMinutes: number;
  readonly completedTasks: number;
}

/** Çalışma serisi kartı. */
export interface StreakCard {
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly atRisk: boolean;
  readonly lastStudyDate: string | null;
}

/** Haftalık ilerleme özeti + günlük grafik. */
export interface WeeklyProgress {
  readonly days: readonly {
    readonly label: string;
    readonly minutes: number;
    readonly completedCount: number;
  }[];
  readonly totalMinutes: number;
  readonly completedCount: number;
  readonly quizSuccessPercent: number;
}

/** Deneyim puanı göstergesi. */
export interface ExperienceCard {
  readonly totalXp: number;
  readonly level: number;
  readonly xpIntoLevel: number;
  readonly xpForNextLevel: number;
  readonly percentToNextLevel: number;
}

export interface AchievementCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: AppIconName;
  readonly unlocked: boolean;
  readonly progressPercent: number;
}

/** Güçlü kazanım + sonraki adım önerisi. */
export interface OutcomeHighlight {
  readonly outcomeId: string;
  readonly outcomeCode: string;
  readonly outcomeTitle: string;
  readonly courseCode: string;
  readonly masteryScore: number;
  /** Kullanıcıya gösterilen kısa yönlendirme. */
  readonly advice: string;
  /** Yönlendirmenin hedefi (içerik veya kazanım). */
  readonly targetContentId: string | null;
}

export interface StudentDashboard extends DashboardCommon {
  readonly role: 'STUDENT';
  readonly hero: HeroCard;
  readonly continueLearning: ContinueLearningCard | null;
  readonly dailyGoal: DailyGoal;
  readonly streak: StreakCard;
  readonly experience: ExperienceCard;
  readonly weeklyProgress: WeeklyProgress;
  readonly achievements: readonly AchievementCard[];
  readonly progress: readonly ProgressCard[];
  readonly masteryTrend: readonly TimeSeriesPoint[];
  readonly outcomeDistribution: readonly CategoryValue[];
  readonly masteryHeatmap: MatrixData;
  readonly recommendations: readonly Recommendation[];
  /** Öğrencinin aktif dersindeki yol — stepper görünümü. */
  readonly currentPath: LearningPath | null;
  readonly upcomingExams: readonly UpcomingExamCard[];
  readonly recentContent: readonly RecentContentEntry[];
  readonly weakOutcomes: readonly OutcomeHighlight[];
  readonly strongOutcomes: readonly OutcomeHighlight[];
  /** Hiç çalışma verisi yoksa arayüz yönlendirici boş durum gösterir. */
  readonly isNewLearner: boolean;
}

export interface GradingQueueEntry {
  readonly attemptId: string;
  readonly studentName: string;
  readonly examTitle: string;
  readonly courseCode: string;
  readonly pendingAnswers: number;
  readonly submittedAt: string;
  /** Bekleme süresi uzadıkça arayüzde uyarı tonu artar. */
  readonly waitingDays: number;
}

export interface CourseProgressEntry {
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly studentCount: number;
  readonly averageMastery: number;
  readonly completionPercent: number;
  readonly publishedQuestionCount: number;
}

export interface InstructorDashboard extends DashboardCommon {
  readonly role: 'INSTRUCTOR';
  readonly progress: readonly ProgressCard[];
  readonly gradingQueue: readonly GradingQueueEntry[];
  readonly courseProgress: readonly CourseProgressEntry[];
  readonly classPerformance: readonly NamedSeries[];
  readonly outcomeCoverage: readonly RankedEntry[];
  readonly atRiskStudents: readonly RankedEntry[];
  readonly upcomingExams: readonly UpcomingExamCard[];
  readonly questionStates: readonly DistributionBucket[];
}

export interface FlaggedItemEntry {
  readonly questionId: string;
  readonly questionCode: string;
  readonly stem: string;
  readonly courseCode: string;
  readonly difficultyIndex: number;
  readonly discrimination: number;
  readonly sampleSize: number;
  readonly flags: readonly string[];
}

/** Soru bankası büyüklükleri — ölçme uzmanı panelinin üst satırı. */
export interface QuestionBankTotals {
  readonly total: number;
  readonly draft: number;
  readonly review: number;
  readonly published: number;
  readonly archived: number;
  readonly favorites: number;
}

/** Panelde listelenen kısa soru kartı (son düzenlenen / en çok kullanılan). */
export interface QuestionSummaryEntry {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly difficultyLabel: string;
  readonly state: string;
  readonly courseCode: string;
  readonly versionNumber: number;
  readonly usageCount: number;
  readonly updatedAt: string;
}

export interface MeasurementDashboard extends DashboardCommon {
  readonly role: 'ASSESSMENT_SPECIALIST';
  readonly questionTotals: QuestionBankTotals;
  readonly recentlyEdited: readonly QuestionSummaryEntry[];
  readonly mostUsed: readonly QuestionSummaryEntry[];
  readonly favoriteQuestions: readonly QuestionSummaryEntry[];
  readonly typeDistribution: readonly CategoryValue[];
  readonly questionDifficultyDistribution: readonly CategoryValue[];
  readonly outcomeDistribution: readonly RankedEntry[];
  readonly flaggedItems: readonly FlaggedItemEntry[];
  readonly difficultyDistribution: readonly DistributionBucket[];
  readonly discriminationDistribution: readonly DistributionBucket[];
  /** Zorluk (x) ve ayırt edicilik (y) düzlemindeki madde bulutu. */
  readonly itemScatter: readonly {
    readonly x: number;
    readonly y: number;
    readonly code: string;
  }[];
  readonly blueprintCoverage: readonly RankedEntry[];
  readonly slowestItems: readonly RankedEntry[];
  readonly qualityTrend: readonly TimeSeriesPoint[];
}

export interface ProgramCourseHealth {
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly state: string;
  readonly instructorName: string;
  readonly outcomeCount: number;
  readonly publishedOutcomeCount: number;
  readonly averageMastery: number;
  readonly atRiskCount: number;
}

/** Katalog büyüklükleri — program yöneticisi panelinin üst satırı. */
export interface CatalogTotals {
  readonly programs: number;
  readonly courses: number;
  readonly outcomes: number;
  readonly draft: number;
  readonly published: number;
}

export interface ProgramManagerDashboard extends DashboardCommon {
  readonly role: 'PROGRAM_MANAGER';
  readonly progress: readonly ProgressCard[];
  readonly totals: CatalogTotals;
  readonly courseHealth: readonly ProgramCourseHealth[];
  /** Program başına ders sayısı — katalog dengesini gösterir. */
  readonly programDistribution: readonly CategoryValue[];
  /** Derslerin yayın durumu dağılımı. */
  readonly publishPipeline: readonly DistributionBucket[];
  /** Kazanımların zorluk ve bilişsel seviye dağılımı. */
  readonly outcomeStatistics: readonly DistributionBucket[];
  readonly cohortComparison: readonly CategoryValue[];
  readonly cohortMasteryMatrix: MatrixData;
  readonly programTrend: readonly NamedSeries[];
  readonly upcomingExams: readonly UpcomingExamCard[];
}

export interface ObserverDashboard extends DashboardCommon {
  readonly role: 'OBSERVER';
  readonly cohortComparison: readonly CategoryValue[];
  readonly completionTrend: readonly TimeSeriesPoint[];
  readonly outcomeCoverage: readonly RankedEntry[];
  readonly upcomingExams: readonly UpcomingExamCard[];
  /** Gizlilik eşiği nedeniyle gizlenen cohort adları (BR-17). */
  readonly suppressedCohorts: readonly string[];
  readonly minCohortSize: number;
}

export interface SystemHealthEntry {
  readonly label: string;
  readonly value: string;
  readonly tone: CardTone;
  readonly hint: string;
}

export interface AdminDashboard extends DashboardCommon {
  readonly role: 'PLATFORM_ADMIN';
  readonly usersByRole: readonly CategoryValue[];
  readonly auditByAction: readonly CategoryValue[];
  readonly auditTrend: readonly TimeSeriesPoint[];
  readonly systemHealth: readonly SystemHealthEntry[];
  readonly recentAudit: readonly ActivityEntry[];
  readonly storageBreakdown: readonly RankedEntry[];
}

export type DashboardSnapshot =
  | StudentDashboard
  | InstructorDashboard
  | MeasurementDashboard
  | ProgramManagerDashboard
  | ObserverDashboard
  | AdminDashboard;

/** Rol → dashboard payload tipi eşlemesi (facade ve testlerde kullanılır). */
export type DashboardFor<R extends Role> = Extract<DashboardSnapshot, { role: R }>;
