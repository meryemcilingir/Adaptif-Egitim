import { RubricCriterionScore } from '../models/attempt.model';
import { Rubric, RubricCriterion } from '../models/rubric.model';

/**
 * Rubrik hesaplaması (BR-13).
 *
 * Rubrik puanı ELLE girilmez: değerlendirici her kriter için bir seviye seçer,
 * toplam bu seçimlerden hesaplanır. Böylece "kriterlerin toplamı ile verilen puan
 * tutmuyor" durumu yapısal olarak imkânsızdır.
 *
 * Ham rubrik puanı, sorunun puanına ÖLÇEKLENİR: aynı rubrik 10 puanlık da 25
 * puanlık da bir soruda kullanılabilsin diye.
 */

export interface RubricEvaluation {
  /** Rubrik ölçeğindeki ham toplam. */
  readonly rawPoints: number;
  readonly maxRawPoints: number;
  /** Sorunun puanına ölçeklenmiş nihai puan. */
  readonly scaledPoints: number;
  readonly percent: number;
  /** Henüz seviye seçilmemiş kriterler — eksik değerlendirme uyarısı. */
  readonly missingCriterionIds: readonly string[];
  readonly complete: boolean;
}

/** Bir kriterin ulaşabileceği en yüksek puan (ağırlık dahil). */
export function criterionMaxPoints(criterion: RubricCriterion): number {
  const best = criterion.levels.reduce((max, level) => Math.max(max, level.points), 0);
  return best * criterion.weight;
}

export function rubricRawMax(rubric: Rubric): number {
  return rubric.criteria.reduce((total, criterion) => total + criterionMaxPoints(criterion), 0);
}

/**
 * Seçilen seviyelerden puanı hesaplar.
 *
 * Bilinmeyen kriter veya seviye kimlikleri YOK SAYILIR; eski bir rubrik
 * sürümüyle kaydedilmiş puanlar hesabı bozmasın diye. Eksik kriterler
 * `missingCriterionIds` ile raporlanır, sessizce sıfır sayılmaz.
 */
export function evaluateRubric(
  rubric: Rubric,
  scores: readonly RubricCriterionScore[],
  questionPoints: number,
): RubricEvaluation {
  const scoreByCriterion = new Map(scores.map((score) => [score.criterionId, score]));

  let rawPoints = 0;
  const missing: string[] = [];

  for (const criterion of rubric.criteria) {
    const score = scoreByCriterion.get(criterion.id);
    const level = score ? criterion.levels.find((item) => item.id === score.levelId) : undefined;

    if (!level) {
      missing.push(criterion.id);
      continue;
    }

    rawPoints += level.points * criterion.weight;
  }

  const maxRawPoints = rubricRawMax(rubric);
  const percent = maxRawPoints === 0 ? 0 : rawPoints / maxRawPoints;

  return {
    rawPoints: round2(rawPoints),
    maxRawPoints: round2(maxRawPoints),
    scaledPoints: round2(questionPoints * percent),
    percent: Math.round(percent * 100),
    missingCriterionIds: missing,
    complete: missing.length === 0,
  };
}

/**
 * Kriter puanı için seçilebilecek seviyeleri normalize eder.
 *
 * `RubricCriterionScore.points` gösterim kolaylığı için saklanır ama KAYNAK
 * DEĞİLDİR — seviye kimliğinden yeniden türetilir. Aksi hâlde istemciden gelen
 * bir puan, seçilen seviyeyle çelişebilirdi.
 */
export function normalizeScores(
  rubric: Rubric,
  scores: readonly RubricCriterionScore[],
): RubricCriterionScore[] {
  const normalized: RubricCriterionScore[] = [];

  for (const score of scores) {
    const criterion = rubric.criteria.find((item) => item.id === score.criterionId);
    const level = criterion?.levels.find((item) => item.id === score.levelId);
    if (!criterion || !level) continue;

    normalized.push({
      criterionId: criterion.id,
      levelId: level.id,
      points: round2(level.points * criterion.weight),
      comment: score.comment,
    });
  }

  return normalized;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
