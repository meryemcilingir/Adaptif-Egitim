import {
  Question,
  QuestionDetail,
  QuestionOutcomeRef,
  QuestionStatistics,
  QuestionUsage,
  QuestionVersion,
} from '../../../../../features/adaptive-learning/models/question.model';
import { ITEM_FLAG_LABELS } from '../../../../../features/adaptive-learning/models/item-analysis.model';
import { isQuestionEditable } from '../../../../../features/adaptive-learning/domain/question.rules';
import { FakeDb } from '../../db/fake-db';

/**
 * Soru detay payload'ı.
 *
 * İstatistik ve kullanım blokları BUGÜN madde analizi ve sınav koleksiyonlarından
 * türetilir; sınav modülü geliştiğinde aynı sözleşme gerçek veriyle dolar ve
 * ekranın değişmesi gerekmez (Sprint 5 §9).
 */
export function buildQuestionDetail(
  db: FakeDb,
  question: Question,
  callerId: string,
): QuestionDetail {
  const course = db.collection('courses').findById(question.courseId);
  const outcomes = db.collection('outcomes');

  const versions: QuestionVersion[] = db
    .collection('questionVersions')
    .filter((version) => version.questionId === question.id)
    .sort((a, b) => b.versionNumber - a.versionNumber);

  return {
    question,
    courseCode: course?.code ?? '',
    courseName: course?.name ?? '',
    outcomes: question.outcomeIds
      .map((id) => outcomes.findById(id))
      .filter((outcome) => outcome !== undefined)
      .map((outcome): QuestionOutcomeRef => ({
        id: outcome.id,
        code: outcome.code,
        title: outcome.title,
      })),
    versions,
    statistics: buildStatistics(db, question),
    usage: buildUsage(db, question),
    createdByName: questionAuthorName(db, question.createdBy),
    updatedByName: questionAuthorName(db, question.updatedBy),
    isFavorite: question.favoritedBy.includes(callerId),
    isEditable: isQuestionEditable(question.state),
  };
}

/** Madde analizi varsa gerçek değerler, yoksa `null` — uydurma sayı üretilmez. */
function buildStatistics(db: FakeDb, question: Question): QuestionStatistics {
  const analysis = db.collection('itemAnalyses').findOne((item) => item.questionId === question.id);

  if (!analysis) {
    return {
      correctRatePercent: null,
      averageSolveTimeSeconds: null,
      discrimination: null,
      sampleSize: 0,
      flags: [],
    };
  }

  return {
    correctRatePercent: Math.round(analysis.difficultyIndex * 100),
    averageSolveTimeSeconds: Math.round(analysis.averageTimeSeconds),
    discrimination: Math.round(analysis.discrimination * 100) / 100,
    sampleSize: analysis.sampleSize,
    flags: analysis.flags.map(
      (flag) => ITEM_FLAG_LABELS[flag as keyof typeof ITEM_FLAG_LABELS] ?? flag,
    ),
  };
}

/** Sorunun geçtiği sınavlar — sınav modülü gelene kadar tek gerçek kullanım kaynağı. */
function buildUsage(db: FakeDb, question: Question): QuestionUsage {
  const courses = db.collection('courses');

  const exams = db
    .collection('exams')
    .filter((exam) => exam.questions.some((ref) => ref.questionId === question.id))
    .sort((a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt))
    .map((exam) => ({
      examId: exam.id,
      examTitle: exam.title,
      courseCode: courses.findById(exam.courseId)?.code ?? '',
      opensAt: exam.opensAt,
      state: exam.state,
    }));

  return { usageCount: exams.length, exams };
}

/** Kullanıcı kimliğini okunabilir ada çevirir; ad bulunamazsa nötr metin döner. */
export function questionAuthorName(db: FakeDb, userId: string): string {
  return db.collection('users').findById(userId)?.fullName ?? 'Bilinmiyor';
}
