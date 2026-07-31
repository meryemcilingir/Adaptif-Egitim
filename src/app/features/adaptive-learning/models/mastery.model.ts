import { Difficulty } from './common.model';

/**
 * Kazanım ustalık skoru ve hesabın GİRDİLERİ.
 * Girdiler saklanır ki arayüz "bu skor neden bu?" sorusunu cevaplayabilsin (BR-14, BR-16).
 */
export interface MasteryInputs {
  /** Değerlendirmeye alınan son cevap sayısı. */
  readonly recentAnswerCount: number;
  readonly correctCount: number;
  readonly weightedCorrect: number;
  readonly weightedTotal: number;
  readonly difficultyMix: Readonly<Record<Difficulty, number>>;
  /** Aynı kazanımın tekrar edilme sayısı — çok tekrar skoru bir miktar sönümler. */
  readonly repeatCount: number;
  /** Son cevaptan bu yana geçen gün — bilgi tazeliği. */
  readonly daysSinceLastPractice: number;
}

export const MASTERY_BANDS = ['critical', 'weak', 'developing', 'proficient', 'mastered'] as const;
export type MasteryBand = (typeof MASTERY_BANDS)[number];

export const MASTERY_BAND_LABELS: Readonly<Record<MasteryBand, string>> = {
  critical: 'Kritik',
  weak: 'Zayıf',
  developing: 'Gelişiyor',
  proficient: 'Yeterli',
  mastered: 'Ustalaşmış',
};

export interface MasteryScore {
  readonly id: string;
  readonly studentId: string;
  readonly outcomeId: string;
  readonly outcomeCode: string;
  readonly outcomeTitle: string;
  readonly courseId: string;
  /** 0–100. */
  readonly score: number;
  readonly band: MasteryBand;
  /** Örneklem küçükse skor düşük güvenle gösterilir. */
  readonly confidence: number;
  readonly inputs: MasteryInputs;
  readonly trend: number;
  readonly calculatedAt: string;
}

/** Kazanım × zaman ısı haritası hücresi. */
export interface MasteryHeatmapCell {
  readonly outcomeId: string;
  readonly outcomeCode: string;
  readonly periodLabel: string;
  readonly score: number | null;
  readonly attempts: number;
}

export interface MasteryHeatmap {
  readonly periods: readonly string[];
  readonly outcomes: readonly {
    readonly id: string;
    readonly code: string;
    readonly title: string;
  }[];
  readonly cells: readonly MasteryHeatmapCell[];
}

export interface MasteryTrendPoint {
  readonly date: string;
  readonly averageScore: number;
  readonly answeredCount: number;
}
