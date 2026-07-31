import { ContentProgressState, ContentType } from './content-item.model';
import { Difficulty } from './common.model';
import { RecommendationReason } from './recommendation.model';

/**
 * Öğrenciye özel, sıralı çalışma planı.
 *
 * Türetilmiş veridir — saklanmaz, istek anında `domain/learning-path.builder.ts`
 * tarafından önkoşul ilişkileri, tamamlanan içerikler ve ustalık skorlarından
 * üretilir (ADR-017).
 */

export interface LearningPathStep {
  readonly order: number;
  readonly contentId: string;
  readonly title: string;
  readonly type: ContentType;
  readonly difficulty: Difficulty;
  readonly estimatedDurationMinutes: number;
  readonly state: ContentProgressState;
  readonly completionPercent: number;
  /** Kilitliyse hangi kazanımlar eksik (BR-20). */
  readonly blockedByOutcomeIds: readonly string[];
  readonly blockedByLabel: string | null;
  /** Bu adımın neden burada olduğunu açıklayan gerekçeler. */
  readonly reasons: readonly RecommendationReason[];
}

/** Öğrenme yolu kazanım bloklarına ayrılır: her kazanım kendi içeriklerini taşır. */
export interface LearningPathSection {
  readonly outcomeId: string;
  readonly outcomeCode: string;
  readonly outcomeTitle: string;
  readonly masteryScore: number | null;
  readonly state: ContentProgressState;
  readonly steps: readonly LearningPathStep[];
  readonly completedSteps: number;
  readonly totalSteps: number;
}

export interface LearningPath {
  readonly studentId: string;
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly sections: readonly LearningPathSection[];
  /** Sıradaki adım — "Devam et" butonu buraya götürür. */
  readonly currentStep: LearningPathStep | null;
  readonly currentOutcomeCode: string | null;
  readonly totalMinutes: number;
  readonly completedMinutes: number;
  readonly completionPercent: number;
  readonly generatedAt: string;
}

/** Öğrencinin tüm derslerdeki yolları — öğrenme yolu ekranının kökü. */
export interface LearningPathOverview {
  readonly paths: readonly LearningPath[];
  readonly generatedAt: string;
}
