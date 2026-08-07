import {
  COGNITIVE_LEVEL_LABELS,
  DIFFICULTY_LABELS,
} from '../../../../../features/adaptive-learning/models/common.model';
import { BlueprintOutcomeRow } from '../../../../../features/adaptive-learning/models/blueprint.model';
import {
  Exam,
  ExamQuestionRef,
  ExamQuestionView,
} from '../../../../../features/adaptive-learning/models/exam.model';
import { QUESTION_TYPE_META, Question } from '../../../../../features/adaptive-learning/models/question.model';
import {
  ExamQuestionFacts,
  ExamValidationInput,
} from '../../../../../features/adaptive-learning/domain/exam-validation';
import { toPlainText } from '../../../../../shared/utils/rich-text.util';
import { FakeDb } from '../../db/fake-db';

/**
 * Sınav doğrulaması ve kısıt paneli için gereken girdinin TEK derleme noktası.
 *
 * Hem `POST /exams/:id/validate` hem yayına alma kontrolü hem de detay ekranı
 * buradan beslenir; üçü farklı sonuç veremez (Sprint 5'teki `learning-context`
 * ile aynı ilke).
 */
export function buildValidationInput(
  db: FakeDb,
  exam: Pick<
    Exam,
    'id' | 'title' | 'courseId' | 'blueprintId' | 'cohortIds' | 'durationMinutes' | 'opensAt' | 'closesAt' | 'questions'
  >,
): ExamValidationInput {
  const questions = db.collection('questions');
  const versions = db.collection('questionVersions');
  const blueprint = exam.blueprintId
    ? db.collection('blueprints').findById(exam.blueprintId)
    : null;

  const facts: ExamQuestionFacts[] = exam.questions.map((ref) => {
    const question = questions.findById(ref.questionId);
    const version = versions.findById(ref.questionVersionId);

    return {
      questionId: ref.questionId,
      points: ref.points,
      difficulty: question?.difficulty ?? 'medium',
      outcomeIds: question?.outcomeIds ?? [],
      estimatedSolveTimeSeconds: question?.estimatedSolveTimeSeconds ?? 60,
      isPublished: question?.state === 'PUBLISHED' && question.deletedAt === null,
      // Sınav, sorunun güncel yayın versiyonuna mı bağlı?
      isLatestVersion:
        question !== undefined &&
        version !== undefined &&
        version.versionNumber === (question.publishedVersion ?? version.versionNumber),
    };
  });

  const siblingTitles = db
    .collection('exams')
    .filter((item) => item.courseId === exam.courseId && item.id !== exam.id)
    .map((item) => item.title);

  return {
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    opensAt: exam.opensAt,
    closesAt: exam.closesAt,
    cohortIds: exam.cohortIds,
    questions: facts,
    blueprintRows: (blueprint?.rows ?? []) as readonly BlueprintOutcomeRow[],
    hasBlueprint: blueprint !== null,
    isBlueprintPublished: blueprint?.state === 'PUBLISHED',
    targetTotalPoints: blueprint?.targetTotalPoints ?? totalOf(exam.questions),
    siblingTitles,
  };
}

/** Soru listesini ekranda gösterilebilir hâle getirir (kod, başlık, kazanım…). */
export function buildQuestionViews(
  db: FakeDb,
  refs: readonly ExamQuestionRef[],
): ExamQuestionView[] {
  const questions = db.collection('questions');
  const outcomes = db.collection('outcomes');
  const versions = db.collection('questionVersions');

  return [...refs]
    .sort((a, b) => a.order - b.order)
    .flatMap((ref) => {
      const question = questions.findById(ref.questionId);
      if (!question) return [];

      return [
        {
          ...ref,
          code: question.code,
          title: question.title,
          stem: toPlainText(question.stem).slice(0, 200),
          type: question.type,
          typeLabel: QUESTION_TYPE_META[question.type].label,
          difficulty: question.difficulty,
          difficultyLabel: DIFFICULTY_LABELS[question.difficulty],
          level: COGNITIVE_LEVEL_LABELS[question.level],
          outcomeIds: question.outcomeIds,
          outcomeCodes: question.outcomeIds
            .map((id) => outcomes.findById(id)?.code)
            .filter((code): code is string => code !== undefined),
          estimatedSolveTimeSeconds: question.estimatedSolveTimeSeconds,
          isPublished: question.state === 'PUBLISHED' && question.deletedAt === null,
          isLatestVersion:
            versions.findById(ref.questionVersionId)?.versionNumber ===
            (question.publishedVersion ?? ref.versionNumber),
        } satisfies ExamQuestionView,
      ];
    });
}

/**
 * Otomatik seçim için aday soru havuzu ve versiyon eşlemesi.
 * Yalnızca yayındaki ve anlık görüntüsü bulunan sorular döner.
 */
export function buildSelectionPool(
  db: FakeDb,
  courseId: string,
): {
  questions: Question[];
  versionIdByQuestion: Map<string, { id: string; versionNumber: number }>;
} {
  const questions = db
    .collection('questions')
    .filter(
      (question) =>
        question.courseId === courseId &&
        question.state === 'PUBLISHED' &&
        question.deletedAt === null,
    );

  const versionIdByQuestion = new Map<string, { id: string; versionNumber: number }>();

  for (const question of questions) {
    const target = question.publishedVersion ?? question.versionNumber;
    const snapshot =
      db
        .collection('questionVersions')
        .findOne(
          (version) => version.questionId === question.id && version.versionNumber === target,
        ) ??
      db.collection('questionVersions').findOne((version) => version.questionId === question.id);

    if (snapshot) {
      versionIdByQuestion.set(question.id, {
        id: snapshot.id,
        versionNumber: snapshot.versionNumber,
      });
    }
  }

  return { questions, versionIdByQuestion };
}

function totalOf(refs: readonly ExamQuestionRef[]): number {
  return refs.reduce((sum, ref) => sum + ref.points, 0);
}
