import { BaseEntity } from './common.model';

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
}

/* ── Autosave ───────────────────────────────────────────────────────────── */

export const SYNC_STATES = ['LOCAL', 'SYNCING', 'SYNCED', 'CONFLICT', 'FAILED'] as const;
export type SyncState = (typeof SYNC_STATES)[number];

export const SYNC_STATE_LABELS: Readonly<Record<SyncState, string>> = {
  LOCAL: 'Kaydedilmedi',
  SYNCING: 'Kaydediliyor',
  SYNCED: 'Kaydedildi',
  CONFLICT: 'Çakışma',
  FAILED: 'Kaydedilemedi',
};

/** Cevap değeri soru türüne göre farklı biçimde tutulur. */
export type AnswerValue =
  | { readonly kind: 'choice'; readonly optionIds: readonly string[] }
  | { readonly kind: 'boolean'; readonly value: boolean | null }
  | { readonly kind: 'numeric'; readonly value: number | null }
  | { readonly kind: 'text'; readonly value: string };

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
  }
}
