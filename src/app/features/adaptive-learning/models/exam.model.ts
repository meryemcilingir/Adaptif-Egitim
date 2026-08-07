import {
  AuditableEntity,
  PUBLISH_STATES,
  PUBLISH_STATE_LABELS,
  PublishState,
} from './common.model';

/**
 * Sınav sözleşmesi.
 *
 * İki farklı "durum" kavramı bilinçli olarak AYRILMIŞTIR:
 *
 *  · **Yazım durumu** (`state`): Draft → Review → Published → Archived.
 *    Katalog ve soru bankasıyla aynı akış; `domain/publish-workflow.ts` yeniden
 *    kullanılır, üçüncü bir durum makinesi yazılmaz (ADR-041).
 *
 *  · **Çalışma durumu** (`ExamRuntimeStatus`): planlandı / devam ediyor / kapandı.
 *    SAKLANMAZ; yayındaki sınavın tarihlerinden türetilir
 *    (`domain/exam-runtime.ts`). Böylece "sınav başladı mı?" sorusu bir cron
 *    işine veya kayıt güncellemesine bağlı kalmaz.
 */

export type ExamState = PublishState;
export const EXAM_STATES = PUBLISH_STATES;
export const EXAM_STATE_LABELS = PUBLISH_STATE_LABELS;

/* ── Çalışma durumu (türetilir) ─────────────────────────────────────────── */

export const EXAM_RUNTIME_STATUSES = ['not_ready', 'scheduled', 'active', 'closed'] as const;
export type ExamRuntimeStatus = (typeof EXAM_RUNTIME_STATUSES)[number];

export const EXAM_RUNTIME_LABELS: Readonly<Record<ExamRuntimeStatus, string>> = {
  not_ready: 'Yayında değil',
  scheduled: 'Planlandı',
  active: 'Devam ediyor',
  closed: 'Kapandı',
};

/* ── Sorular ─────────────────────────────────────────────────────────────── */

/** Sınav soruya değil, sorunun YAYINLANMIŞ VERSİYONUNA bağlanır (BR-03). */
export interface ExamQuestionRef {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly versionNumber: number;
  readonly order: number;
  readonly points: number;
}

/** Soru seçim ekranı ve önizleme için zenginleştirilmiş satır. */
export interface ExamQuestionView extends ExamQuestionRef {
  readonly code: string;
  readonly title: string;
  readonly stem: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly difficulty: string;
  readonly difficultyLabel: string;
  readonly level: string;
  readonly outcomeIds: readonly string[];
  readonly outcomeCodes: readonly string[];
  readonly estimatedSolveTimeSeconds: number;
  /* Doğrulamanın istemcide de çalışabilmesi için gereken iki bayrak. */
  readonly isPublished: boolean;
  readonly isLatestVersion: boolean;
}

export interface ExamRules {
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
  readonly allowBackNavigation: boolean;
  readonly showResultImmediately: boolean;
  readonly passingScore: number;
  readonly maxAttempts: number;
  /** Süre bitiminde otomatik gönderim. */
  readonly autoSubmit: boolean;
}

export const DEFAULT_EXAM_RULES: ExamRules = {
  shuffleQuestions: true,
  shuffleOptions: false,
  allowBackNavigation: true,
  showResultImmediately: false,
  passingScore: 50,
  maxAttempts: 1,
  autoSubmit: true,
};

/* ── Varlık ──────────────────────────────────────────────────────────────── */

export interface Exam extends AuditableEntity {
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly courseId: string;
  readonly blueprintId: string | null;
  readonly cohortIds: readonly string[];
  readonly durationMinutes: number;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly questions: readonly ExamQuestionRef[];
  readonly rules: ExamRules;
  readonly totalPoints: number;
  readonly state: ExamState;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly attemptCount: number;
}

export interface ExamCreateRequest {
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly courseId: string;
  readonly blueprintId: string | null;
  readonly cohortIds: readonly string[];
  readonly durationMinutes: number;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly questions: readonly ExamQuestionRef[];
  readonly rules: ExamRules;
}

/* ── Doğrulama motoru ────────────────────────────────────────────────────── */

export const VALIDATION_RULES = [
  'blueprint_required',
  'total_points',
  'blueprint_match',
  'outcome_coverage',
  'duplicate_question',
  'unpublished_question',
  'stale_version',
  'duration',
  'unique_title',
  'cohort_required',
  'schedule_window',
  'empty_exam',
] as const;
export type ValidationRule = (typeof VALIDATION_RULES)[number];

export type ValidationSeverity = 'error' | 'warning';

/** Tek bir doğrulama bulgusu. Mesaj kullanıcıya doğrudan gösterilir. */
export interface ValidationIssue {
  readonly rule: ValidationRule;
  readonly severity: ValidationSeverity;
  readonly message: string;
  /** Wizard'da hangi adıma götüreceği — "düzelt" bağlantısı için. */
  readonly step: ExamWizardStep;
}

export interface ValidationResult {
  readonly issues: readonly ValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  /** Hata yoksa sınav yayına alınabilir. */
  readonly publishReady: boolean;
}

/* ── Kısıt paneli ────────────────────────────────────────────────────────── */

/**
 * Wizard boyunca sağda sabit duran panelin verisi.
 *
 * Tamamı istemcide, saf fonksiyonla hesaplanır — her değişiklikte sunucuya
 * gitmek panelin "canlı" hissini bozardı.
 */
export interface ConstraintSnapshot {
  readonly totalQuestions: number;
  readonly targetQuestions: number;
  readonly totalPoints: number;
  readonly targetPoints: number;
  readonly durationMinutes: number;
  readonly estimatedMinutes: number;
  readonly difficulty: readonly {
    readonly difficulty: string;
    readonly label: string;
    readonly count: number;
    readonly target: number;
  }[];
  readonly coveredOutcomes: number;
  readonly targetOutcomes: number;
  readonly duplicateCount: number;
  readonly validation: ValidationResult;
}

/* ── Wizard ──────────────────────────────────────────────────────────────── */

export const EXAM_WIZARD_STEPS = [
  'information',
  'blueprint',
  'constraints',
  'questions',
  'validation',
  'preview',
  'publish',
] as const;
export type ExamWizardStep = (typeof EXAM_WIZARD_STEPS)[number];

export const EXAM_WIZARD_STEP_LABELS: Readonly<Record<ExamWizardStep, string>> = {
  information: 'Sınav bilgisi',
  blueprint: 'Blueprint',
  constraints: 'Kısıtlar',
  questions: 'Soru seçimi',
  validation: 'Doğrulama',
  preview: 'Önizleme',
  publish: 'Yayınla',
};

export const EXAM_WIZARD_STEP_HINTS: Readonly<Record<ExamWizardStep, string>> = {
  information: 'Ad, ders, süre, tarih aralığı ve yönerge.',
  blueprint: 'Ölçme planını seçin; sorular buna göre seçilecek.',
  constraints: 'Puanlama ve oturum kuralları.',
  questions: 'Otomatik seçim yapın veya soruları elle düzenleyin.',
  validation: 'Kural ihlallerini giderin.',
  preview: 'Öğrencinin göreceği hâli kontrol edin.',
  publish: 'Sınavı yayına alın.',
};

/* ── Detay ───────────────────────────────────────────────────────────────── */

export interface ExamPublishEvent {
  readonly id: string;
  readonly action: string;
  readonly actionLabel: string;
  readonly actorName: string;
  readonly reason: string | null;
  readonly at: string;
}

/** Sınav istatistikleri — sınav oturumu modülü gelene kadar deneme verisinden. */
export interface ExamStatistics {
  readonly attemptCount: number;
  readonly averageScorePercent: number | null;
  readonly passRatePercent: number | null;
  readonly averageDurationMinutes: number | null;
}

export interface ExamDetail {
  readonly exam: Exam;
  readonly courseCode: string;
  readonly courseName: string;
  readonly cohortNames: readonly string[];
  readonly blueprintName: string | null;
  readonly blueprintSummary: {
    readonly totalQuestions: number;
    readonly targetTotalPoints: number;
    readonly coveragePercent: number;
  } | null;
  readonly questions: readonly ExamQuestionView[];
  readonly outcomes: readonly { readonly id: string; readonly code: string; readonly title: string }[];
  readonly constraints: ConstraintSnapshot;
  readonly publishHistory: readonly ExamPublishEvent[];
  readonly statistics: ExamStatistics;
  readonly runtimeStatus: ExamRuntimeStatus;
  readonly isEditable: boolean;
}

export interface ExamFilters {
  readonly courseId: string | null;
  readonly cohortId: string | null;
  readonly blueprintId: string | null;
  readonly state: readonly string[];
}

export const EXAM_LIMITS = {
  title: { min: 5, max: 150 },
  description: { max: 500 },
  instructions: { max: 2000 },
  durationMinutes: { min: 5, max: 480 },
  passingScore: { min: 0, max: 100 },
  maxAttempts: { min: 1, max: 5 },
  questionCount: { min: 1, max: 200 },
} as const;
