import { ContentItem, ContentProgress, ContentProgressState } from '../models/content-item.model';
import { LearningPath, LearningPathSection, LearningPathStep } from '../models/learning-path.model';
import { RecommendationReason } from '../models/recommendation.model';
import { byTypeOrder } from './recommendation.engine';
import { LEARNING_THRESHOLDS, MasteryMap, PrerequisiteMap, evaluateUnlock } from './learning-rules';

/**
 * Öğrenciye özel öğrenme yolunu üretir (LP-01, LP-02).
 *
 * Yol TÜRETİLMİŞ veridir; saklanmaz. Girdileri:
 *  · kazanımların önkoşul ilişkileri,
 *  · öğrencinin tamamladığı içerikler,
 *  · kazanım ustalık skorları.
 *
 * Sıra kuralı: kazanımlar ders içindeki sıralarına, her kazanımın içerikleri de
 * pedagojik tür sırasına (video → sunum → pdf → quiz → ödev) göre dizilir.
 * Önkoşulu tamamlanmamış kazanımın TÜM adımları kilitlenir.
 *
 * SAF fonksiyon — doğrudan test edilir.
 */

export interface PathOutcome {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly order: number;
}

export interface LearningPathInput {
  readonly studentId: string;
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseName: string;
  readonly outcomes: readonly PathOutcome[];
  readonly contents: readonly ContentItem[];
  readonly progressByContent: ReadonlyMap<string, ContentProgress>;
  readonly mastery: MasteryMap;
  readonly prerequisites: PrerequisiteMap;
  /** Kazanım kimliği → kod (kilit gerekçesini okunabilir yazmak için). */
  readonly outcomeCodeById: ReadonlyMap<string, string>;
  readonly nowIso: string;
}

export function buildLearningPath(input: LearningPathInput): LearningPath {
  const sections: LearningPathSection[] = [];
  let order = 0;
  let currentStep: LearningPathStep | null = null;
  let currentOutcomeCode: string | null = null;

  const orderedOutcomes = [...input.outcomes].sort((a, b) => a.order - b.order);

  for (const outcome of orderedOutcomes) {
    const unlock = evaluateUnlock(outcome.id, input.prerequisites, input.mastery);
    const blockedLabel = unlock.unlocked
      ? null
      : unlock.missingOutcomeIds.map((id) => input.outcomeCodeById.get(id) ?? id).join(', ');

    const contents = input.contents
      .filter((content) => content.outcomeId === outcome.id && content.state === 'PUBLISHED')
      .sort(byTypeOrder);

    const steps: LearningPathStep[] = [];

    for (const content of contents) {
      const progress = input.progressByContent.get(content.id);
      const state = resolveStepState(unlock.unlocked, progress, steps);

      const step: LearningPathStep = {
        order: ++order,
        contentId: content.id,
        title: content.title,
        type: content.type,
        difficulty: content.difficulty,
        estimatedDurationMinutes: content.estimatedDurationMinutes,
        state,
        completionPercent: progress?.completionPercent ?? 0,
        blockedByOutcomeIds: state === 'locked' ? unlock.missingOutcomeIds : [],
        blockedByLabel: state === 'locked' ? blockedLabel : null,
        reasons: buildStepReasons(
          state,
          outcome,
          input.mastery.get(outcome.id) ?? null,
          blockedLabel,
        ),
      };

      steps.push(step);

      // İlk "devam edilebilir" adım öğrencinin bulunduğu noktadır.
      if (currentStep === null && (state === 'in_progress' || state === 'recommended')) {
        currentStep = step;
        currentOutcomeCode = outcome.code;
      }
    }

    const completedSteps = steps.filter((step) => step.state === 'completed').length;

    sections.push({
      outcomeId: outcome.id,
      outcomeCode: outcome.code,
      outcomeTitle: outcome.title,
      masteryScore: input.mastery.get(outcome.id) ?? null,
      state: sectionState(steps, unlock.unlocked),
      steps,
      completedSteps,
      totalSteps: steps.length,
    });
  }

  const allSteps = sections.flatMap((section) => section.steps);
  const totalMinutes = allSteps.reduce((sum, step) => sum + step.estimatedDurationMinutes, 0);
  const completedMinutes = allSteps
    .filter((step) => step.state === 'completed')
    .reduce((sum, step) => sum + step.estimatedDurationMinutes, 0);

  return {
    studentId: input.studentId,
    courseId: input.courseId,
    courseCode: input.courseCode,
    courseName: input.courseName,
    sections,
    currentStep,
    currentOutcomeCode,
    totalMinutes,
    completedMinutes,
    completionPercent: totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0,
    generatedAt: input.nowIso,
  };
}

/**
 * Adımın durumu.
 *
 * · Kazanım kilitliyse tüm adımlar `locked`.
 * · Kaydedilmiş ilerleme varsa (devam eden/tamamlanan) o durum korunur.
 * · Kendisinden önceki adımlar bittiyse `recommended` — öğrenci buradan devam eder.
 * · Aksi hâlde `not_started`.
 */
function resolveStepState(
  outcomeUnlocked: boolean,
  progress: ContentProgress | undefined,
  previousSteps: readonly LearningPathStep[],
): ContentProgressState {
  if (!outcomeUnlocked) return 'locked';
  if (progress?.state === 'completed') return 'completed';
  if (progress?.state === 'in_progress') return 'in_progress';

  const previousDone = previousSteps.every((step) => step.state === 'completed');
  return previousDone ? 'recommended' : 'not_started';
}

function sectionState(steps: readonly LearningPathStep[], unlocked: boolean): ContentProgressState {
  if (!unlocked) return 'locked';
  if (steps.length === 0) return 'not_started';
  if (steps.every((step) => step.state === 'completed')) return 'completed';
  if (steps.some((step) => step.state === 'in_progress' || step.state === 'completed')) {
    return 'in_progress';
  }
  return steps.some((step) => step.state === 'recommended') ? 'recommended' : 'not_started';
}

/** Her adımın neden bu durumda olduğunu açıklar — şeffaflık kuralı (BR-16). */
function buildStepReasons(
  state: ContentProgressState,
  outcome: PathOutcome,
  masteryScore: number | null,
  blockedLabel: string | null,
): RecommendationReason[] {
  switch (state) {
    case 'locked':
      return [
        {
          rule: 'prerequisite_gap',
          explanation: `Bu adım kilitli: önce ${blockedLabel} kazanımını ${LEARNING_THRESHOLDS.unlockMastery} seviyesine çıkarmalısınız.`,
          contribution: 0,
          evidence: {
            missingPrerequisites: blockedLabel ?? '',
            requiredMastery: LEARNING_THRESHOLDS.unlockMastery,
          },
        },
      ];

    case 'recommended':
      return [
        {
          rule: 'next_in_sequence',
          explanation: 'Bu içerik öğrenme yolunuzdaki bir sonraki adımdır.',
          contribution: 0,
          evidence: { outcome: outcome.code, masteryScore: masteryScore ?? 0 },
        },
      ];

    case 'in_progress':
      return [
        {
          rule: 'incomplete_content',
          explanation: 'Bu içeriğe başladınız; kaldığınız yerden devam edebilirsiniz.',
          contribution: 0,
          evidence: { outcome: outcome.code },
        },
      ];

    default:
      return [];
  }
}
