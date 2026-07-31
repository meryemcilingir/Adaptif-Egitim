import { examRuntimeStatus } from '../../../../features/adaptive-learning/domain/exam-runtime';
import { recommend } from '../../../../features/adaptive-learning/domain/recommendation.engine';
import {
  ContentItem,
  ContentProgress,
} from '../../../../features/adaptive-learning/models/content-item.model';
import { Course } from '../../../../features/adaptive-learning/models/course.model';
import { LearningOutcome } from '../../../../features/adaptive-learning/models/learning-outcome.model';
import { MasteryScore } from '../../../../features/adaptive-learning/models/mastery.model';
import { Recommendation } from '../../../../features/adaptive-learning/models/recommendation.model';
import { Exam } from '../../../../features/adaptive-learning/models/exam.model';
import { DbSchema } from '../db/db-schema';
import { SeedContext } from './seed-context';
import { seedActivity } from './seed-activity';
import { seedAssessment } from './seed-assessment';
import { seedCatalog } from './seed-catalog';
import { seedNotifications } from './seed-notifications';
import { seedOrganization } from './seed-organization';

/** Öğrenci başına saklanan en fazla öneri — liste ekranları için fazlası gereksiz. */
const MAX_RECOMMENDATIONS_PER_STUDENT = 6;

/**
 * Demo veri setinin tek giriş noktası.
 *
 * Üretim sırası bağımlılık yönünü izler:
 * organizasyon → katalog → ölçme → etkinlik → öneriler → bildirimler.
 * Tüm ilişkiler gerçek kimliklerle kurulur; kopuk kayıt bırakılmaz.
 */
export function buildSeed(): DbSchema {
  const ctx = new SeedContext();

  const organization = seedOrganization(ctx);
  const catalog = seedCatalog(ctx, organization);
  const assessment = seedAssessment(ctx, catalog.courses, catalog.outcomes, catalog.users);
  const activity = seedActivity(
    ctx,
    organization,
    catalog.courses,
    catalog.outcomes,
    assessment.questions,
    assessment.exams,
  );

  // Sınav deneme sayaçlarını gerçek verilerle eşitle.
  const attemptCountByExam = activity.attempts.reduce<Record<string, number>>((counts, attempt) => {
    counts[attempt.examId] = (counts[attempt.examId] ?? 0) + 1;
    return counts;
  }, {});

  const exams = assessment.exams.map((exam) => ({
    ...exam,
    attemptCount: attemptCountByExam[exam.id] ?? 0,
  }));

  // Kazanım başına soru sayısı.
  const outcomes = catalog.outcomes.map((outcome) => ({
    ...outcome,
    questionCount: assessment.questions.filter((question) =>
      question.outcomeIds.includes(outcome.id),
    ).length,
  }));

  const recommendations = buildRecommendations(ctx, {
    courses: catalog.courses,
    contents: catalog.contents,
    progress: catalog.contentProgress,
    outcomes,
    exams,
    masteryScores: activity.masteryScores,
  });

  // Program sayaçları gerçek ders/kazanım/öğrenci verisinden türetilir.
  const programs = organization.programs.map((program) => {
    const programCourses = catalog.courses.filter((course) => course.programId === program.id);
    const courseIds = new Set(programCourses.map((course) => course.id));
    const cohortIds = new Set(programCourses.flatMap((course) => course.cohortIds));

    return {
      ...program,
      courseCount: programCourses.length,
      outcomeCount: outcomes.filter((outcome) => courseIds.has(outcome.courseId)).length,
      studentCount: organization.cohorts
        .filter((cohort) => cohortIds.has(cohort.id))
        .reduce((total, cohort) => total + cohort.studentIds.length, 0),
    };
  });

  return {
    users: catalog.users,
    programs,
    terms: organization.terms,
    cohorts: organization.cohorts,
    courses: catalog.courses,
    outcomes,
    contents: catalog.contents,
    contentProgress: catalog.contentProgress,
    questions: assessment.questions,
    questionVersions: assessment.questionVersions,
    rubrics: assessment.rubrics,
    blueprints: assessment.blueprints,
    exams,
    sessions: activity.sessions,
    answerDrafts: [],
    attempts: activity.attempts,
    masteryScores: activity.masteryScores,
    recommendations,
    itemAnalyses: activity.itemAnalyses,
    auditEvents: activity.auditEvents,
    notifications: seedNotifications(
      ctx,
      catalog.users,
      catalog.courses,
      exams,
      activity.attempts,
      activity.itemAnalyses,
    ),
  };
}

interface RecommendationSeedInput {
  readonly courses: readonly Course[];
  readonly contents: readonly ContentItem[];
  readonly progress: readonly ContentProgress[];
  readonly outcomes: readonly LearningOutcome[];
  readonly exams: readonly Exam[];
  readonly masteryScores: readonly MasteryScore[];
}

/**
 * Öneriler seed sırasında ÜRETİM KODUYLA AYNI motordan geçirilir.
 * Böylece demo verisi ile çalışma zamanı davranışı birbirinden ayrışmaz.
 */
function buildRecommendations(ctx: SeedContext, input: RecommendationSeedInput): Recommendation[] {
  const nowIso = ctx.date(0);
  const nowMs = Date.parse(nowIso);

  const prerequisites = new Map(
    input.outcomes.map((outcome) => [outcome.id, outcome.prerequisiteIds] as const),
  );
  const contentsByCourse = groupBy(input.contents, (content) => content.courseId);
  const progressByStudent = groupBy(input.progress, (item) => item.studentId);
  const outcomesByCourse = groupBy(input.outcomes, (outcome) => outcome.courseId);
  const masteryByStudent = groupBy(input.masteryScores, (score) => score.studentId);
  const courseById = new Map(input.courses.map((course) => [course.id, course] as const));

  // Ders başına en yakın planlı sınav — "yaklaşan sınav" kuralının girdisi.
  const upcomingByCourse = new Map<string, Exam>();
  for (const exam of input.exams.filter(
    (item) => examRuntimeStatus(item, nowMs) === 'scheduled',
  )) {
    const current = upcomingByCourse.get(exam.courseId);
    if (!current || Date.parse(exam.opensAt) < Date.parse(current.opensAt)) {
      upcomingByCourse.set(exam.courseId, exam);
    }
  }

  const recommendations: Recommendation[] = [];

  for (const [studentId, studentScores] of masteryByStudent) {
    const progressByContent = new Map(
      (progressByStudent.get(studentId) ?? []).map((item) => [item.contentId, item] as const),
    );
    const scoresByCourse = groupBy(studentScores, (score) => score.courseId);
    const perStudent: Recommendation[] = [];

    for (const [courseId, courseScores] of scoresByCourse) {
      const upcoming = upcomingByCourse.get(courseId);
      const daysUntilExam = upcoming
        ? Math.max(0, Math.round((Date.parse(upcoming.opensAt) - nowMs) / 86_400_000))
        : null;

      const courseOutcomes = outcomesByCourse.get(courseId) ?? [];

      perStudent.push(
        ...recommend({
          studentId,
          courseId,
          courseCode: courseById.get(courseId)?.code ?? '',
          contents: contentsByCourse.get(courseId) ?? [],
          progressByContent,
          outcomes: courseOutcomes.map((outcome, index) => ({
            id: outcome.id,
            code: outcome.code,
            title: outcome.title,
            order: index,
          })),
          mastery: new Map(courseScores.map((score) => [score.outcomeId, score.score] as const)),
          prerequisites,
          upcomingExamOutcomeIds: courseOutcomes.map((outcome) => outcome.id),
          daysUntilExam,
          nowIso,
        }),
      );
    }

    recommendations.push(
      ...perStudent
        .sort((a, b) => b.priority - a.priority)
        .slice(0, MAX_RECOMMENDATIONS_PER_STUDENT),
    );
  }

  return recommendations;
}

/** Tekrar eden `reduce` kalıbını önleyen küçük yardımcı. */
function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = result.get(key);
    if (list) list.push(item);
    else result.set(key, [item]);
  }
  return result;
}
