import { BaseEntity } from './common.model';
import { AnswerValue } from './exam-session.model';

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
