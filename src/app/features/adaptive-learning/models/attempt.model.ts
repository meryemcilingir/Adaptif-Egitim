import { BaseEntity } from './common.model';
import {
  AnswerValue,
  IntegritySignals,
  SessionTimelineEvent,
} from './exam-session.model';
import { Rubric } from './rubric.model';

export const ATTEMPT_STATES = [
  'SUBMITTED',
  'AUTO_GRADED',
  'PENDING_MANUAL',
  'GRADED',
  'RELEASED',
  'UNDER_REVIEW',
] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

export const ATTEMPT_STATE_LABELS: Readonly<Record<AttemptState, string>> = {
  SUBMITTED: 'Gönderildi',
  AUTO_GRADED: 'Otomatik puanlandı',
  PENDING_MANUAL: 'Değerlendirme bekliyor',
  GRADED: 'Puanlandı',
  RELEASED: 'Sonuç açıklandı',
  UNDER_REVIEW: 'İtiraz incelemesi',
};

export const ATTEMPT_TRANSITIONS: Readonly<Record<AttemptState, readonly AttemptState[]>> = {
  SUBMITTED: ['AUTO_GRADED'],
  AUTO_GRADED: ['PENDING_MANUAL', 'GRADED'],
  PENDING_MANUAL: ['GRADED'],
  GRADED: ['RELEASED', 'UNDER_REVIEW'],
  RELEASED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['GRADED'],
};

export interface AttemptAnswer {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly value: AnswerValue;
  readonly maxPoints: number;
  readonly awardedPoints: number;
  /** Otomatik puanlandıysa true; açık uçlularda rubrikten gelir. */
  readonly autoGraded: boolean;
  readonly correct: boolean | null;
  readonly gradedBy: string | null;
  readonly feedback: string;
  readonly rubricScores: readonly RubricCriterionScore[];
  readonly timeSpentSeconds: number;
}

export interface RubricCriterionScore {
  readonly criterionId: string;
  readonly levelId: string;
  readonly points: number;
  readonly comment: string;
}

/** Puan değişikliği geçmişi — gerekçe zorunludur (BR-12). */
export interface ScoreChange {
  readonly id: string;
  readonly questionId: string | null;
  readonly previousScore: number;
  readonly newScore: number;
  readonly reason: string;
  readonly changedBy: string;
  readonly changedByName: string;
  readonly changedAt: string;
}

export interface Attempt extends BaseEntity {
  readonly examId: string;
  readonly examTitle: string;
  readonly courseId: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly cohortId: string;
  readonly sessionToken: string;
  readonly attemptNumber: number;
  readonly state: AttemptState;
  readonly answers: readonly AttemptAnswer[];
  readonly totalScore: number;
  readonly maxScore: number;
  readonly scorePercent: number;
  readonly passed: boolean;
  readonly startedAt: string;
  readonly submittedAt: string;
  readonly gradedAt: string | null;
  readonly releasedAt: string | null;
  readonly durationSeconds: number;
  readonly scoreHistory: readonly ScoreChange[];
}

export interface AttemptFilters {
  readonly examId: string | null;
  readonly courseId: string | null;
  readonly cohortId: string | null;
  readonly state: readonly string[];
  readonly studentId: string | null;
}

export interface GradeAnswerInput {
  readonly questionId: string;
  readonly awardedPoints: number;
  readonly feedback: string;
  readonly rubricScores: readonly RubricCriterionScore[];
}

export interface GradeAttemptRequest {
  readonly answers: readonly GradeAnswerInput[];
  /** Mevcut puanı değiştiren her işlemde zorunlu (BR-12). */
  readonly reason: string;
  readonly expectedVersion: number;
}

/* ── Değerlendirme ───────────────────────────────────────────────────────── */

/**
 * Tek bir değerlendiricinin bir soruya verdiği puan.
 *
 * Nihai puan `AttemptAnswer.awardedPoints`'tir; bu kayıtlar KİMİN ne verdiğini
 * saklar. İki uzman farklı puan verdiyse çakışma buradan tespit edilir (BR-52);
 * ayrı bir "çakışma" koleksiyonu tutulmaz, çünkü çakışma türetilen bir bilgidir.
 */
export interface GraderScore {
  readonly graderId: string;
  readonly graderName: string;
  readonly points: number;
  readonly feedback: string;
  readonly rubricScores: readonly RubricCriterionScore[];
  readonly gradedAt: string;
}

/** Tek soruda birden fazla değerlendiricinin puanları ayrıştığında. */
export interface GradingConflict {
  readonly questionId: string;
  readonly questionTitle: string;
  readonly scores: readonly GraderScore[];
  readonly minPoints: number;
  readonly maxPoints: number;
  readonly spread: number;
  /** Nihai karar verildiyse dolu — kim, kaç puanda karar kıldı. */
  readonly resolvedPoints: number | null;
  readonly resolvedBy: string | null;
  readonly resolvedReason: string | null;
}

export const REGRADE_STATES = ['REQUESTED', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const;
export type RegradeState = (typeof REGRADE_STATES)[number];

export const REGRADE_STATE_LABELS: Readonly<Record<RegradeState, string>> = {
  REQUESTED: 'Talep edildi',
  IN_REVIEW: 'İnceleniyor',
  RESOLVED: 'Sonuçlandı',
  REJECTED: 'Reddedildi',
};

export interface RegradeRecord {
  readonly id: string;
  readonly attemptId: string;
  readonly questionId: string | null;
  readonly state: RegradeState;
  readonly reason: string;
  readonly previousScore: number;
  readonly newScore: number | null;
  readonly requestedBy: string;
  readonly requestedByName: string;
  readonly requestedAt: string;
  readonly resolvedBy: string | null;
  readonly resolvedByName: string | null;
  readonly resolvedAt: string | null;
  readonly resolutionNote: string;
}

/* ── Ekran görünümleri ───────────────────────────────────────────────────── */

/** Değerlendirme ekranında bir cevabın ihtiyaç duyduğu her şey. */
export interface GradingAnswerView {
  readonly questionId: string;
  readonly order: number;
  readonly code: string;
  readonly title: string;
  readonly stem: string;
  readonly typeLabel: string;
  readonly answerKind: AnswerValue['kind'];
  readonly value: AnswerValue;
  /** Öğrencinin cevabının okunabilir hâli — seçenek metinleri çözülmüş olarak. */
  readonly displayAnswer: string;
  readonly expectedAnswer: string;
  readonly maxPoints: number;
  readonly awardedPoints: number;
  readonly autoGraded: boolean;
  readonly correct: boolean | null;
  readonly feedback: string;
  readonly rubricScores: readonly RubricCriterionScore[];
  readonly rubricId: string | null;
  readonly graderScores: readonly GraderScore[];
}

export interface AttemptDetail {
  readonly attempt: Attempt;
  readonly studentEmail: string;
  readonly cohortName: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly answers: readonly GradingAnswerView[];
  readonly rubrics: readonly Rubric[];
  readonly timeline: readonly SessionTimelineEvent[];
  readonly integrity: IntegritySignals;
  readonly conflicts: readonly GradingConflict[];
  readonly regrades: readonly RegradeRecord[];
  /** Elle puanlanması gereken ve henüz puanlanmamış cevap sayısı. */
  readonly pendingManualCount: number;
  readonly isGradable: boolean;
}

/**
 * Değerlendirme kuyruğundaki bir satır.
 *
 * `id` denemenin kimliğidir: ortak liste altyapısı (`EntityStore`, `AppTable`)
 * satır kimliğini bu alandan okur, bu yüzden ayrı bir `attemptId` tutulmaz.
 */
export interface GradingQueueItem {
  readonly id: string;
  readonly examTitle: string;
  readonly courseCode: string;
  readonly studentName: string;
  readonly cohortName: string;
  readonly submittedAt: string;
  readonly state: AttemptState;
  readonly pendingManualCount: number;
  readonly conflictCount: number;
  readonly openRegradeCount: number;
  readonly totalScore: number;
  readonly maxScore: number;
  /** Gönderimden bu yana geçen süre — kuyrukta bekleme göstergesi. */
  readonly waitingHours: number;
}

/* ── İstekler ────────────────────────────────────────────────────────────── */

export interface RegradeRequest {
  readonly questionId: string | null;
  readonly reason: string;
  readonly newScore: number | null;
}

export interface ResolveConflictRequest {
  readonly questionId: string;
  readonly points: number;
  readonly reason: string;
}

/**
 * Metin alanı sınırları.
 *
 * Reactive Forms doğrulayıcıları, karakter sayaçları ve sunucu doğrulaması aynı
 * sayıları okur; biri değişince diğeri ayrışamaz (ADR-024).
 */
export const GRADING_LIMITS = {
  feedback: { max: 1000 },
  regradeReason: { max: 500 },
  comment: { max: 500 },
  resolutionNote: { max: 500 },
} as const;
