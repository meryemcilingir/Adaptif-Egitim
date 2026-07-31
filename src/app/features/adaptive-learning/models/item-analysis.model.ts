import { Difficulty } from './common.model';
import { QuestionType } from './question.model';

/** Bir çeldiricinin ne kadar seçildiği ve kimler tarafından seçildiği. */
export interface DistractorStat {
  readonly optionId: string;
  readonly optionText: string;
  readonly correct: boolean;
  readonly selectedCount: number;
  readonly selectedPercent: number;
  /** Üst %27'lik dilimden bu seçeneği işaretleyenlerin oranı. */
  readonly upperGroupPercent: number;
  readonly lowerGroupPercent: number;
}

export const ITEM_FLAGS = [
  'too_easy',
  'too_hard',
  'low_discrimination',
  'weak_distractor',
] as const;
export type ItemFlag = (typeof ITEM_FLAGS)[number];

export const ITEM_FLAG_LABELS: Readonly<Record<ItemFlag, string>> = {
  too_easy: 'Çok kolay',
  too_hard: 'Çok zor',
  low_discrimination: 'Düşük ayırt edicilik',
  weak_distractor: 'Etkisiz çeldirici',
};

/**
 * Madde analizi (BR-19).
 * `difficultyIndex` (p): doğru cevaplayan oranı — yüksek = kolay.
 * `discrimination` (D): üst grup başarısı − alt grup başarısı.
 */
export interface ItemAnalysis {
  readonly id: string;
  readonly questionId: string;
  readonly questionCode: string;
  readonly questionStem: string;
  readonly questionType: QuestionType;
  readonly courseId: string;
  readonly outcomeId: string;
  readonly outcomeCode: string;
  readonly declaredDifficulty: Difficulty;
  readonly sampleSize: number;
  readonly difficultyIndex: number;
  readonly discrimination: number;
  readonly averageTimeSeconds: number;
  readonly distractors: readonly DistractorStat[];
  readonly flags: readonly ItemFlag[];
  readonly calculatedAt: string;
}

export interface ItemAnalysisFilters {
  readonly courseId: string | null;
  readonly outcomeId: string | null;
  readonly flags: readonly string[];
  readonly type: readonly string[];
}

/* ── Cohort karşılaştırma ───────────────────────────────────────────────── */

export interface CohortMetric {
  readonly cohortId: string;
  readonly cohortName: string;
  readonly studentCount: number;
  readonly averageMastery: number;
  readonly averageScore: number;
  readonly completionPercent: number;
  readonly atRiskCount: number;
  /**
   * Cohort minimum eşiğin altındaysa bireysel karşılaştırma gizlenir (BR-17).
   * Bu bayrak arayüzde açıkça bilgi mesajı olarak gösterilir.
   */
  readonly privacySuppressed: boolean;
}

export interface CohortComparison {
  readonly metrics: readonly CohortMetric[];
  readonly outcomeBreakdown: readonly {
    readonly outcomeId: string;
    readonly outcomeCode: string;
    readonly scores: Readonly<Record<string, number | null>>;
  }[];
  readonly minCohortSize: number;
}
