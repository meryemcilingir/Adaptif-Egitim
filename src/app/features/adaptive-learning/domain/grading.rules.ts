import {
  Attempt,
  AttemptAnswer,
  GRADING_LIMITS,
  GraderScore,
  GradingConflict,
} from '../models/attempt.model';

/**
 * Değerlendirme kuralları (BR-12, BR-50…BR-53).
 *
 * Saf fonksiyonlardır; mock sunucu bunları yazma anında, ekranlar da form
 * doğrulamasında çağırır. "Kaydet" düğmesi aktifken sunucunun reddetmesi bu
 * sayede mümkün değildir.
 */

export interface GradingIssue {
  readonly field: 'awardedPoints' | 'feedback' | 'reason' | 'rubric' | 'state';
  readonly questionId: string | null;
  readonly message: string;
}

/** Bir puanın geçerli olup olmadığı — negatif olamaz, soru puanını aşamaz. */
export function validateScore(
  awardedPoints: number,
  maxPoints: number,
  questionId: string,
): GradingIssue | null {
  if (!Number.isFinite(awardedPoints)) {
    return { field: 'awardedPoints', questionId, message: 'Puan sayısal olmalıdır.' };
  }

  if (awardedPoints < 0) {
    return { field: 'awardedPoints', questionId, message: 'Puan negatif olamaz.' };
  }

  if (awardedPoints > maxPoints) {
    return {
      field: 'awardedPoints',
      questionId,
      message: `Puan, sorunun en yüksek puanını (${maxPoints}) geçemez.`,
    };
  }

  return null;
}

export interface GradeInput {
  readonly questionId: string;
  readonly awardedPoints: number;
  readonly feedback: string;
  readonly maxPoints: number;
  readonly previousPoints: number;
  /**
   * Bu cevap DAHA ÖNCE puanlandı mı?
   *
   * İlk puanlamada `previousPoints` sıfırdır ve puan vermek doğal olarak bir
   * "değişiklik" üretir; bunu gerekçe gerektiren bir düzeltme saymak,
   * değerlendiriciyi her soruda anlamsız metin yazmaya iter ve gerekçe alanını
   * değersizleştirir. Bu yüzden gerekçe yalnızca zaten puanlanmış bir cevabın
   * puanı değişirken zorunludur (BR-12).
   */
  readonly previouslyGraded: boolean;
}

/**
 * Değerlendirme kaydını doğrular.
 *
 * Gerekçe yalnızca MEVCUT bir puan değiştiğinde zorunludur (BR-12). İlk kez
 * puanlanan bir cevap için gerekçe istemek, değerlendiriciyi her soruda anlamsız
 * metin yazmaya zorlar ve gerekçe alanını değersizleştirirdi.
 */
export function validateGrading(
  inputs: readonly GradeInput[],
  reason: string,
  attemptState: Attempt['state'],
): readonly GradingIssue[] {
  const issues: GradingIssue[] = [];

  if (attemptState === 'RELEASED') {
    issues.push({
      field: 'state',
      questionId: null,
      message: 'Sonucu açıklanmış deneme doğrudan puanlanamaz; önce itiraz incelemesi açılmalıdır.',
    });
  }

  for (const input of inputs) {
    const scoreIssue = validateScore(input.awardedPoints, input.maxPoints, input.questionId);
    if (scoreIssue) issues.push(scoreIssue);

    if (input.feedback.length > GRADING_LIMITS.feedback.max) {
      issues.push({
        field: 'feedback',
        questionId: input.questionId,
        message: `Geri bildirim en fazla ${GRADING_LIMITS.feedback.max} karakter olabilir.`,
      });
    }
  }

  if (changesExistingScore(inputs) && reason.trim().length < 10) {
    issues.push({
      field: 'reason',
      questionId: null,
      message: 'Mevcut bir puanı değiştirirken en az 10 karakterlik gerekçe zorunludur.',
    });
  }

  if (reason.length > GRADING_LIMITS.regradeReason.max) {
    issues.push({
      field: 'reason',
      questionId: null,
      message: `Gerekçe en fazla ${GRADING_LIMITS.regradeReason.max} karakter olabilir.`,
    });
  }

  return issues;
}

/** Girdilerden herhangi biri daha önce VERİLMİŞ bir puanı değiştiriyor mu? */
export function changesExistingScore(inputs: readonly GradeInput[]): boolean {
  return inputs.some(
    (input) => input.previouslyGraded && input.awardedPoints !== input.previousPoints,
  );
}

/* ── Çakışma ─────────────────────────────────────────────────────────────── */

/**
 * Aynı soruya birden fazla değerlendirici farklı puan verdiyse çakışma vardır.
 *
 * Çakışma SAKLANMAZ, puan kayıtlarından türetilir (ADR-050): ayrı bir koleksiyon
 * tutmak, iki kaynağın ayrışması riskini doğururdu. Eşik yok — bir puanlık fark
 * bile gösterilir; ne kadarının önemli olduğuna değerlendirici karar verir.
 */
export function detectConflict(
  questionId: string,
  questionTitle: string,
  scores: readonly GraderScore[],
  resolved: { points: number; by: string; reason: string } | null,
): GradingConflict | null {
  const distinctGraders = new Map(scores.map((score) => [score.graderId, score]));
  if (distinctGraders.size < 2) return null;

  const points = [...distinctGraders.values()].map((score) => score.points);
  const minPoints = Math.min(...points);
  const maxPoints = Math.max(...points);
  if (minPoints === maxPoints) return null;

  return {
    questionId,
    questionTitle,
    scores: [...distinctGraders.values()],
    minPoints,
    maxPoints,
    spread: Math.round((maxPoints - minPoints) * 100) / 100,
    resolvedPoints: resolved?.points ?? null,
    resolvedBy: resolved?.by ?? null,
    resolvedReason: resolved?.reason ?? null,
  };
}

/* ── Toplamlar ───────────────────────────────────────────────────────────── */

export interface AttemptTotals {
  readonly totalScore: number;
  readonly maxScore: number;
  readonly scorePercent: number;
  readonly passed: boolean;
}

/**
 * Deneme toplamını cevaplardan hesaplar.
 *
 * `totalScore` hiçbir zaman istemciden alınmaz; tek tek cevapların toplamıdır.
 * Böylece bir cevabın puanı değiştiğinde toplam kendiliğinden tutarlı kalır.
 */
export function computeTotals(
  answers: readonly AttemptAnswer[],
  passingScore: number,
): AttemptTotals {
  const totalScore = round2(answers.reduce((sum, answer) => sum + answer.awardedPoints, 0));
  const maxScore = round2(answers.reduce((sum, answer) => sum + answer.maxPoints, 0));
  const scorePercent = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 100);

  return { totalScore, maxScore, scorePercent, passed: totalScore >= passingScore };
}

/** Elle puanlanması gereken ve henüz puanlanmamış cevap sayısı. */
export function pendingManualCount(answers: readonly AttemptAnswer[]): number {
  return answers.filter((answer) => !answer.autoGraded && answer.gradedBy === null).length;
}

/**
 * Puanlama sonrası denemenin varacağı durum.
 *
 * Elle puanlanacak cevap kaldıysa değerlendirme bitmemiştir; hepsi
 * tamamlandığında `GRADED` olur. Sonucun öğrenciye açılması AYRI bir karardır
 * (`RELEASED`) ve burada otomatik yapılmaz.
 */
export function nextAttemptState(
  answers: readonly AttemptAnswer[],
  current: Attempt['state'],
): Attempt['state'] {
  if (current === 'RELEASED' || current === 'UNDER_REVIEW') return current;
  return pendingManualCount(answers) > 0 ? 'PENDING_MANUAL' : 'GRADED';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
