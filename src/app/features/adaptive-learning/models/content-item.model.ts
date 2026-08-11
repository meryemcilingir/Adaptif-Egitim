import { AuditableEntity, CognitiveLevel, Difficulty, PublishState } from './common.model';

/* ── İçerik türleri ──────────────────────────────────────────────────────── */

export const CONTENT_TYPES = [
  'video',
  'pdf',
  'presentation',
  'quiz',
  'assignment',
  'external_link',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Readonly<Record<ContentType, string>> = {
  video: 'Video',
  pdf: 'PDF',
  presentation: 'Sunum',
  quiz: 'Kısa sınav',
  assignment: 'Ödev',
  external_link: 'Dış bağlantı',
};

export const CONTENT_TYPE_ICONS: Readonly<Record<ContentType, string>> = {
  video: 'circle-play',
  pdf: 'file-text',
  presentation: 'chart-column',
  quiz: 'list-checks',
  assignment: 'pen-line',
  external_link: 'external-link',
};

/**
 * Öğrenme yolunda türlerin doğal sırası.
 *
 * Bir kazanım içinde önce izlenir/okunur, sonra ölçülür: video → sunum → pdf →
 * quiz → ödev → dış kaynak. Öneri motoru ve öğrenme yolu bu sırayı kullanır
 * (LP-01) — böylece öğrenciye rastgele değil, pedagojik bir sıra sunulur.
 */
export const CONTENT_TYPE_ORDER: Readonly<Record<ContentType, number>> = {
  video: 0,
  presentation: 1,
  pdf: 2,
  quiz: 3,
  assignment: 4,
  external_link: 5,
};

/** Değerlendirme içeriği mi? Quiz başarısı öneri kurallarını tetikler. */
export function isAssessmentContent(type: ContentType): boolean {
  return type === 'quiz' || type === 'assignment';
}

/* ── Varlık ──────────────────────────────────────────────────────────────── */

export interface ContentItem extends AuditableEntity {
  readonly title: string;
  readonly description: string;
  readonly thumbnailUrl: string | null;
  readonly type: ContentType;
  readonly courseId: string;
  /** İçerik tek bir kazanıma bağlanır — öğrenme yolu bu ilişki üzerinden kurulur. */
  readonly outcomeId: string;
  readonly difficulty: Difficulty;
  readonly level: CognitiveLevel;
  readonly estimatedDurationMinutes: number;
  readonly tags: readonly string[];
  readonly state: PublishState;
  readonly authorId: string;
  readonly authorName: string;
  /** Dış bağlantı ve dosya tabanlı içerikler için kaynak adresi. */
  readonly resourceUrl: string | null;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
}

export interface ContentCreateRequest {
  readonly title: string;
  readonly description: string;
  readonly thumbnailUrl: string | null;
  readonly type: ContentType;
  readonly courseId: string;
  readonly outcomeId: string;
  readonly difficulty: Difficulty;
  readonly level: CognitiveLevel;
  readonly estimatedDurationMinutes: number;
  readonly tags: readonly string[];
  readonly resourceUrl: string | null;
}

export interface ContentFilters {
  readonly courseId: string | null;
  readonly outcomeId: string | null;
  readonly type: readonly string[];
  readonly difficulty: readonly string[];
  readonly state: readonly string[];
  readonly tags: readonly string[];
}

export const CONTENT_LIMITS = {
  title: { min: 3, max: 100 },
  description: { max: 500 },
  tag: { max: 30 },
  tagCount: { max: 10 },
  estimatedDurationMinutes: { min: 1, max: 600 },
  url: { max: 500 },
} as const;

/* ── İlerleme ────────────────────────────────────────────────────────────── */

export const CONTENT_PROGRESS_STATES = [
  'not_started',
  'in_progress',
  'completed',
  'locked',
  'recommended',
] as const;
export type ContentProgressState = (typeof CONTENT_PROGRESS_STATES)[number];

export const CONTENT_PROGRESS_LABELS: Readonly<Record<ContentProgressState, string>> = {
  not_started: 'Başlanmadı',
  in_progress: 'Devam ediyor',
  completed: 'Tamamlandı',
  locked: 'Kilitli',
  recommended: 'Önerilen',
};

export interface ContentProgress {
  readonly id: string;
  readonly contentId: string;
  readonly studentId: string;
  readonly state: ContentProgressState;
  /** 0–100. `completed` durumunda daima 100'dür. */
  readonly completionPercent: number;
  readonly spentMinutes: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly lastAccessedAt: string | null;
  /** Quiz/ödev içeriklerinde son alınan puan yüzdesi. */
  readonly scorePercent: number | null;
}

/** İlerleme kaydetme isteği — öğrenci ekranından gönderilir. */
export interface ContentProgressRequest {
  readonly completionPercent: number;
  readonly spentMinutes: number;
  readonly scorePercent?: number | null;
}

/* ── Detay ve toplu işlem sözleşmeleri ──────────────────────────────────── */

export interface OutcomeRefSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
}

/**
 * Aynı kazanımdaki bir "kardeş" içerik + öğrencinin oradaki durumu.
 *
 * Ham `ContentItem` yetmiyordu: öğrenci listede hangisini bitirdiğini (tik) ve
 * hangisinin sıradaki adım olduğunu göremiyordu. İlerleme sunucuda zaten
 * biliniyor, bu yüzden istemcinin ayrıca ilerleme sorgusu atmasına gerek
 * kalmadan aynı yanıta iliştirilir.
 */
export interface RelatedContent {
  readonly id: string;
  readonly title: string;
  readonly type: ContentType;
  readonly estimatedDurationMinutes: number;
  readonly state: ContentProgressState;
  /** Kazanımın önkoşulu tamamlanmadığı için açılmadıysa `true` (BR-20). */
  readonly locked: boolean;
}

/** İçerik detay ekranının tek çağrıda ihtiyaç duyduğu her şey. */
export interface ContentDetail {
  readonly content: ContentItem;
  readonly courseCode: string;
  readonly courseName: string;
  readonly outcome: OutcomeRefSummary | null;
  readonly prerequisiteOutcomes: readonly OutcomeRefSummary[];
  readonly progress: ContentProgress;
  /** Önkoşulu tamamlanmadığı için erişim kapalı mı (BR-20). */
  readonly locked: boolean;
  readonly lockedByLabel: string | null;
  /** Aynı kazanımdaki diğer içerikler — pedagojik sırayla, ilerleme durumlarıyla. */
  readonly relatedContents: readonly RelatedContent[];
  /**
   * Bu içerik bitince çalışılacak SIRADAKİ içerik (aynı kazanım içinde).
   *
   * Sunucuda hesaplanır: pedagojik sırada, henüz tamamlanmamış ve kilitli
   * olmayan ilk kardeş. Kazanımdaki her şey bitmişse `null` — ekran o zaman
   * kullanıcıyı öğrenme yoluna geri gönderir.
   */
  readonly nextContent: RelatedContent | null;
}

export const CONTENT_BULK_ACTIONS = ['publish', 'archive', 'draft', 'delete'] as const;
export type ContentBulkAction = (typeof CONTENT_BULK_ACTIONS)[number];

export const CONTENT_BULK_ACTION_LABELS: Readonly<Record<ContentBulkAction, string>> = {
  publish: 'Yayına al',
  archive: 'Arşivle',
  draft: 'Taslağa al',
  delete: 'Sil',
};

/** Toplu işlem sonucu — başarısızlar gerekçesiyle döner, sessizce yutulmaz. */
export interface BulkActionResult {
  readonly succeeded: readonly string[];
  readonly failed: readonly {
    readonly id: string;
    readonly title: string;
    readonly reason: string;
  }[];
}

/** Kaydı olmayan içerikler için varsayılan ilerleme (kayıt şişmesini önler). */
export function defaultProgress(contentId: string, studentId: string): ContentProgress {
  return {
    id: `prg_virtual_${contentId}`,
    contentId,
    studentId,
    state: 'not_started',
    completionPercent: 0,
    spentMinutes: 0,
    startedAt: null,
    completedAt: null,
    lastAccessedAt: null,
    scorePercent: null,
  };
}
