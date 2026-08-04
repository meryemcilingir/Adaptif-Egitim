import {
  Attempt,
  AttemptAnswer,
  GraderScore,
  GradingAnswerView,
  GradingConflict,
  RegradeRecord,
} from '../../../../../features/adaptive-learning/models/attempt.model';
import { AnswerValue } from '../../../../../features/adaptive-learning/models/exam-session.model';
import {
  QUESTION_TYPE_META,
  Question,
} from '../../../../../features/adaptive-learning/models/question.model';
import { detectConflict } from '../../../../../features/adaptive-learning/domain/grading.rules';
import { FakeDb } from '../../db/fake-db';
import { answerKindOf } from '../session/session-context';

/**
 * Değerlendirme uçlarının ortak derleyicisi.
 *
 * Değerlendiriciye giden veri, öğrenciye gidenin TERSİDİR: burada doğru cevap
 * bilinçli olarak taşınır, çünkü uzman karşılaştırma yapabilmelidir.
 */

/**
 * Değerlendirici puanları ve çakışma çözümü nerede saklanır?
 *
 * `Attempt` üzerinde ayrı alanlar açmak yerine `scoreHistory` yeniden kullanılır:
 * her puanlama zaten oraya gerekçesiyle yazılır (BR-12). Kim ne verdi bilgisi
 * bu kayıtlardan türetilir, ikinci bir kaynak tutulmaz (ADR-050).
 */
export function graderScoresOf(attempt: Attempt, questionId: string): GraderScore[] {
  const changes = attempt.scoreHistory.filter((change) => change.questionId === questionId);

  // Aynı uzmanın birden çok kaydından yalnızca SONUNCUSU geçerlidir.
  const latestByGrader = new Map<string, GraderScore>();

  for (const change of changes) {
    latestByGrader.set(change.changedBy, {
      graderId: change.changedBy,
      graderName: change.changedByName,
      points: change.newScore,
      feedback: '',
      rubricScores: [],
      gradedAt: change.changedAt,
    });
  }

  return [...latestByGrader.values()];
}

export function conflictsOf(db: FakeDb, attempt: Attempt): GradingConflict[] {
  const questions = db.collection('questions');
  const conflicts: GradingConflict[] = [];

  for (const answer of attempt.answers) {
    const scores = graderScoresOf(attempt, answer.questionId);
    const question = questions.findById(answer.questionId);

    const resolution = resolutionOf(attempt, answer.questionId);
    const conflict = detectConflict(
      answer.questionId,
      question?.title ?? 'Soru',
      scores,
      resolution,
    );

    if (conflict) conflicts.push(conflict);
  }

  return conflicts;
}

/**
 * Çakışmanın nihai kararı.
 *
 * Karar da bir puan değişikliğidir; gerekçesi `ÇAKIŞMA:` önekiyle yazılır.
 * Böylece sıradan bir düzeltmeden ayrılır ve ayrı bir alan gerekmez.
 */
export const CONFLICT_PREFIX = 'ÇAKIŞMA:';

function resolutionOf(
  attempt: Attempt,
  questionId: string,
): { points: number; by: string; reason: string } | null {
  const decision = [...attempt.scoreHistory]
    .reverse()
    .find(
      (change) => change.questionId === questionId && change.reason.startsWith(CONFLICT_PREFIX),
    );

  if (!decision) return null;

  return {
    points: decision.newScore,
    by: decision.changedByName,
    reason: decision.reason.slice(CONFLICT_PREFIX.length).trim(),
  };
}

/* ── Cevap görünümü ──────────────────────────────────────────────────────── */

export function buildAnswerViews(db: FakeDb, attempt: Attempt): GradingAnswerView[] {
  const questions = db.collection('questions');

  return attempt.answers.map((answer, index) => {
    const question = questions.findById(answer.questionId);

    return {
      questionId: answer.questionId,
      order: index + 1,
      code: question?.code ?? '',
      title: question?.title ?? 'Silinmiş soru',
      stem: question?.stem ?? '',
      typeLabel: question ? QUESTION_TYPE_META[question.type].label : '',
      answerKind: question ? answerKindOf(question) : 'text',
      value: answer.value,
      displayAnswer: describeAnswer(question, answer.value),
      expectedAnswer: question ? describeExpected(question) : '',
      maxPoints: answer.maxPoints,
      awardedPoints: answer.awardedPoints,
      autoGraded: answer.autoGraded,
      correct: answer.correct,
      feedback: answer.feedback,
      rubricScores: answer.rubricScores,
      rubricId: question?.rubricId ?? null,
      graderScores: graderScoresOf(attempt, answer.questionId),
    };
  });
}

/**
 * Öğrencinin cevabını okunabilir metne çevirir.
 *
 * Ham `AnswerValue` değerlendiriciye gösterilemez: seçenek kimlikleri hiçbir şey
 * ifade etmez. Metne çevirme tek yerde yapılır; kuyruk, detay ve dışa aktarım
 * aynı gösterimi kullanır.
 */
export function describeAnswer(question: Question | undefined, value: AnswerValue): string {
  switch (value.kind) {
    case 'choice': {
      if (!question) return value.optionIds.join(', ');
      const labels = value.optionIds.map(
        (id) => question.options.find((option) => option.id === id)?.text ?? id,
      );
      return labels.length > 0 ? labels.join(' · ') : '—';
    }
    case 'boolean':
      return value.value === null ? '—' : value.value ? 'Doğru' : 'Yanlış';
    case 'numeric':
      return value.value === null ? '—' : String(value.value);
    case 'text':
      return value.value.trim() || '—';
    case 'pairs': {
      if (!question) return '—';
      const parts = value.pairs.map((pair) => {
        const left = question.matchPairs.find((item) => item.id === pair.leftId)?.left ?? pair.leftId;
        const right =
          question.matchPairs.find((item) => item.id === pair.rightId)?.right ?? pair.rightId;
        return `${left} → ${right}`;
      });
      return parts.length > 0 ? parts.join(' · ') : '—';
    }
    case 'sequence': {
      if (!question) return '—';
      const parts = value.itemIds.map(
        (id) => question.sequenceItems.find((item) => item.id === id)?.text ?? id,
      );
      return parts.length > 0 ? parts.join(' → ') : '—';
    }
  }
}

/** Doğru cevabın okunabilir hâli — değerlendiriciye karşılaştırma için. */
export function describeExpected(question: Question): string {
  const meta = QUESTION_TYPE_META[question.type];

  switch (meta.answerShape) {
    case 'options': {
      const correct = question.options.filter((option) => option.correct);
      return correct.map((option) => option.text).join(' · ') || '—';
    }
    case 'numeric': {
      const tolerance = question.numericTolerance;
      const base = question.expectedAnswer ?? '—';
      return tolerance ? `${base} (±${tolerance})` : base;
    }
    case 'text':
      return question.expectedAnswer?.split('|').join(' / ') ?? '—';
    case 'pairs':
      return question.matchPairs.map((pair) => `${pair.left} → ${pair.right}`).join(' · ') || '—';
    case 'sequence':
      return (
        [...question.sequenceItems]
          .sort((a, b) => a.order - b.order)
          .map((item) => item.text)
          .join(' → ') || '—'
      );
    case 'manual':
      return question.explanation || 'Rubrikle değerlendirilir.';
  }
}

/* ── Yeniden değerlendirme ───────────────────────────────────────────────── */

/**
 * İtiraz kayıtları da `scoreHistory` üzerinden türetilir.
 *
 * `REGRADE:` önekiyle yazılan kayıtlar itiraz sürecine aittir. Ayrı koleksiyon
 * açmamanın bedeli bu önek ayrıştırmasıdır; karşılığında "puan geçmişi" tek bir
 * yerde kalır ve denetim kaydıyla birebir örtüşür.
 */
export const REGRADE_PREFIX = 'İTİRAZ:';

export function regradesOf(attempt: Attempt): RegradeRecord[] {
  return attempt.scoreHistory
    .filter((change) => change.reason.startsWith(REGRADE_PREFIX))
    .map((change) => ({
      id: change.id,
      attemptId: attempt.id,
      questionId: change.questionId,
      state: 'RESOLVED' as const,
      reason: change.reason.slice(REGRADE_PREFIX.length).trim(),
      previousScore: change.previousScore,
      newScore: change.newScore,
      requestedBy: change.changedBy,
      requestedByName: change.changedByName,
      requestedAt: change.changedAt,
      resolvedBy: change.changedBy,
      resolvedByName: change.changedByName,
      resolvedAt: change.changedAt,
      resolutionNote: '',
    }));
}

/** Denemeye ait oturum — zaman çizelgesi ve bütünlük sinyalleri oradan gelir. */
export function sessionOf(db: FakeDb, attempt: Attempt) {
  return db
    .collection('sessions')
    .filter((session) => session.token === attempt.sessionToken)
    .at(0);
}

/** Elle puanlanması gereken cevaplar — kuyruktaki "bekleyen" sayısı. */
export function manualAnswers(db: FakeDb, answers: readonly AttemptAnswer[]): AttemptAnswer[] {
  const questions = db.collection('questions');

  return answers.filter((answer) => {
    const question = questions.findById(answer.questionId);
    return question ? QUESTION_TYPE_META[question.type].manuallyGraded : !answer.autoGraded;
  });
}
