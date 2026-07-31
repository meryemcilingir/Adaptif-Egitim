import {
  ContentItem,
  ContentProgress,
} from '../../../../../features/adaptive-learning/models/content-item.model';
import { Course } from '../../../../../features/adaptive-learning/models/course.model';
import { Exam } from '../../../../../features/adaptive-learning/models/exam.model';
import { LearningOutcome } from '../../../../../features/adaptive-learning/models/learning-outcome.model';
import { LearningPath } from '../../../../../features/adaptive-learning/models/learning-path.model';
import { Recommendation } from '../../../../../features/adaptive-learning/models/recommendation.model';
import { buildLearningPath } from '../../../../../features/adaptive-learning/domain/learning-path.builder';
import {
  MasteryMap,
  PrerequisiteMap,
} from '../../../../../features/adaptive-learning/domain/learning-rules';
import { recommend } from '../../../../../features/adaptive-learning/domain/recommendation.engine';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import { FakeDb } from '../../db/fake-db';

/**
 * Öğrenciye özel adaptif verinin TEK derleme noktası.
 *
 * Öğrenme yolu, öneriler ve öğrenci dashboard'ı aynı girdilere ihtiyaç duyar
 * (içerikler, ilerleme, ustalık, önkoşullar). Bu dosya o girdileri bir kez
 * toplar; üç uç nokta da aynı veriyi kullanır → tutarsızlık imkânsız (DRY).
 *
 * Hesaplamanın kendisi burada DEĞİL, saf domain fonksiyonlarındadır
 * (`learning-path.builder.ts`, `recommendation.engine.ts`).
 */

export interface StudentCourseContext {
  readonly course: Course;
  readonly outcomes: readonly LearningOutcome[];
  readonly contents: readonly ContentItem[];
  readonly mastery: MasteryMap;
  /** Dersin en yakın planlı sınavına kalan gün (yoksa null). */
  readonly daysUntilExam: number | null;
  readonly upcomingExam: Exam | null;
}

export interface StudentLearningContext {
  readonly studentId: string;
  readonly nowMs: number;
  readonly nowIso: string;
  readonly courses: readonly StudentCourseContext[];
  readonly contents: readonly ContentItem[];
  readonly progress: readonly ContentProgress[];
  readonly progressByContent: ReadonlyMap<string, ContentProgress>;
  readonly prerequisites: PrerequisiteMap;
  readonly outcomeCodeById: ReadonlyMap<string, string>;
}

/**
 * Öğrencinin gördüğü dersler: kayıtlı olduğu grupların (cohort) dersleri.
 * Yalnızca YAYINDAKİ içerikler öğrenme yoluna girer — taslak içerik öğrenciye gösterilmez.
 */
export function buildStudentLearningContext(
  db: FakeDb,
  studentId: string,
  now: number,
): StudentLearningContext {
  const student = db.collection('users').findById(studentId);
  const cohortIds = new Set(student?.cohortIds ?? []);

  const courses = db
    .collection('courses')
    .filter(
      (course) => course.state === 'PUBLISHED' && course.cohortIds.some((id) => cohortIds.has(id)),
    );
  const courseIds = new Set(courses.map((course) => course.id));

  const outcomes = db.collection('outcomes').filter((outcome) => courseIds.has(outcome.courseId));
  const contents = db
    .collection('contents')
    .filter((content) => courseIds.has(content.courseId) && content.state === 'PUBLISHED');
  const progress = db.collection('contentProgress').filter((item) => item.studentId === studentId);
  const mastery = db.collection('masteryScores').filter((score) => score.studentId === studentId);

  const masteryByOutcome = new Map(mastery.map((score) => [score.outcomeId, score.score] as const));

  // Ders başına en yakın planlı sınav.
  const upcomingByCourse = new Map<string, Exam>();
  for (const exam of db.collection('exams').all()) {
    if (!courseIds.has(exam.courseId)) continue;
    if (examRuntimeStatus(exam, now) !== 'scheduled') continue;
    if (Date.parse(exam.opensAt) < now) continue;
    if (!exam.cohortIds.some((id) => cohortIds.has(id))) continue;

    const current = upcomingByCourse.get(exam.courseId);
    if (!current || Date.parse(exam.opensAt) < Date.parse(current.opensAt)) {
      upcomingByCourse.set(exam.courseId, exam);
    }
  }

  const courseContexts = courses
    .map((course) => {
      const courseOutcomes = outcomes
        .filter((outcome) => outcome.courseId === course.id)
        .sort((a, b) => a.code.localeCompare(b.code, 'tr-TR'));
      const upcomingExam = upcomingByCourse.get(course.id) ?? null;

      return {
        course,
        outcomes: courseOutcomes,
        contents: contents.filter((content) => content.courseId === course.id),
        mastery: new Map(
          courseOutcomes
            .filter((outcome) => masteryByOutcome.has(outcome.id))
            .map((outcome) => [outcome.id, masteryByOutcome.get(outcome.id)!] as const),
        ) as MasteryMap,
        upcomingExam,
        daysUntilExam: upcomingExam
          ? Math.max(0, Math.round((Date.parse(upcomingExam.opensAt) - now) / 86_400_000))
          : null,
      } satisfies StudentCourseContext;
    })
    .sort((a, b) => a.course.code.localeCompare(b.course.code, 'tr-TR'));

  return {
    studentId,
    nowMs: now,
    nowIso: new Date(now).toISOString(),
    courses: courseContexts,
    contents,
    progress,
    progressByContent: new Map(progress.map((item) => [item.contentId, item] as const)),
    prerequisites: new Map(
      outcomes.map((outcome) => [outcome.id, outcome.prerequisiteIds] as const),
    ),
    outcomeCodeById: new Map(outcomes.map((outcome) => [outcome.id, outcome.code] as const)),
  };
}

/** Öğrencinin tüm derslerindeki öğrenme yolları (ders koduna göre sıralı). */
export function buildStudentPaths(context: StudentLearningContext): LearningPath[] {
  return context.courses.map((entry) =>
    buildLearningPath({
      studentId: context.studentId,
      courseId: entry.course.id,
      courseCode: entry.course.code,
      courseName: entry.course.name,
      outcomes: entry.outcomes.map((outcome, index) => ({
        id: outcome.id,
        code: outcome.code,
        title: outcome.title,
        order: index,
      })),
      contents: entry.contents,
      progressByContent: context.progressByContent,
      mastery: entry.mastery,
      prerequisites: context.prerequisites,
      outcomeCodeById: context.outcomeCodeById,
      nowIso: context.nowIso,
    }),
  );
}

/** Tüm derslerden toplanan, önceliğe göre sıralı öneriler. */
export function buildStudentRecommendations(
  context: StudentLearningContext,
  limit = 8,
): Recommendation[] {
  return context.courses
    .flatMap((entry) =>
      recommend({
        studentId: context.studentId,
        courseId: entry.course.id,
        courseCode: entry.course.code,
        contents: entry.contents,
        progressByContent: context.progressByContent,
        outcomes: entry.outcomes.map((outcome, index) => ({
          id: outcome.id,
          code: outcome.code,
          title: outcome.title,
          order: index,
        })),
        mastery: entry.mastery,
        prerequisites: context.prerequisites,
        // Sınav kapsamı ders kazanımlarıdır — yaklaşan sınav tüm kazanımları önceliklendirir.
        upcomingExamOutcomeIds: entry.upcomingExam
          ? entry.outcomes.map((outcome) => outcome.id)
          : [],
        daysUntilExam: entry.daysUntilExam,
        nowIso: context.nowIso,
      }),
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}
