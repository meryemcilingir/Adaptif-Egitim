import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_ORDER,
  ContentItem,
  ContentProgress,
  ContentType,
  isAssessmentContent,
} from '../models/content-item.model';
import {
  Recommendation,
  RecommendationReason,
  RecommendationRule,
} from '../models/recommendation.model';
import {
  LEARNING_THRESHOLDS,
  MasteryMap,
  PrerequisiteMap,
  daysSince,
  evaluateUnlock,
  masteryBand,
} from './learning-rules';

/**
 * Kural tabanlı, AÇIKLANABİLİR öneri motoru (BR-15, BR-16).
 *
 * Yapay zekâ kullanılmaz. Her kural bağımsız olarak puan üretir ve o puanın
 * gerekçesini (`explanation` + sayısal `evidence`) döndürür; toplam puan
 * sıralamayı belirler. Arayüz gerekçeleri kullanıcıya cümle hâlinde gösterir.
 *
 * SAF fonksiyon: Angular/HTTP bağımlılığı yoktur, doğrudan test edilir.
 *
 * Uygulanan kurallar:
 *  · Ustalık < 40  → anlatım içeriği (video/sunum) önerilir
 *  · Ustalık 40–70 → ölçme içeriği (quiz) önerilir
 *  · Ustalık > 80  → sonraki kazanıma geçiş önerilir
 *  · İçerik tamamlandı → sıradaki uygun içerik önerilir
 *  · Önkoşul eksik → ileri içerik kilitlenir, önce önkoşul önerilir
 *  · 7+ gündür çalışılmadı → tekrar önerilir
 *  · Değerlendirme başarısız → kolay seviye içerik önerilir
 */

export interface OutcomeRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  /** Ders içindeki sıra — "sonraki kazanım" bu sıraya göre bulunur. */
  readonly order: number;
}

export interface RecommendationContext {
  readonly studentId: string;
  readonly courseId: string;
  readonly courseCode: string;
  readonly contents: readonly ContentItem[];
  /** İçerik kimliğine göre ilerleme kayıtları. */
  readonly progressByContent: ReadonlyMap<string, ContentProgress>;
  readonly outcomes: readonly OutcomeRef[];
  readonly mastery: MasteryMap;
  readonly prerequisites: PrerequisiteMap;
  readonly upcomingExamOutcomeIds: readonly string[];
  readonly daysUntilExam: number | null;
  readonly nowIso: string;
}

export const RECOMMENDATION_CONFIG = {
  maxResults: 8,
  /** Bir kazanımdan en fazla kaç içerik önerilir (çeşitlilik için). */
  maxPerOutcome: 2,
} as const;

/** Kural ağırlıkları — sıralamayı belirleyen tek tablo. */
const RULE_WEIGHTS: Readonly<Record<RecommendationRule, number>> = {
  prerequisite_gap: 45,
  failed_assessment: 40,
  low_mastery_watch: 35,
  mid_mastery_practice: 28,
  incomplete_content: 22,
  spaced_repetition: 20,
  exam_upcoming: 18,
  next_in_sequence: 15,
  high_mastery_advance: 12,
};

export function recommend(context: RecommendationContext): Recommendation[] {
  const nowMs = Date.parse(context.nowIso);
  const outcomeById = new Map(context.outcomes.map((outcome) => [outcome.id, outcome] as const));

  const candidates: Recommendation[] = [
    ...recommendContents(context, outcomeById, nowMs),
    ...recommendNextOutcomes(context),
  ];

  return limitPerOutcome(
    candidates.sort((a, b) => b.priority - a.priority),
    RECOMMENDATION_CONFIG.maxPerOutcome,
  ).slice(0, RECOMMENDATION_CONFIG.maxResults);
}

/* ── İçerik önerileri ────────────────────────────────────────────────────── */

function recommendContents(
  context: RecommendationContext,
  outcomeById: ReadonlyMap<string, OutcomeRef>,
  nowMs: number,
): Recommendation[] {
  const results: Recommendation[] = [];

  for (const content of context.contents) {
    if (content.state !== 'PUBLISHED') continue;

    const progress = context.progressByContent.get(content.id);
    // BR-15: tamamlanmış içerik yeniden önerilmez.
    if (progress?.state === 'completed') continue;

    const outcome = outcomeById.get(content.outcomeId);
    if (!outcome) continue;

    const unlock = evaluateUnlock(content.outcomeId, context.prerequisites, context.mastery);
    // Önkoşulu eksik kazanımın içeriği önerilmez; onun yerine önkoşul önerilir.
    if (!unlock.unlocked) continue;

    const reasons = collectContentReasons(content, outcome, progress, context, nowMs);
    if (reasons.length === 0) continue;

    results.push({
      id: `rec_${context.studentId}_${content.id}`,
      studentId: context.studentId,
      kind: 'content',
      targetId: content.id,
      targetTitle: content.title,
      contentType: content.type,
      courseId: context.courseId,
      courseCode: context.courseCode,
      outcomeId: outcome.id,
      outcomeCode: outcome.code,
      priority: totalPriority(reasons),
      estimatedMinutes: content.estimatedDurationMinutes,
      reasons,
      generatedAt: context.nowIso,
    });
  }

  return results;
}

function collectContentReasons(
  content: ContentItem,
  outcome: OutcomeRef,
  progress: ContentProgress | undefined,
  context: RecommendationContext,
  nowMs: number,
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const score = context.mastery.get(outcome.id) ?? null;
  const band = masteryBand(score);

  // 1) Ustalık kritik → anlatım içeriği (video/sunum).
  if (band === 'critical' && isExplanatory(content.type)) {
    reasons.push({
      rule: 'low_mastery_watch',
      explanation:
        score === null
          ? `"${outcome.code}" kazanımına henüz başlamadınız; bu ${CONTENT_TYPE_LABELS[content.type].toLocaleLowerCase('tr-TR')} ile başlayın.`
          : `Bu ${CONTENT_TYPE_LABELS[content.type].toLocaleLowerCase('tr-TR')}, "${outcome.code}" kazanımındaki başarınız %${score} olduğu için önerildi.`,
      contribution: RULE_WEIGHTS.low_mastery_watch,
      evidence: { masteryScore: score ?? 0, threshold: LEARNING_THRESHOLDS.lowMastery },
    });
  }

  // 2) Ustalık orta → ölçme içeriği (quiz/ödev).
  if (band === 'developing' && isAssessmentContent(content.type)) {
    reasons.push({
      rule: 'mid_mastery_practice',
      explanation: `"${outcome.code}" kazanımında %${score} seviyesindesiniz; pekiştirmek için bu ${CONTENT_TYPE_LABELS[content.type].toLocaleLowerCase('tr-TR')} önerildi.`,
      contribution: RULE_WEIGHTS.mid_mastery_practice,
      evidence: {
        masteryScore: score ?? 0,
        lowerBound: LEARNING_THRESHOLDS.lowMastery,
        upperBound: LEARNING_THRESHOLDS.midMastery,
      },
    });
  }

  // 3) Başarısız değerlendirme → kolay seviye içerik.
  const failed = lastFailedAssessment(context);
  if (failed && failed.outcomeId === outcome.id && content.difficulty === 'easy') {
    reasons.push({
      rule: 'failed_assessment',
      explanation: `Son değerlendirmede %${failed.scorePercent} aldığınız için bu kolay seviye içerik önerildi.`,
      contribution: RULE_WEIGHTS.failed_assessment,
      evidence: {
        scorePercent: failed.scorePercent,
        passingScore: LEARNING_THRESHOLDS.failingScore,
      },
    });
  }

  // 4) Yarım kalan içerik.
  if (progress?.state === 'in_progress') {
    reasons.push({
      rule: 'incomplete_content',
      explanation: `Bu içeriğin %${progress.completionPercent}'ini tamamladınız; kaldığınız yerden devam edebilirsiniz.`,
      contribution: RULE_WEIGHTS.incomplete_content,
      evidence: { completionPercent: progress.completionPercent },
    });
  }

  // 5) Sıradaki içerik: aynı kazanımda kendisinden önceki tüm adımlar bitmiş.
  if (!progress || progress.state === 'not_started' || progress.state === 'recommended') {
    if (isNextInSequence(content, context)) {
      reasons.push({
        rule: 'next_in_sequence',
        explanation: 'Bu içerik öğrenme yolunuzdaki bir sonraki adımdır.',
        contribution: RULE_WEIGHTS.next_in_sequence,
        evidence: { contentType: CONTENT_TYPE_LABELS[content.type] },
      });
    }
  }

  // 6) Aralıklı tekrar — uzun süredir dokunulmamış kazanım.
  const idleDays = outcomeIdleDays(outcome.id, context, nowMs);
  if (idleDays !== null && idleDays >= LEARNING_THRESHOLDS.staleDays && reasons.length > 0) {
    reasons.push({
      rule: 'spaced_repetition',
      explanation: `Son çalışmanızın üzerinden ${idleDays} gün geçtiği için tekrar önerildi.`,
      contribution: RULE_WEIGHTS.spaced_repetition,
      evidence: { daysSinceLastStudy: idleDays, threshold: LEARNING_THRESHOLDS.staleDays },
    });
  }

  // 7) Yaklaşan sınav kapsamı.
  if (
    context.daysUntilExam !== null &&
    context.upcomingExamOutcomeIds.includes(outcome.id) &&
    reasons.length > 0
  ) {
    reasons.push({
      rule: 'exam_upcoming',
      explanation: `"${outcome.code}" kazanımı ${context.daysUntilExam} gün sonraki sınavın kapsamında.`,
      contribution:
        RULE_WEIGHTS.exam_upcoming * Math.min(1, 14 / Math.max(1, context.daysUntilExam)),
      evidence: { daysUntilExam: context.daysUntilExam },
    });
  }

  return reasons;
}

/* ── Kazanım önerileri ───────────────────────────────────────────────────── */

/** Ustalık yüksekse sıradaki kazanıma geçiş önerilir. */
function recommendNextOutcomes(context: RecommendationContext): Recommendation[] {
  const ordered = [...context.outcomes].sort((a, b) => a.order - b.order);
  const results: Recommendation[] = [];

  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index]!;
    const score = context.mastery.get(current.id) ?? null;
    if (score === null || score < LEARNING_THRESHOLDS.highMastery) continue;

    const next = ordered[index + 1];
    if (!next) continue;

    const nextScore = context.mastery.get(next.id) ?? 0;
    // Sonraki kazanım da tamamlanmışsa önermenin anlamı yok.
    if (nextScore >= LEARNING_THRESHOLDS.highMastery) continue;

    const unlock = evaluateUnlock(next.id, context.prerequisites, context.mastery);
    if (!unlock.unlocked) continue;

    results.push({
      id: `rec_${context.studentId}_outcome_${next.id}`,
      studentId: context.studentId,
      kind: 'outcome',
      targetId: next.id,
      targetTitle: next.title,
      contentType: null,
      courseId: context.courseId,
      courseCode: context.courseCode,
      outcomeId: next.id,
      outcomeCode: next.code,
      priority: RULE_WEIGHTS.high_mastery_advance,
      estimatedMinutes: 0,
      reasons: [
        {
          rule: 'high_mastery_advance',
          explanation: `"${current.code}" kazanımını %${score} ile tamamladınız; sıradaki konu "${next.code}" açıldı.`,
          contribution: RULE_WEIGHTS.high_mastery_advance,
          evidence: {
            completedOutcome: current.code,
            masteryScore: score,
            threshold: LEARNING_THRESHOLDS.highMastery,
          },
        },
      ],
      generatedAt: context.nowIso,
    });
  }

  return results;
}

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function isExplanatory(type: ContentType): boolean {
  return type === 'video' || type === 'presentation' || type === 'pdf';
}

function totalPriority(reasons: readonly RecommendationReason[]): number {
  return Math.min(100, Math.round(reasons.reduce((sum, reason) => sum + reason.contribution, 0)));
}

/**
 * İçerik, kazanımı içindeki sıradaki adım mı?
 * Kendisinden ÖNCEKİ tüm adımlar tamamlanmışsa sıradaki adımdır (LP-01).
 */
function isNextInSequence(content: ContentItem, context: RecommendationContext): boolean {
  const siblings = context.contents
    .filter((item) => item.outcomeId === content.outcomeId && item.state === 'PUBLISHED')
    .sort(byTypeOrder);

  const index = siblings.findIndex((item) => item.id === content.id);
  if (index <= 0) return index === 0;

  return siblings
    .slice(0, index)
    .every((item) => context.progressByContent.get(item.id)?.state === 'completed');
}

export function byTypeOrder(a: ContentItem, b: ContentItem): number {
  const order = CONTENT_TYPE_ORDER[a.type] - CONTENT_TYPE_ORDER[b.type];
  return order !== 0 ? order : a.title.localeCompare(b.title, 'tr-TR');
}

/** Kazanımın herhangi bir içeriğine en son ne zaman dokunuldu? */
function outcomeIdleDays(
  outcomeId: string,
  context: RecommendationContext,
  nowMs: number,
): number | null {
  const timestamps = context.contents
    .filter((content) => content.outcomeId === outcomeId)
    .map((content) => context.progressByContent.get(content.id)?.lastAccessedAt)
    .filter((value): value is string => typeof value === 'string');

  if (timestamps.length === 0) return null;

  const latest = timestamps.reduce((max, value) => (value > max ? value : max));
  return daysSince(latest, nowMs);
}

/** En son başarısız olunan değerlendirme (varsa). */
function lastFailedAssessment(
  context: RecommendationContext,
): { outcomeId: string; scorePercent: number } | null {
  let latest: { outcomeId: string; scorePercent: number; at: string } | null = null;

  for (const content of context.contents) {
    if (!isAssessmentContent(content.type)) continue;

    const progress = context.progressByContent.get(content.id);
    if (
      !progress ||
      progress.scorePercent === null ||
      progress.scorePercent >= LEARNING_THRESHOLDS.failingScore
    ) {
      continue;
    }

    const at = progress.completedAt ?? progress.lastAccessedAt ?? '';
    if (!latest || at > latest.at) {
      latest = { outcomeId: content.outcomeId, scorePercent: progress.scorePercent, at };
    }
  }

  return latest ? { outcomeId: latest.outcomeId, scorePercent: latest.scorePercent } : null;
}

/** Aynı kazanımdan gelen önerileri sınırlar — liste tek konuya boğulmasın. */
function limitPerOutcome(
  recommendations: readonly Recommendation[],
  max: number,
): Recommendation[] {
  const counts = new Map<string, number>();
  const result: Recommendation[] = [];

  for (const recommendation of recommendations) {
    const count = counts.get(recommendation.outcomeId) ?? 0;
    if (count >= max) continue;

    counts.set(recommendation.outcomeId, count + 1);
    result.push(recommendation);
  }

  return result;
}
