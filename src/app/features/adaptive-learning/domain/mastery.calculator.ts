import { DIFFICULTY_WEIGHTS, Difficulty } from '../models/common.model';
import { MasteryBand, MasteryInputs, MasteryScore } from '../models/mastery.model';

/**
 * Kazanım ustalık skoru hesabı (BR-14).
 *
 * SAF fonksiyon: Angular, HTTP ve tarih bağımlılığı yoktur → doğrudan test edilir.
 * Formül bilinçli olarak basit ve AÇIKLANABİLİR tutulmuştur; arayüz hesabın
 * girdilerini kullanıcıya gösterebilmelidir ("neden bu skor?").
 *
 * Adımlar:
 *  1. Ağırlıklı doğruluk — zor soruyu bilmek daha çok değer taşır.
 *  2. Tazelik sönümü — uzun süre çalışılmayan kazanımda skor bir miktar düşer.
 *  3. Tekrar sönümü — aynı kazanımı çok tekrar etmek tek başına ustalık sayılmaz.
 *  4. Güven — örneklem küçükse skor 50'ye doğru çekilir (regresyon).
 */

export interface AnswerSignal {
  readonly difficulty: Difficulty;
  readonly correct: boolean;
  /** Kısmi puanlı sorularda 0–1 arası oran; tam doğru için 1. */
  readonly creditRatio: number;
  readonly answeredAt: string;
}

export const MASTERY_CONFIG = {
  /** Hesaba katılan en son cevap sayısı. */
  windowSize: 12,
  /** Güvenin 1.0'a ulaşması için gereken cevap sayısı. */
  fullConfidenceCount: 8,
  /** Tazelik sönümünün başladığı gün. */
  decayStartsAfterDays: 14,
  maxDecay: 0.15,
  repeatPenaltyPerExtra: 0.01,
  maxRepeatPenalty: 0.08,
} as const;

const BAND_THRESHOLDS: readonly (readonly [MasteryBand, number])[] = [
  ['mastered', 85],
  ['proficient', 70],
  ['developing', 55],
  ['weak', 35],
  ['critical', 0],
];

export function bandOf(score: number): MasteryBand {
  return BAND_THRESHOLDS.find(([, threshold]) => score >= threshold)![0];
}

export interface MasteryResult {
  readonly score: number;
  readonly band: MasteryBand;
  readonly confidence: number;
  readonly inputs: MasteryInputs;
}

export function calculateMastery(
  answers: readonly AnswerSignal[],
  nowMs: number,
  repeatCount = 0,
): MasteryResult {
  const window = [...answers]
    .sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt))
    .slice(0, MASTERY_CONFIG.windowSize);

  const inputs = buildInputs(window, nowMs, repeatCount);

  if (window.length === 0) {
    return { score: 0, band: 'critical', confidence: 0, inputs };
  }

  // 1) Ağırlıklı doğruluk
  const base = inputs.weightedTotal > 0 ? inputs.weightedCorrect / inputs.weightedTotal : 0;

  // 2) Tazelik sönümü
  const staleDays = Math.max(0, inputs.daysSinceLastPractice - MASTERY_CONFIG.decayStartsAfterDays);
  const decay = Math.min(MASTERY_CONFIG.maxDecay, staleDays * 0.005);

  // 3) Tekrar sönümü
  const repeatPenalty = Math.min(
    MASTERY_CONFIG.maxRepeatPenalty,
    Math.max(0, repeatCount - 1) * MASTERY_CONFIG.repeatPenaltyPerExtra,
  );

  // 4) Güven — az veriyle uç skor üretmemek için ortalamaya çekilir
  const confidence = Math.min(1, window.length / MASTERY_CONFIG.fullConfidenceCount);
  const adjusted = base * (1 - decay) * (1 - repeatPenalty);
  const score = clamp(Math.round((adjusted * confidence + 0.5 * (1 - confidence)) * 100), 0, 100);

  return { score, band: bandOf(score), confidence: round(confidence, 2), inputs };
}

function buildInputs(
  window: readonly AnswerSignal[],
  nowMs: number,
  repeatCount: number,
): MasteryInputs {
  const difficultyMix: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  let weightedCorrect = 0;
  let weightedTotal = 0;
  let correctCount = 0;
  let lastAnsweredMs = 0;

  for (const answer of window) {
    const weight = DIFFICULTY_WEIGHTS[answer.difficulty];
    difficultyMix[answer.difficulty] += 1;
    weightedTotal += weight;
    weightedCorrect += weight * clamp(answer.creditRatio, 0, 1);
    if (answer.correct) correctCount += 1;
    lastAnsweredMs = Math.max(lastAnsweredMs, Date.parse(answer.answeredAt));
  }

  return {
    recentAnswerCount: window.length,
    correctCount,
    weightedCorrect: round(weightedCorrect, 2),
    weightedTotal: round(weightedTotal, 2),
    difficultyMix,
    repeatCount,
    daysSinceLastPractice:
      lastAnsweredMs === 0 ? 0 : Math.floor((nowMs - lastAnsweredMs) / 86_400_000),
  };
}

/** Ustalık skorlarından ortalama — dashboard KPI'ı bunu kullanır. */
export function averageMastery(scores: readonly MasteryScore[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length);
}

/** Belirli bandın altındaki kazanımlar — "zayıf kazanım" önerisinin girdisi. */
export function weakOutcomes(scores: readonly MasteryScore[], threshold = 60): MasteryScore[] {
  return scores.filter((score) => score.score < threshold).sort((a, b) => a.score - b.score);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
