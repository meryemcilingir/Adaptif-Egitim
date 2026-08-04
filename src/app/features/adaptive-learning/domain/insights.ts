import { MetricDelta } from '../models/analytics.model';

/**
 * Kural tabanlı içgörü üreteci (Sprint 8 §13).
 *
 * YAPAY ZEKA YOKTUR. Her yorum, ölçülmüş bir sayıdan ve açıkça yazılmış bir
 * eşikten doğar; hiçbir cümle "modelin sezgisi" değildir. Bu bilinçli: bir
 * eğitim yöneticisi rapordaki iddianın nereden geldiğini görebilmelidir.
 *
 * Her içgörü, kendisini üreten SAYIYI da taşır (`evidence`) — ekran bunu
 * gösterir, böylece yorum doğrulanabilir kalır.
 */

export const INSIGHT_KINDS = ['positive', 'warning', 'critical', 'neutral'] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export interface Insight {
  readonly id: string;
  readonly kind: InsightKind;
  readonly title: string;
  /** Yorumun dayandığı ölçüm — "neden böyle diyorsun?" sorusunun cevabı. */
  readonly evidence: string;
  /** Kullanıcıyı ilgili ekrana götüren bağlantı (isteğe bağlı). */
  readonly link: string | null;
}

/**
 * Eşikler tek yerde.
 *
 * Rakamları koda gömmek yerine burada toplamak, "neden %60?" sorusunun tek bir
 * yerde tartışılmasını sağlar ve kurum politikası değişince tek dosya güncellenir.
 */
export const INSIGHT_THRESHOLDS = {
  /** Bu ustalık yüzdesinin altındaki kazanım "zorlanılıyor" sayılır. */
  weakOutcome: 55,
  /** Bu yüzdenin üstündeki kazanım güçlü sayılır. */
  strongOutcome: 80,
  /** Anlamlı sayılan en küçük değişim yüzdesi — gürültüyü elemek için. */
  meaningfulChange: 8,
  /** Bu geçme oranının altındaki sınav dikkat ister. */
  lowPassRate: 60,
  /** Bu kabul oranının altındaki öneri motoru gözden geçirilmeli. */
  lowAcceptance: 40,
  /** Bu orandan fazla öğrenci risk altındaysa yapısal bir sorun vardır. */
  atRiskShare: 20,
  /** Ayırt ediciliği bu değerin altındaki soru gözden geçirilmeli. */
  weakDiscrimination: 0.2,
} as const;

/* ── Girdi ───────────────────────────────────────────────────────────────── */

export interface InsightInput {
  readonly averageScore: MetricDelta;
  readonly completionRate: MetricDelta;
  readonly acceptanceRate: MetricDelta;
  readonly averageMastery: number;
  readonly weakOutcomes: readonly { readonly id: string; readonly code: string; readonly mastery: number }[];
  readonly strongOutcomes: readonly { readonly code: string; readonly mastery: number }[];
  readonly lowPassExams: readonly { readonly id: string; readonly title: string; readonly passRate: number }[];
  readonly atRiskCount: number;
  readonly studentCount: number;
  readonly flaggedQuestionCount: number;
  readonly totalQuestionCount: number;
  /** Ortalama çözüm süresi beklenenin çok üstünde olan sorular. */
  readonly slowQuestions: readonly { readonly code: string; readonly ratio: number }[];
}

/**
 * İçgörüleri üretir.
 *
 * Sıra ÖNEMLİ: kritik olanlar önce gelir. Bir yönetici listenin başındaki üç
 * satırı okur; oraya "her şey yolunda" yazmak, altta duran kritik bulguyu
 * görünmez kılardı.
 */
export function buildInsights(input: InsightInput): readonly Insight[] {
  const insights: Insight[] = [
    ...outcomeInsights(input),
    ...examInsights(input),
    ...trendInsights(input),
    ...riskInsights(input),
    ...questionInsights(input),
    ...recommendationInsights(input),
  ];

  const weight: Readonly<Record<InsightKind, number>> = {
    critical: 0,
    warning: 1,
    positive: 2,
    neutral: 3,
  };

  return insights.sort((a, b) => weight[a.kind] - weight[b.kind]);
}

/* ── Kural grupları ──────────────────────────────────────────────────────── */

function outcomeInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  const weakest = input.weakOutcomes
    .filter((outcome) => outcome.mastery < INSIGHT_THRESHOLDS.weakOutcome)
    .sort((a, b) => a.mastery - b.mastery);

  if (weakest.length > 0) {
    const worst = weakest[0];
    insights.push({
      id: `weak-outcome-${worst.id}`,
      kind: weakest.length >= 3 ? 'critical' : 'warning',
      title: `Öğrenciler ${worst.code} kazanımında zorlanıyor.`,
      evidence:
        weakest.length === 1
          ? `Ortalama ustalık %${Math.round(worst.mastery)} (eşik %${INSIGHT_THRESHOLDS.weakOutcome}).`
          : `${weakest.length} kazanım eşiğin altında; en düşüğü ${worst.code} (%${Math.round(worst.mastery)}).`,
      link: '/analytics/outcomes',
    });
  }

  const strongest = [...input.strongOutcomes]
    .filter((outcome) => outcome.mastery >= INSIGHT_THRESHOLDS.strongOutcome)
    .sort((a, b) => b.mastery - a.mastery);

  if (strongest.length > 0) {
    insights.push({
      id: 'strong-outcomes',
      kind: 'positive',
      title: `${strongest.length} kazanımda hedefin üzerinde başarı var.`,
      evidence: `En yüksek: ${strongest[0].code} (%${Math.round(strongest[0].mastery)}).`,
      link: '/analytics/outcomes',
    });
  }

  return insights;
}

function examInsights(input: InsightInput): Insight[] {
  const failing = [...input.lowPassExams]
    .filter((exam) => exam.passRate < INSIGHT_THRESHOLDS.lowPassRate)
    .sort((a, b) => a.passRate - b.passRate);

  if (failing.length === 0) return [];

  const worst = failing[0];
  return [
    {
      id: `low-pass-${worst.id}`,
      kind: worst.passRate < 40 ? 'critical' : 'warning',
      title: `"${worst.title}" sınavında geçme oranı düşük.`,
      evidence: `Geçme oranı %${Math.round(worst.passRate)}${failing.length > 1 ? `; benzer durumda ${failing.length - 1} sınav daha var` : ''}.`,
      link: `/exams/${worst.id}`,
    },
  ];
}

/**
 * Değişim yorumları.
 *
 * Küçük dalgalanmalar yorumlanmaz: örneklem değiştiği için her rapor birkaç
 * puan oynar ve bunları "eğilim" diye sunmak yanıltıcı olur.
 */
function trendInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  const score = input.averageScore;
  if (Math.abs(score.changePercent) >= INSIGHT_THRESHOLDS.meaningfulChange) {
    const dropped = score.direction === 'down';
    insights.push({
      id: 'score-trend',
      kind: dropped ? 'warning' : 'positive',
      title: dropped
        ? `Ortalama sınav puanı önceki döneme göre %${Math.abs(score.changePercent)} düştü.`
        : `Ortalama sınav puanı önceki döneme göre %${score.changePercent} yükseldi.`,
      evidence: `Şimdi %${Math.round(score.current)}, önceki dönem %${Math.round(score.previous)}.`,
      link: '/analytics/trends',
    });
  }

  const completion = input.completionRate;
  if (
    completion.direction === 'down' &&
    Math.abs(completion.changePercent) >= INSIGHT_THRESHOLDS.meaningfulChange
  ) {
    insights.push({
      id: 'completion-trend',
      kind: 'warning',
      title: 'İçerik tamamlama hızı yavaşladı.',
      evidence: `Tamamlama oranı %${Math.round(completion.previous)} → %${Math.round(completion.current)}.`,
      link: '/analytics/velocity',
    });
  }

  return insights;
}

function riskInsights(input: InsightInput): Insight[] {
  if (input.studentCount === 0 || input.atRiskCount === 0) return [];

  const share = Math.round((input.atRiskCount / input.studentCount) * 100);
  if (share < INSIGHT_THRESHOLDS.atRiskShare) return [];

  return [
    {
      id: 'at-risk-share',
      kind: share >= 35 ? 'critical' : 'warning',
      title: `Öğrencilerin %${share}'i risk altında görünüyor.`,
      evidence: `${input.studentCount} öğrenciden ${input.atRiskCount}'i düşük ustalık veya düşük tamamlama gösteriyor.`,
      link: '/analytics/performers',
    },
  ];
}

function questionInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  if (input.totalQuestionCount > 0 && input.flaggedQuestionCount > 0) {
    const share = Math.round((input.flaggedQuestionCount / input.totalQuestionCount) * 100);

    insights.push({
      id: 'flagged-items',
      kind: share >= 25 ? 'warning' : 'neutral',
      title: `${input.flaggedQuestionCount} soru madde analizinde işaretlendi.`,
      evidence: `Analiz edilen soruların %${share}'i zorluk veya ayırt edicilik eşiğinin dışında.`,
      link: '/item-analysis',
    });
  }

  const slowest = [...input.slowQuestions].sort((a, b) => b.ratio - a.ratio)[0];
  if (slowest && slowest.ratio >= 1.5) {
    insights.push({
      id: `slow-question-${slowest.code}`,
      kind: 'neutral',
      title: `${slowest.code} sorusu beklenenden uzun sürüyor.`,
      evidence: `Ortalama çözüm süresi, tahmin edilen sürenin ${slowest.ratio.toFixed(1)} katı.`,
      link: '/item-analysis',
    });
  }

  return insights;
}

function recommendationInsights(input: InsightInput): Insight[] {
  const acceptance = input.acceptanceRate;
  const insights: Insight[] = [];

  if (acceptance.current > 0 && acceptance.current < INSIGHT_THRESHOLDS.lowAcceptance) {
    insights.push({
      id: 'low-acceptance',
      kind: 'warning',
      title: 'Öneri kabul oranı düşük.',
      evidence: `Önerilerin yalnızca %${Math.round(acceptance.current)}'i açılıyor (eşik %${INSIGHT_THRESHOLDS.lowAcceptance}).`,
      link: '/analytics/recommendations',
    });
  } else if (
    acceptance.direction === 'up' &&
    Math.abs(acceptance.changePercent) >= INSIGHT_THRESHOLDS.meaningfulChange
  ) {
    insights.push({
      id: 'acceptance-up',
      kind: 'positive',
      title: 'Öneri kabul oranı bu dönem arttı.',
      evidence: `%${Math.round(acceptance.previous)} → %${Math.round(acceptance.current)}.`,
      link: '/analytics/recommendations',
    });
  }

  return insights;
}

/**
 * Hiç bulgu yoksa gösterilecek nötr içgörü.
 *
 * Boş liste göstermek "analiz çalışmadı" izlenimi verir; veri yeterli değilse
 * bunu açıkça söylemek daha dürüsttür.
 */
export function emptyInsight(sampleSize: number): Insight {
  return {
    id: 'no-findings',
    kind: 'neutral',
    title:
      sampleSize === 0
        ? 'Bu filtrede yorum üretecek veri yok.'
        : 'Eşiklerin dışına çıkan bir bulgu yok.',
    evidence:
      sampleSize === 0
        ? 'Filtreleri genişletmeyi deneyin.'
        : `${sampleSize} kayıt incelendi; tümü beklenen aralıkta.`,
    link: null,
  };
}
