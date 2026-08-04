import { BaseEntity } from './common.model';
import { QuestionAttachment, QuestionType } from './question.model';

export const SESSION_STATES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'SUBMITTED',
  'EXPIRED',
  'TERMINATED',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SESSION_STATE_LABELS: Readonly<Record<SessionState, string>> = {
  NOT_STARTED: 'Başlamadı',
  IN_PROGRESS: 'Devam ediyor',
  PAUSED: 'Bağlantı bekleniyor',
  SUBMITTED: 'Gönderildi',
  EXPIRED: 'Süresi doldu',
  TERMINATED: 'Sonlandırıldı',
};

export const SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PAUSED', 'SUBMITTED', 'EXPIRED', 'TERMINATED'],
  PAUSED: ['IN_PROGRESS', 'EXPIRED', 'TERMINATED'],
  SUBMITTED: [],
  EXPIRED: [],
  TERMINATED: [],
};

export const CONNECTION_STATES = ['online', 'unstable', 'offline'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface ExamSession extends BaseEntity {
  readonly token: string;
  readonly examId: string;
  readonly studentId: string;
  readonly state: SessionState;
  /** Sunucu referans zamanı — sayaç istemci saatinden bağımsız hesaplanır (BR-07). */
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly serverNow: string;
  readonly remainingMs: number;
  readonly connection: ConnectionState;
  readonly lastHeartbeatAt: string | null;
  readonly flaggedQuestionIds: readonly string[];
  readonly visitedQuestionIds: readonly string[];
  readonly currentQuestionIndex: number;
  readonly submittedAt: string | null;
  readonly terminationReason: string | null;
  /**
   * Oturum boyunca olan biten. Ayrı bir koleksiyon tutulmaz: olaylar yalnızca
   * kendi oturumları bağlamında anlamlıdır ve deneme detayı da bu oturuma
   * `sessionToken` üzerinden ulaşır (ADR-051).
   */
  readonly timeline: readonly SessionTimelineEvent[];
  readonly integrity: IntegritySignals;
  /** Süre dolduğu için sistem tarafından mı gönderildi? */
  readonly autoSubmitted: boolean;
}

/* ── Autosave ───────────────────────────────────────────────────────────── */

export const SYNC_STATES = ['LOCAL', 'SYNCING', 'SYNCED', 'CONFLICT', 'FAILED'] as const;
export type SyncState = (typeof SYNC_STATES)[number];

/**
 * Cevap değeri soru türüne göre farklı biçimde tutulur.
 *
 * `kind` doğrudan `QUESTION_TYPE_META[type].answerShape`'ten türetilir
 * (`answerKindOf`), böylece yeni bir soru türü eklendiğinde cevap tarafında
 * ayrıca `switch` yazılması gerekmez.
 */
export type AnswerValue =
  | { readonly kind: 'choice'; readonly optionIds: readonly string[] }
  | { readonly kind: 'boolean'; readonly value: boolean | null }
  | { readonly kind: 'numeric'; readonly value: number | null }
  | { readonly kind: 'text'; readonly value: string }
  /** Eşleştirme: öğrencinin kurduğu sol → sağ bağları. */
  | { readonly kind: 'pairs'; readonly pairs: readonly AnswerPair[] }
  /** Sıralama: öğrencinin verdiği sıradaki öğe kimlikleri. */
  | { readonly kind: 'sequence'; readonly itemIds: readonly string[] };

export interface AnswerPair {
  readonly leftId: string;
  readonly rightId: string;
}

export interface AnswerDraft {
  readonly id: string;
  readonly sessionToken: string;
  readonly questionId: string;
  readonly value: AnswerValue;
  /**
   * Autosave versiyonu. Sunucudaki versiyon bundan büyükse cevap sessizce
   * ezilmez; kullanıcıya çakışma gösterilir (BR-09).
   */
  readonly version: number;
  readonly syncState: SyncState;
  readonly updatedAt: string;
  readonly savedAt: string | null;
}

/** 409 durumunda kullanıcının seçim yapabilmesi için iki taraf birlikte döner. */
export interface AnswerConflict {
  readonly questionId: string;
  readonly localValue: AnswerValue;
  readonly serverValue: AnswerValue;
  readonly localVersion: number;
  readonly serverVersion: number;
  readonly serverUpdatedAt: string;
}

export interface StartSessionRequest {
  readonly examId: string;
}

export interface SaveAnswerRequest {
  readonly questionId: string;
  readonly value: AnswerValue;
  readonly version: number;
  /** İstemcinin cevabı ürettiği an — geç gönderim tespiti için (BR-08). */
  readonly answeredAt: string;
}

export function emptyAnswerValue(kind: AnswerValue['kind']): AnswerValue {
  switch (kind) {
    case 'choice':
      return { kind: 'choice', optionIds: [] };
    case 'boolean':
      return { kind: 'boolean', value: null };
    case 'numeric':
      return { kind: 'numeric', value: null };
    case 'text':
      return { kind: 'text', value: '' };
    case 'pairs':
      return { kind: 'pairs', pairs: [] };
    case 'sequence':
      return { kind: 'sequence', itemIds: [] };
  }
}

export function isAnswered(value: AnswerValue): boolean {
  switch (value.kind) {
    case 'choice':
      return value.optionIds.length > 0;
    case 'boolean':
      return value.value !== null;
    case 'numeric':
      return value.value !== null;
    case 'text':
      return value.value.trim().length > 0;
    case 'pairs':
      return value.pairs.length > 0;
    case 'sequence':
      return value.itemIds.length > 0;
  }
}

/* ── Zaman çizelgesi ─────────────────────────────────────────────────────── */

export const TIMELINE_KINDS = [
  'started',
  'answered',
  'updated',
  'flagged',
  'unflagged',
  'autosave',
  'offline',
  'reconnected',
  'warning',
  'submitted',
  'expired',
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_LABELS: Readonly<Record<TimelineKind, string>> = {
  started: 'Sınav başlatıldı',
  answered: 'Soru cevaplandı',
  updated: 'Cevap güncellendi',
  flagged: 'Soru işaretlendi',
  unflagged: 'İşaret kaldırıldı',
  autosave: 'Otomatik kayıt',
  offline: 'Bağlantı kesildi',
  reconnected: 'Yeniden bağlanıldı',
  warning: 'Uyarı verildi',
  submitted: 'Sınav teslim edildi',
  expired: 'Süre doldu',
};

/**
 * Oturum boyunca olan biteni anlatan tek kayıt tipi.
 *
 * Autosave geçmişi, offline/reconnect olayları ve cevap değişiklikleri AYRI
 * listelerde tutulmaz; hepsi `kind` ile ayrışan tek bir akıştır. Böylece deneme
 * detayındaki zaman çizelgesi tek kaynaktan çizilir ve olaylar arasındaki sıra
 * her zaman doğrudur.
 */
export interface SessionTimelineEvent {
  readonly id: string;
  readonly kind: TimelineKind;
  readonly at: string;
  readonly questionId: string | null;
  /** Kullanıcıya gösterilecek ek açıklama (örn. "3 cevap senkronlandı"). */
  readonly detail: string;
}

/* ── Bütünlük göstergeleri (yalnızca arayüz) ─────────────────────────────── */

/**
 * Sınav bütünlüğü sinyalleri.
 *
 * Gerçek bir gözetim (proctoring) YAPILMAZ: bunlar tarayıcı olaylarından
 * toplanan bilgilendirici sayaçlardır ve hiçbir yaptırımı yoktur. Sınavı
 * kesmek veya puanı etkilemek için kullanılmazlar.
 */
export interface IntegritySignals {
  readonly fullscreen: boolean;
  readonly tabSwitchCount: number;
  readonly warningCount: number;
  readonly connection: ConnectionState;
  readonly offlineCount: number;
  readonly lastWarningAt: string | null;
}

export function emptyIntegrity(): IntegritySignals {
  return {
    fullscreen: false,
    tabSwitchCount: 0,
    warningCount: 0,
    connection: 'online',
    offlineCount: 0,
    lastWarningAt: null,
  };
}

/* ── Bekleme odası ───────────────────────────────────────────────────────── */

export const WAITING_PHASES = ['too_early', 'ready', 'in_progress', 'closed', 'used'] as const;
export type WaitingPhase = (typeof WAITING_PHASES)[number];

/**
 * Sınav başlamadan önce gösterilen özet.
 *
 * `phase` sunucunun kararıdır; istemci saatine göre yeniden hesaplanmaz.
 * Sayaç `serverNow` ile `opensAt` farkından yürür (BR-07).
 */
export interface WaitingRoomView {
  readonly examId: string;
  readonly examTitle: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly durationMinutes: number;
  readonly questionCount: number;
  readonly totalPoints: number;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly serverNow: string;
  readonly phase: WaitingPhase;
  readonly instructions: string;
  readonly rules: readonly string[];
  readonly maxAttempts: number;
  readonly usedAttempts: number;
  /** Yarım kalmış oturum varsa buradan devam edilir. */
  readonly resumableToken: string | null;
}

/* ── Teslim ──────────────────────────────────────────────────────────────── */

/** Gönder düğmesine basınca gösterilen özet — onay alınmadan teslim yapılmaz. */
export interface SubmitSummary {
  readonly totalQuestions: number;
  readonly answered: number;
  readonly unanswered: number;
  readonly flagged: number;
  readonly unansweredNumbers: readonly number[];
  readonly flaggedNumbers: readonly number[];
}

/** Teslim sonrası ekranı — puan BİLİNÇLİ olarak dönmez (BR-49). */
export interface SubmissionReceipt {
  readonly attemptId: string;
  readonly examTitle: string;
  readonly courseCode: string;
  readonly submittedAt: string;
  readonly durationSeconds: number;
  readonly answered: number;
  readonly totalQuestions: number;
  readonly autoSubmitted: boolean;
}

/* ── Oturum görünümü ─────────────────────────────────────────────────────── */

/** Oturumda gösterilecek soru — doğru cevap alanları TAŞINMAZ. */
export interface SessionQuestionView {
  readonly questionId: string;
  readonly order: number;
  readonly title: string;
  readonly stem: string;
  readonly type: QuestionType;
  readonly typeLabel: string;
  readonly answerKind: AnswerValue['kind'];
  readonly points: number;
  readonly options: readonly SessionOptionView[];
  readonly matchPairs: readonly SessionMatchView[];
  readonly sequenceItems: readonly SessionSequenceView[];
  readonly attachments: readonly QuestionAttachment[];
  readonly multipleCorrect: boolean;
  readonly numericTolerance: number | null;
}

export interface SessionOptionView {
  readonly id: string;
  readonly text: string;
}

export interface SessionMatchView {
  readonly id: string;
  readonly left: string;
  /** Sağ taraf KARIŞTIRILMIŞ olarak gelir; eşleşme bilgisi istemciye sızmaz. */
  readonly rightChoices: readonly SessionOptionView[];
}

export interface SessionSequenceView {
  readonly id: string;
  readonly text: string;
}

/** Oturum ekranının tek çağrıda ihtiyaç duyduğu her şey. */
export interface SessionView {
  readonly session: ExamSession;
  readonly examTitle: string;
  readonly courseCode: string;
  readonly instructions: string;
  readonly totalPoints: number;
  readonly questions: readonly SessionQuestionView[];
  readonly answers: readonly AnswerDraft[];
  readonly integrity: IntegritySignals;
  readonly timeline: readonly SessionTimelineEvent[];
  readonly lastSavedAt: string | null;
}

export interface SubmitSessionRequest {
  /** Süre dolduğu için sistem tarafından gönderildiyse true. */
  readonly autoSubmitted: boolean;
}

export interface HeartbeatRequest {
  readonly connection: ConnectionState;
  readonly fullscreen: boolean;
  readonly tabSwitchCount: number;
}
