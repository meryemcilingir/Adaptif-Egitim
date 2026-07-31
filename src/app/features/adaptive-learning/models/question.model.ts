import {
  AuditableEntity,
  CognitiveLevel,
  Difficulty,
  PUBLISH_STATES,
  PUBLISH_STATE_LABELS,
  PublishState,
} from './common.model';

/**
 * Soru bankası sözleşmesi.
 *
 * Soru TÜRLERİ bir **kayıt tablosu** (`QUESTION_TYPE_META`) üzerinden tanımlanır.
 * Editör, doğrulama, önizleme ve liste rozetleri bu tablodan beslenir; hiçbiri
 * tür adına göre `switch` yazmaz. Yeni bir tür eklemek = tabloya bir satır
 * eklemek (Open/Closed — ADR-034).
 */

/* ── Türler ──────────────────────────────────────────────────────────────── */

export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'numeric',
  'short_answer',
  'open_ended',
  'matching',
  'ordering',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * Cevabın hangi biçimde tutulduğu.
 * Editör hangi alt formu göstereceğine, doğrulayıcı neyi kontrol edeceğine
 * ve önizleme neyi çizeceğine buna bakarak karar verir.
 */
export type AnswerShape = 'options' | 'text' | 'numeric' | 'pairs' | 'sequence' | 'manual';

export interface QuestionTypeMeta {
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: string;
  readonly description: string;
  readonly answerShape: AnswerShape;
  /** Birden fazla doğru seçenek işaretlenebilir mi? */
  readonly multipleCorrect: boolean;
  /** Otomatik puanlanamaz; rubrikle elle değerlendirilir. */
  readonly manuallyGraded: boolean;
  readonly minOptions: number;
  readonly maxOptions: number;
  /** Varsayılan puan — yeni soru oluşturulurken önerilir. */
  readonly defaultPoints: number;
}

export const QUESTION_TYPE_META: Readonly<Record<QuestionType, QuestionTypeMeta>> = {
  single_choice: {
    label: 'Çoktan seçmeli',
    shortLabel: 'ÇS',
    icon: 'circle-check',
    description: 'Tek doğru cevabı olan klasik çoktan seçmeli soru.',
    answerShape: 'options',
    multipleCorrect: false,
    manuallyGraded: false,
    minOptions: 2,
    maxOptions: 8,
    defaultPoints: 4,
  },
  multiple_choice: {
    label: 'Çoklu seçim',
    shortLabel: 'ÇOK',
    icon: 'square-check',
    description: 'Birden fazla doğru cevabın işaretlendiği soru.',
    answerShape: 'options',
    multipleCorrect: true,
    manuallyGraded: false,
    minOptions: 3,
    maxOptions: 8,
    defaultPoints: 6,
  },
  true_false: {
    label: 'Doğru / Yanlış',
    shortLabel: 'D/Y',
    icon: 'check',
    description: 'İki seçenekli doğruluk yargısı.',
    answerShape: 'options',
    multipleCorrect: false,
    manuallyGraded: false,
    minOptions: 2,
    maxOptions: 2,
    defaultPoints: 2,
  },
  numeric: {
    label: 'Sayısal',
    shortLabel: 'SAY',
    icon: 'chart-column',
    description: 'Tolerans aralığıyla değerlendirilen sayısal cevap.',
    answerShape: 'numeric',
    multipleCorrect: false,
    manuallyGraded: false,
    minOptions: 0,
    maxOptions: 0,
    defaultPoints: 5,
  },
  short_answer: {
    label: 'Kısa cevap',
    shortLabel: 'KC',
    icon: 'pen-line',
    description: 'Bir cümlelik serbest cevap; elle değerlendirilir.',
    answerShape: 'text',
    multipleCorrect: false,
    manuallyGraded: true,
    minOptions: 0,
    maxOptions: 0,
    defaultPoints: 6,
  },
  open_ended: {
    label: 'Açık uçlu',
    shortLabel: 'AU',
    icon: 'file-text',
    description: 'Rubrikle puanlanan uzun cevaplı soru.',
    answerShape: 'manual',
    multipleCorrect: false,
    manuallyGraded: true,
    minOptions: 0,
    maxOptions: 0,
    defaultPoints: 10,
  },
  matching: {
    label: 'Eşleştirme',
    shortLabel: 'EŞL',
    icon: 'workflow',
    description: 'Sol ve sağ sütundaki öğelerin eşleştirilmesi.',
    answerShape: 'pairs',
    multipleCorrect: false,
    manuallyGraded: false,
    minOptions: 0,
    maxOptions: 0,
    defaultPoints: 8,
  },
  ordering: {
    label: 'Sıralama',
    shortLabel: 'SIR',
    icon: 'arrow-up-down',
    description: 'Öğelerin doğru sıraya dizilmesi.',
    answerShape: 'sequence',
    multipleCorrect: false,
    manuallyGraded: false,
    minOptions: 0,
    maxOptions: 0,
    defaultPoints: 8,
  },
};

export const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = Object.freeze(
  Object.fromEntries(
    QUESTION_TYPES.map((type) => [type, QUESTION_TYPE_META[type].label]),
  ) as Record<QuestionType, string>,
);

export function isManuallyGraded(type: QuestionType): boolean {
  return QUESTION_TYPE_META[type].manuallyGraded;
}

export function answerShapeOf(type: QuestionType): AnswerShape {
  return QUESTION_TYPE_META[type].answerShape;
}

/* ── Durum ───────────────────────────────────────────────────────────────── */

/**
 * Soru yayın akışı, katalog varlıklarıyla AYNIDIR:
 * `Draft → Review → Published → Archived` (+ arşivden taslağa geri alma).
 *
 * Bu yüzden ayrı bir durum makinesi tanımlanmaz; `domain/publish-workflow.ts`
 * yeniden kullanılır ve `PublishActions` bileşeni soru ekranlarında da çalışır.
 * Yayındaki soru düzenlenemez (BR-02); değiştirmek için "yeni versiyon" akışı vardır.
 */
export type QuestionState = PublishState;

export const QUESTION_STATES = PUBLISH_STATES;
export const QUESTION_STATE_LABELS = PUBLISH_STATE_LABELS;

/* ── Cevap yapıları ──────────────────────────────────────────────────────── */

export interface QuestionOption {
  readonly id: string;
  readonly text: string;
  readonly correct: boolean;
  /** Bu çeldiricinin neden yanlış olduğunu açıklar — öğrenciye geri bildirim. */
  readonly rationale: string;
}

/** Eşleştirme sorusunda bir satır: sol öğe ↔ doğru karşılığı. */
export interface QuestionMatchPair {
  readonly id: string;
  readonly left: string;
  readonly right: string;
}

/** Sıralama sorusunda bir öğe; `order` doğru sıradaki konumudur (1'den başlar). */
export interface QuestionSequenceItem {
  readonly id: string;
  readonly text: string;
  readonly order: number;
}

export const ATTACHMENT_KINDS = ['image', 'link'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_KIND_LABELS: Readonly<Record<AttachmentKind, string>> = {
  image: 'Görsel',
  link: 'Bağlantı',
};

/**
 * Soru eki.
 *
 * Şimdilik görsel ve bağlantı desteklenir; `kind` alanı sayesinde ileride video
 * veya ses eklemek yeni bir tür değeri eklemekten ibarettir (arayüz `kind`e bakar).
 */
export interface QuestionAttachment {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly url: string;
  readonly name: string;
}

/* ── Varlık ──────────────────────────────────────────────────────────────── */

export interface Question extends AuditableEntity {
  readonly code: string;
  /** Listede ve arama sonuçlarında görünen kısa ad. */
  readonly title: string;
  /** Soru gövdesi — zengin metin (güvenli HTML alt kümesi). */
  readonly stem: string;
  readonly type: QuestionType;
  readonly courseId: string;
  /** Soru en az bir kazanıma bağlanır; blueprint seçimi bunun üzerinden çalışır. */
  readonly outcomeIds: readonly string[];
  readonly difficulty: Difficulty;
  /** Bloom taksonomi seviyesi. */
  readonly level: CognitiveLevel;
  readonly points: number;
  /** Tahmini çözüm süresi (saniye). */
  readonly estimatedSolveTimeSeconds: number;
  readonly options: readonly QuestionOption[];
  readonly matchPairs: readonly QuestionMatchPair[];
  readonly sequenceItems: readonly QuestionSequenceItem[];
  /** numeric/short_answer için beklenen cevap. */
  readonly expectedAnswer: string | null;
  readonly numericTolerance: number | null;
  /** Doğru cevabın gerekçesi — öğrenciye sonuç ekranında gösterilir. */
  readonly explanation: string;
  readonly attachments: readonly QuestionAttachment[];
  readonly tags: readonly string[];
  readonly state: QuestionState;
  readonly rubricId: string | null;
  /** İçerik versiyonu ("v3" rozeti). Yeni versiyon açıldıkça artar. */
  readonly versionNumber: number;
  /**
   * Düzenlenmekte olan versiyonun değişiklik notu.
   * "Yeni versiyon oluştur" adımında girilir ve soru yayına alındığında
   * snapshot'a yazılır; böylece kullanıcının gerekçesi kaybolmaz.
   */
  readonly pendingChangeNote: string | null;
  /** Yayınlanmış son versiyon numarası; taslak düzenlemeler bunu değiştirmez. */
  readonly publishedVersion: number | null;
  readonly usageCount: number;
  /** Çok seçimlide kısmi puan verilsin mi (BR-11). */
  readonly allowPartialCredit: boolean;
  /** Bu soruyu favorileyen kullanıcılar — ayrı koleksiyon gerektirmez. */
  readonly favoritedBy: readonly string[];
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  /** Yumuşak silme: kayıt korunur, listelerden düşer (BR-36). */
  readonly deletedAt: string | null;
}

export interface QuestionCreateRequest {
  readonly code: string;
  readonly title: string;
  readonly stem: string;
  readonly type: QuestionType;
  readonly courseId: string;
  readonly outcomeIds: readonly string[];
  readonly difficulty: Difficulty;
  readonly level: CognitiveLevel;
  readonly points: number;
  readonly estimatedSolveTimeSeconds: number;
  readonly options: readonly QuestionOption[];
  readonly matchPairs: readonly QuestionMatchPair[];
  readonly sequenceItems: readonly QuestionSequenceItem[];
  readonly expectedAnswer: string | null;
  readonly numericTolerance: number | null;
  readonly explanation: string;
  readonly attachments: readonly QuestionAttachment[];
  readonly tags: readonly string[];
  readonly allowPartialCredit: boolean;
}

/* ── Versiyonlama ────────────────────────────────────────────────────────── */

/**
 * Sorunun değişmez anlık görüntüsü.
 * Sınavlar soruyu değil, bu snapshot'ı referans alır (BR-03).
 */
export interface QuestionVersion {
  readonly id: string;
  readonly questionId: string;
  readonly versionNumber: number;
  readonly snapshot: Omit<Question, 'usageCount' | 'favoritedBy'>;
  readonly changeNote: string;
  readonly publishedBy: string;
  readonly publishedByName: string;
  readonly publishedAt: string;
}

/** İki versiyon arasındaki tek bir alan farkı. */
export interface VersionFieldDiff {
  readonly field: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  /** Zengin metin alanları arayüzde HTML olarak gösterilir. */
  readonly isRichText: boolean;
}

export interface VersionComparison {
  readonly questionId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly fromUpdatedBy: string;
  readonly toUpdatedBy: string;
  readonly fromUpdatedAt: string;
  readonly toUpdatedAt: string;
  readonly changes: readonly VersionFieldDiff[];
}

/* ── Detay, istatistik ve kullanım ───────────────────────────────────────── */

/**
 * Soru kullanım bilgisi (şimdilik MOCK).
 *
 * Sınav modülü geliştirildiğinde bu blok gerçek `exams`/`attempts` verisinden
 * beslenecek; sözleşme bugünden sabitlendiği için ekran değişmeyecek.
 */
export interface QuestionUsage {
  readonly usageCount: number;
  readonly exams: readonly {
    readonly examId: string;
    readonly examTitle: string;
    readonly courseCode: string;
    readonly opensAt: string;
    readonly state: string;
  }[];
}

export interface QuestionStatistics {
  /** Doğru cevaplama oranı (0–100). Ölçüm yoksa `null`. */
  readonly correctRatePercent: number | null;
  readonly averageSolveTimeSeconds: number | null;
  readonly discrimination: number | null;
  readonly sampleSize: number;
  readonly flags: readonly string[];
}

export interface QuestionOutcomeRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
}

/** Detay ekranının tek çağrıda ihtiyaç duyduğu her şey. */
export interface QuestionDetail {
  readonly question: Question;
  readonly courseCode: string;
  readonly courseName: string;
  readonly outcomes: readonly QuestionOutcomeRef[];
  readonly versions: readonly QuestionVersion[];
  readonly statistics: QuestionStatistics;
  readonly usage: QuestionUsage;
  readonly createdByName: string;
  readonly updatedByName: string;
  readonly isFavorite: boolean;
  /** Yayındaki soru doğrudan düzenlenemez (BR-02). */
  readonly isEditable: boolean;
}

/* ── Liste, filtre ve toplu işlem ────────────────────────────────────────── */

export interface QuestionFilters {
  readonly courseId: string | null;
  readonly outcomeId: string | null;
  readonly type: readonly string[];
  readonly difficulty: readonly string[];
  readonly level: readonly string[];
  readonly state: readonly string[];
  readonly tags: readonly string[];
  readonly favoriteOnly: boolean | null;
  readonly flaggedOnly: boolean | null;
}

export const QUESTION_BULK_ACTIONS = ['publish', 'archive', 'restore', 'delete'] as const;
export type QuestionBulkAction = (typeof QUESTION_BULK_ACTIONS)[number];

export const QUESTION_BULK_ACTION_LABELS: Readonly<Record<QuestionBulkAction, string>> = {
  publish: 'Yayına al',
  archive: 'Arşivle',
  restore: 'Taslağa al',
  delete: 'Sil',
};

/** İçe aktarma önizlemesi — kaydetmeden önce kullanıcıya ne olacağı gösterilir. */
export interface QuestionImportPreview {
  readonly total: number;
  readonly valid: number;
  readonly rows: readonly {
    readonly line: number;
    readonly code: string;
    readonly title: string;
    readonly type: string;
    readonly valid: boolean;
    readonly message: string;
  }[];
}

/* ── Sınırlar ────────────────────────────────────────────────────────────── */

export const QUESTION_LIMITS = {
  code: { min: 3, max: 40 },
  title: { min: 5, max: 150 },
  stem: { max: 3000 },
  explanation: { max: 2000 },
  optionText: { max: 300 },
  rationale: { max: 300 },
  tag: { max: 30 },
  tagCount: { max: 10 },
  points: { min: 1, max: 100 },
  estimatedSolveTimeSeconds: { min: 10, max: 3600 },
  outcomeCount: { min: 1, max: 5 },
  optionCount: { min: 2, max: 8 },
  pairCount: { min: 2, max: 8 },
  sequenceCount: { min: 2, max: 8 },
  attachmentCount: { max: 5 },
  url: { max: 500 },
  changeNote: { max: 200 },
} as const;
