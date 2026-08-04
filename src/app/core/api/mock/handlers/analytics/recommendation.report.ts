import {
  CategoryValue,
  RankedEntry,
  RecommendationAnalytics,
  computeDelta,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import { Recommendation } from '../../../../../features/adaptive-learning/models/recommendation.model';
import { isWithin, previousRange } from '../../../../../features/adaptive-learning/domain/analytics-range';
import { percentOf } from '../../../../../features/adaptive-learning/domain/statistics';
import { ReportScope, buildMeta, dailySeries } from './report-context';

/**
 * Öneri motoru analitiği (§9).
 *
 * KRİTİK TASARIM KARARI: `Recommendation` modelinde "kabul edildi / yok sayıldı"
 * diye bir alan YOKTUR — öneriler saklanan değil TÜRETİLEN kayıtlardır (Sprint 4,
 * ADR-017 ile aynı ilke). Bu yüzden kabul durumu uydurulmaz, GERÇEK DAVRANIŞTAN
 * çıkarılır:
 *
 * · Kabul edildi → öğrenci önerilen içeriği önerinin ardından açtı.
 * · Tamamlandı  → açmakla kalmayıp bitirdi.
 * · Yok sayıldı → öneriden sonra hiç açılmadı.
 *
 * Böylece "kabul oranı" gerçekten ölçülmüş bir davranıştır; motorun kendi
 * hakkında verdiği bir not değil.
 */

export const RECOMMENDATION_OUTCOMES = ['accepted', 'completed', 'ignored'] as const;
export type RecommendationOutcome = (typeof RECOMMENDATION_OUTCOMES)[number];

export const RECOMMENDATION_OUTCOME_LABELS: Readonly<Record<RecommendationOutcome, string>> = {
  accepted: 'Açıldı',
  completed: 'Tamamlandı',
  ignored: 'Yok sayıldı',
};

/**
 * Bir önerinin akıbetini ilerleme kaydından çıkarır.
 *
 * Öneri ÖNCESİNDE açılmış içerik "kabul" sayılmaz: öğrenci zaten oradaydı,
 * öneriyi izlediği için değil. Bu ayrım olmadan motor, öğrencinin kendi
 * seçimlerini kendi başarısı gibi gösterirdi.
 */
export function outcomeOf(
  recommendation: Recommendation,
  progressByKey: ReadonlyMap<string, { state: string; startedAt: string | null }>,
): RecommendationOutcome {
  const progress = progressByKey.get(`${recommendation.studentId}:${recommendation.targetId}`);
  if (!progress || progress.state === 'not_started') return 'ignored';

  if (progress.startedAt && Date.parse(progress.startedAt) < Date.parse(recommendation.generatedAt)) {
    return 'ignored';
  }

  return progress.state === 'completed' ? 'completed' : 'accepted';
}

export interface RecommendationTally {
  readonly total: number;
  readonly accepted: number;
  readonly completed: number;
  readonly ignored: number;
  readonly acceptanceRate: number;
}

export function tallyRecommendations(
  recommendations: readonly Recommendation[],
  progressByKey: ReadonlyMap<string, { state: string; startedAt: string | null }>,
): RecommendationTally {
  let accepted = 0;
  let completed = 0;
  let ignored = 0;

  for (const recommendation of recommendations) {
    switch (outcomeOf(recommendation, progressByKey)) {
      case 'accepted':
        accepted += 1;
        break;
      case 'completed':
        completed += 1;
        break;
      default:
        ignored += 1;
    }
  }

  const total = recommendations.length;
  // Tamamlananlar da kabul edilmiş sayılır: açmadan tamamlanamaz.
  return {
    total,
    accepted,
    completed,
    ignored,
    acceptanceRate: percentOf(accepted + completed, total),
  };
}

export function progressIndex(scope: ReportScope) {
  const index = new Map<string, { state: string; startedAt: string | null }>();

  for (const item of scope.db.collection('contentProgress').all()) {
    index.set(`${item.studentId}:${item.contentId}`, {
      state: item.state,
      startedAt: item.startedAt,
    });
  }

  return index;
}

export function buildRecommendationAnalytics(scope: ReportScope): RecommendationAnalytics {
  const progressByKey = progressIndex(scope);

  const all = scope.db
    .collection('recommendations')
    .filter(
      (item) => scope.studentIds.has(item.studentId) && scope.courseIds.has(item.courseId),
    );

  const inRange = all.filter((item) => isWithin(scope.range, item.generatedAt));
  const tally = tallyRecommendations(inRange, progressByKey);

  const previous = previousRange(scope.range);
  const previousTally = tallyRecommendations(
    all.filter((item) => isWithin(previous, item.generatedAt)),
    progressByKey,
  );

  /* En çok önerilen içerikler — motorun neyi öne çıkardığını gösterir. */
  const byTarget = new Map<string, { title: string; count: number; accepted: number }>();

  for (const recommendation of inRange) {
    const entry = byTarget.get(recommendation.targetId) ?? {
      title: recommendation.targetTitle,
      count: 0,
      accepted: 0,
    };

    entry.count += 1;
    if (outcomeOf(recommendation, progressByKey) !== 'ignored') entry.accepted += 1;
    byTarget.set(recommendation.targetId, entry);
  }

  const ranked = [...byTarget.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  const maxCount = ranked[0]?.[1].count ?? 1;

  const mostRecommended: RankedEntry[] = ranked.map(([targetId, entry]) => ({
    id: targetId,
    label: entry.title,
    sublabel: `${entry.count} öneri · %${percentOf(entry.accepted, entry.count)} açıldı`,
    value: entry.count,
    unit: '',
    ratio: Math.round((entry.count / maxCount) * 100),
    tone: entry.accepted / Math.max(1, entry.count) >= 0.5 ? 'success' : 'neutral',
  }));

  /* Hangi kural en çok işe yarıyor? Öneri gerekçelerine göre kırılım. */
  const byReason = new Map<string, number>();
  for (const recommendation of inRange) {
    for (const reason of recommendation.reasons) {
      byReason.set(reason.rule, (byReason.get(reason.rule) ?? 0) + 1);
    }
  }

  const reasonValues: CategoryValue[] = [...byReason.entries()]
    .map(([rule, count]) => ({ label: rule, value: count }))
    .sort((a, b) => b.value - a.value);

  const byState: CategoryValue[] = [
    { label: RECOMMENDATION_OUTCOME_LABELS.completed, value: tally.completed },
    { label: RECOMMENDATION_OUTCOME_LABELS.accepted, value: tally.accepted },
    { label: RECOMMENDATION_OUTCOME_LABELS.ignored, value: tally.ignored },
  ];

  return {
    meta: buildMeta(scope, inRange.length),
    total: tally.total,
    accepted: tally.accepted,
    ignored: tally.ignored,
    completed: tally.completed,
    acceptanceRate: computeDelta(tally.acceptanceRate, previousTally.acceptanceRate),
    /*
     * "İsabet": açılan önerilerin ne kadarının TAMAMLANDIĞI. Açılıp yarıda
     * bırakılan öneri, öğrenciye uymamış demektir.
     */
    accuracyPercent: percentOf(tally.completed, tally.accepted + tally.completed),
    byState,
    mostRecommended,
    byReason: reasonValues,
    trend: dailySeries(scope, (dayStart, dayEnd) => {
      const inDay = inRange.filter((item) => {
        const at = Date.parse(item.generatedAt);
        return at > dayStart && at <= dayEnd;
      });

      return { value: inDay.length, sampleSize: inDay.length };
    }),
  };
}
