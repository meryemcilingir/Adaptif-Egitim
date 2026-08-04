import { Semester } from '../domain/academic-term.rules';

/**
 * Tüm ana modellerin ortak temeli.
 * Şartname gereği ana modellerde id, createdAt, updatedAt, version ve durum alanı bulunur.
 */
export interface BaseEntity {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** İyimser kilitleme sayacı — çakışma tespiti bu alanla yapılır (BR-09). */
  readonly version: number;
}

export interface AuditableEntity extends BaseEntity {
  readonly createdBy: string;
  readonly updatedBy: string;
}

/** Bloom taksonomisine yakın, sade bilişsel seviye ölçeği. */
export const COGNITIVE_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate'] as const;
export type CognitiveLevel = (typeof COGNITIVE_LEVELS)[number];

export const COGNITIVE_LEVEL_LABELS: Readonly<Record<CognitiveLevel, string>> = {
  remember: 'Hatırlama',
  understand: 'Anlama',
  apply: 'Uygulama',
  analyze: 'Analiz',
  evaluate: 'Değerlendirme',
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'Kolay',
  medium: 'Orta',
  hard: 'Zor',
};

/** Ustalık hesabında zorluk ağırlığı — zor soruyu bilmek daha çok değer taşır (BR-14). */
export const DIFFICULTY_WEIGHTS: Readonly<Record<Difficulty, number>> = {
  easy: 0.8,
  medium: 1,
  hard: 1.3,
};

export const PUBLISH_STATES = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export type PublishState = (typeof PUBLISH_STATES)[number];

export const PUBLISH_STATE_LABELS: Readonly<Record<PublishState, string>> = {
  DRAFT: 'Taslak',
  REVIEW: 'İncelemede',
  PUBLISHED: 'Yayında',
  ARCHIVED: 'Arşiv',
};

/* `Program` kendi dosyasındadır: `program.model.ts` */

/* Dönem kuralları `domain/academic-term.rules.ts` içindedir. */

/**
 * Akademik dönem.
 *
 * `active` alanı YOKTUR: durum takvimden türetilir (`termStatus()`), saklanmaz.
 * Bayrak tutulsaydı bitiş tarihi geçen bir dönem hâlâ "aktif" görünür ve iki
 * kayıt birden aktif işaretlenebilirdi (ADR-065). Arşiv ise gerçek bir karardır,
 * bu yüzden alandan okunur.
 */
export interface Term {
  readonly id: string;
  /** `2025-2026 Bahar` — `termName()` ile üretilir, elle yazılmaz. */
  readonly name: string;
  readonly academicYear: string;
  readonly semester: Semester;
  readonly startDate: string;
  readonly endDate: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface Cohort {
  readonly id: string;
  readonly name: string;
  readonly programId: string;
  readonly termId: string;
  readonly studentIds: readonly string[];
}

/** Grup seçim listeleri için hafif gösterim — öğrenci listesi taşınmaz. */
export interface CohortSummary {
  readonly id: string;
  readonly name: string;
  readonly programId: string;
  readonly termId: string;
  readonly studentCount: number;
}

export interface Person {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
}
