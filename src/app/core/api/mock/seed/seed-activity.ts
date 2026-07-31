import { AuditEvent } from '../../../observability/audit.model';
import {
  Attempt,
  AttemptAnswer,
  AttemptState,
} from '../../../../features/adaptive-learning/models/attempt.model';
import { Course } from '../../../../features/adaptive-learning/models/course.model';
import { Difficulty } from '../../../../features/adaptive-learning/models/common.model';
import { Exam } from '../../../../features/adaptive-learning/models/exam.model';
import {
  ItemAnalysis,
  ItemFlag,
} from '../../../../features/adaptive-learning/models/item-analysis.model';
import { LearningOutcome } from '../../../../features/adaptive-learning/models/learning-outcome.model';
import { MasteryScore } from '../../../../features/adaptive-learning/models/mastery.model';
import {
  Question,
  isManuallyGraded,
} from '../../../../features/adaptive-learning/models/question.model';
import {
  AnswerValue,
  ExamSession,
} from '../../../../features/adaptive-learning/models/exam-session.model';
import {
  AnswerSignal,
  calculateMastery,
} from '../../../../features/adaptive-learning/domain/mastery.calculator';
import { MockUser } from '../db/db-schema';
import { OrganizationSeed } from './seed-organization';
import { examRuntimeStatus } from '../../../../features/adaptive-learning/domain/exam-runtime';
import { SeedContext } from './seed-context';

export interface ActivitySeed {
  readonly attempts: Attempt[];
  readonly sessions: ExamSession[];
  readonly masteryScores: MasteryScore[];
  readonly itemAnalyses: ItemAnalysis[];
  readonly auditEvents: AuditEvent[];
}

/** Öğrencinin gizli yeteneği — cevapların doğru olma olasılığını belirler. */
interface StudentAbility {
  readonly studentId: string;
  readonly ability: number;
}

const DIFFICULTY_PENALTY: Readonly<Record<Difficulty, number>> = {
  easy: 0.12,
  medium: 0,
  hard: -0.16,
};

/** Sınava girmeyen öğrenci oranı — katılım oranını gerçekçi tutar. */
const ABSENCE_RATE = 0.07;
/** İkinci hakkı olan sınavlarda tekrar giren öğrenci oranı. */
const RETAKE_RATE = 0.35;
/** Madde analizi için gereken en küçük örneklem. */
const MIN_ITEM_SAMPLE = 5;

/**
 * Denemeler, oturumlar, ustalık skorları, madde analizleri ve denetim kayıtları.
 *
 * Veri gerçekçi olsun diye her öğrenciye gizli bir "yetenek" değeri atanır;
 * cevap doğruluğu bu yetenek ile soru zorluğunun bileşiminden üretilir.
 * Böylece madde analizi (ayırt edicilik) ve cohort karşılaştırması anlamlı sonuç verir.
 */
export function seedActivity(
  ctx: SeedContext,
  organization: OrganizationSeed,
  courses: readonly Course[],
  outcomes: readonly LearningOutcome[],
  questions: readonly Question[],
  exams: readonly Exam[],
): ActivitySeed {
  const abilities: StudentAbility[] = organization.studentIds.map((studentId) => ({
    studentId,
    ability: ctx.rng.float(0.25, 0.95),
  }));

  const attempts = buildAttempts(ctx, organization, courses, exams, questions, abilities);
  const sessions = buildSessions(ctx, organization, exams);
  const masteryScores = buildMastery(ctx, organization, courses, outcomes, questions, attempts);
  const itemAnalyses = buildItemAnalyses(ctx, questions, attempts, outcomes);
  const auditEvents = buildAuditEvents(ctx, organization.users, courses, exams, attempts);

  return { attempts, sessions, masteryScores, itemAnalyses, auditEvents };
}

/* ── Denemeler ───────────────────────────────────────────────────────────── */

function buildAttempts(
  ctx: SeedContext,
  organization: OrganizationSeed,
  courses: readonly Course[],
  exams: readonly Exam[],
  questions: readonly Question[],
  abilities: readonly StudentAbility[],
): Attempt[] {
  const attempts: Attempt[] = [];
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const abilityById = new Map(abilities.map((item) => [item.studentId, item.ability]));
  const userById = new Map(organization.users.map((user) => [user.id, user]));
  const cohortById = new Map(organization.cohorts.map((cohort) => [cohort.id, cohort]));

  // Denemeler yalnızca penceresi kapanmış sınavlar için üretilir.
  const nowMs = Date.parse(ctx.date(0));
  for (const exam of exams.filter((item) => examRuntimeStatus(item, nowMs) === 'closed')) {
    const course = courses.find((item) => item.id === exam.courseId)!;

    for (const cohortId of exam.cohortIds) {
      const cohort = cohortById.get(cohortId);
      if (!cohort) continue;

      for (const studentId of cohort.studentIds) {
        if (ctx.rng.bool(ABSENCE_RATE)) continue;

        const ability = abilityById.get(studentId) ?? 0.5;
        const student = userById.get(studentId);
        if (!student) continue;

        attempts.push(
          buildAttempt(ctx, {
            exam,
            course,
            student,
            cohortId,
            ability,
            attemptNumber: 1,
            questionById,
          }),
        );

        // İkinci hakkı olan sınavlarda bazı öğrenciler tekrar girer (daha iyi performansla).
        if (exam.rules.maxAttempts > 1 && ctx.rng.bool(RETAKE_RATE)) {
          attempts.push(
            buildAttempt(ctx, {
              exam,
              course,
              student,
              cohortId,
              ability: Math.min(0.98, ability + ctx.rng.float(0.05, 0.2)),
              attemptNumber: 2,
              questionById,
            }),
          );
        }
      }
    }
  }

  return attempts;
}

interface AttemptInput {
  readonly exam: Exam;
  readonly course: Course;
  readonly student: MockUser;
  readonly cohortId: string;
  readonly ability: number;
  readonly attemptNumber: number;
  readonly questionById: ReadonlyMap<string, Question>;
}

function buildAttempt(ctx: SeedContext, input: AttemptInput): Attempt {
  const { exam, course, student, cohortId, ability, attemptNumber, questionById } = input;

  const answers: AttemptAnswer[] = exam.questions.map((ref) => {
    const question = questionById.get(ref.questionId)!;
    const successChance = clamp(ability + DIFFICULTY_PENALTY[question.difficulty], 0.05, 0.97);
    const correct = ctx.rng.bool(successChance);
    const manual = isManuallyGraded(question.type);

    // Kısmi puan yalnızca izin verilen sorularda oluşur (BR-11).
    const creditRatio = correct ? 1 : question.allowPartialCredit && ctx.rng.bool(0.35) ? 0.5 : 0;

    return {
      questionId: question.id,
      questionVersionId: ref.questionVersionId,
      value: buildAnswerValue(ctx, question, correct),
      maxPoints: ref.points,
      awardedPoints: Math.round(ref.points * creditRatio * 10) / 10,
      autoGraded: !manual,
      correct: manual ? null : correct,
      gradedBy: manual ? null : 'system',
      feedback: '',
      rubricScores: [],
      timeSpentSeconds: ctx.rng.int(35, 300),
    };
  });

  const hasManual = answers.some((answer) => !answer.autoGraded);
  const state: AttemptState = hasManual
    ? ctx.rng.weighted<AttemptState>([
        ['PENDING_MANUAL', 40],
        ['GRADED', 35],
        ['RELEASED', 25],
      ])
    : ctx.rng.weighted<AttemptState>([
        ['RELEASED', 55],
        ['GRADED', 35],
        ['AUTO_GRADED', 10],
      ]);

  // Değerlendirilmemiş açık uçlular henüz puan almamıştır.
  const effectiveAnswers =
    state === 'PENDING_MANUAL'
      ? answers.map((answer) => (answer.autoGraded ? answer : { ...answer, awardedPoints: 0 }))
      : answers.map((answer) =>
          answer.autoGraded
            ? answer
            : {
                ...answer,
                awardedPoints: Math.round(answer.maxPoints * ctx.rng.float(0.3, 1) * 10) / 10,
                gradedBy: course.instructorId,
                feedback: ctx.rng.pick([
                  'Gerekçelendirme yeterli, anlatım daha net olabilir.',
                  'Kavramsal doğruluk iyi; çözüm adımları eksik.',
                  'Örnek uygun seçilmiş, sonuç doğru yorumlanmış.',
                ]),
              },
        );

  const totalScore = round1(
    effectiveAnswers.reduce((sum, answer) => sum + answer.awardedPoints, 0),
  );
  const startOffset = attemptNumber === 1 ? 0 : 1440;
  const startedAt = ctx.minutesFrom(exam.opensAt, startOffset);
  const submittedAt = ctx.minutesFrom(startedAt, ctx.rng.int(25, exam.durationMinutes));

  return {
    id: ctx.id('atp'),
    examId: exam.id,
    examTitle: exam.title,
    courseId: exam.courseId,
    studentId: student.id,
    studentName: student.fullName,
    cohortId,
    sessionToken: ctx.id('tok'),
    attemptNumber,
    state,
    answers: effectiveAnswers,
    totalScore,
    maxScore: exam.totalPoints,
    scorePercent: exam.totalPoints > 0 ? Math.round((totalScore / exam.totalPoints) * 100) : 0,
    passed: totalScore >= exam.rules.passingScore,
    startedAt,
    submittedAt,
    gradedAt: state === 'PENDING_MANUAL' ? null : ctx.minutesFrom(submittedAt, 2880),
    releasedAt: state === 'RELEASED' ? ctx.minutesFrom(submittedAt, 4320) : null,
    durationSeconds: effectiveAnswers.reduce((sum, answer) => sum + answer.timeSpentSeconds, 0),
    scoreHistory: [],
    createdAt: submittedAt,
    updatedAt: submittedAt,
    version: 1,
  };
}

function buildAnswerValue(ctx: SeedContext, question: Question, correct: boolean): AnswerValue {
  switch (question.type) {
    case 'single_choice':
    case 'multiple_choice': {
      const correctIds = question.options.filter((option) => option.correct).map((o) => o.id);
      const wrongIds = question.options.filter((option) => !option.correct).map((o) => o.id);
      if (correct) return { kind: 'choice', optionIds: correctIds };
      return { kind: 'choice', optionIds: wrongIds.length > 0 ? [ctx.rng.pick(wrongIds)] : [] };
    }
    case 'true_false': {
      const correctOption = question.options.find((option) => option.correct);
      const isTrue = correctOption?.text === 'Doğru';
      return { kind: 'boolean', value: correct ? isTrue : !isTrue };
    }
    case 'numeric': {
      const expected = Number(question.expectedAnswer ?? 0);
      return { kind: 'numeric', value: correct ? expected : expected + ctx.rng.int(1, 12) };
    }
    default:
      return {
        kind: 'text',
        value: correct
          ? 'Tanım gereği sonuç doğrudur; çözüm adımları sırasıyla uygulanmıştır.'
          : 'Kısmi açıklama yapılmış, gerekçelendirme eksik bırakılmıştır.',
      };
  }
}

/* ── Oturumlar ───────────────────────────────────────────────────────────── */

/** Demo öğrencisi için bir aktif oturum bırakılır — sınav ekranı hemen gösterilebilsin. */
function buildSessions(
  ctx: SeedContext,
  organization: OrganizationSeed,
  exams: readonly Exam[],
): ExamSession[] {
  const demoStudent = organization.users.find((user) => user.email === 'student@adaptif.dev');
  if (!demoStudent) return [];

  const nowMs = Date.parse(ctx.date(0));
  const activeExam = exams.find(
    (exam) =>
      examRuntimeStatus(exam, nowMs) === 'scheduled' &&
      exam.cohortIds.some((id) => demoStudent.cohortIds.includes(id)),
  );
  if (!activeExam) return [];

  const startedAt = ctx.date(0, 8, 40);
  const serverNow = ctx.date(0, 9, 0);
  const expiresAt = ctx.minutesFrom(startedAt, activeExam.durationMinutes);

  return [
    {
      id: ctx.id('ses'),
      token: 'demo-session-token',
      examId: activeExam.id,
      studentId: demoStudent.id,
      state: 'IN_PROGRESS',
      startedAt,
      expiresAt,
      serverNow,
      remainingMs: Math.max(0, Date.parse(expiresAt) - Date.parse(serverNow)),
      connection: 'online',
      lastHeartbeatAt: serverNow,
      flaggedQuestionIds: [],
      visitedQuestionIds: activeExam.questions.slice(0, 2).map((ref) => ref.questionId),
      currentQuestionIndex: 0,
      submittedAt: null,
      terminationReason: null,
      createdAt: startedAt,
      updatedAt: serverNow,
      version: 1,
    },
  ];
}

/* ── Ustalık ─────────────────────────────────────────────────────────────── */

function buildMastery(
  ctx: SeedContext,
  organization: OrganizationSeed,
  courses: readonly Course[],
  outcomes: readonly LearningOutcome[],
  questions: readonly Question[],
  attempts: readonly Attempt[],
): MasteryScore[] {
  const scores: MasteryScore[] = [];
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const nowMs = Date.parse(ctx.date(0));

  // Öğrenci + kazanım kırılımında cevap sinyallerini topla.
  const signals = new Map<string, AnswerSignal[]>();

  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;

      for (const outcomeId of question.outcomeIds) {
        const key = `${attempt.studentId}|${outcomeId}`;
        const list = signals.get(key) ?? [];
        list.push({
          difficulty: question.difficulty,
          correct: answer.awardedPoints >= answer.maxPoints,
          creditRatio: answer.maxPoints > 0 ? answer.awardedPoints / answer.maxPoints : 0,
          answeredAt: attempt.submittedAt,
        });
        signals.set(key, list);
      }
    }
  }

  const courseById = new Map(courses.map((course) => [course.id, course]));

  for (const [key, answers] of signals) {
    const [studentId, outcomeId] = key.split('|');
    const outcome = outcomeById.get(outcomeId ?? '');
    if (!studentId || !outcome || !courseById.has(outcome.courseId)) continue;

    const result = calculateMastery(answers, nowMs, ctx.rng.int(1, 3));

    scores.push({
      id: ctx.id('mst'),
      studentId,
      outcomeId: outcome.id,
      outcomeCode: outcome.code,
      outcomeTitle: outcome.title,
      courseId: outcome.courseId,
      score: result.score,
      band: result.band,
      confidence: result.confidence,
      inputs: result.inputs,
      trend: ctx.rng.int(-12, 15),
      calculatedAt: ctx.date(0, 6),
    });
  }

  void organization;
  return scores;
}

/* ── Madde analizi ───────────────────────────────────────────────────────── */

function buildItemAnalyses(
  ctx: SeedContext,
  questions: readonly Question[],
  attempts: readonly Attempt[],
  outcomes: readonly LearningOutcome[],
): ItemAnalysis[] {
  const analyses: ItemAnalysis[] = [];
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));

  // Denemeleri puana göre sırala; üst/alt %27 dilimleri ayırt ediciliği verir.
  const ranked = [...attempts].sort((a, b) => b.scorePercent - a.scorePercent);
  const groupSize = Math.max(1, Math.round(ranked.length * 0.27));
  const upper = new Set(ranked.slice(0, groupSize).map((attempt) => attempt.id));
  const lower = new Set(ranked.slice(-groupSize).map((attempt) => attempt.id));

  // Soru → cevaplar dizini: her soru için tüm denemeleri taramak O(n²) olurdu.
  const responsesByQuestion = new Map<string, { attempt: Attempt; answer: AttemptAnswer }[]>();
  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const list = responsesByQuestion.get(answer.questionId) ?? [];
      list.push({ attempt, answer });
      responsesByQuestion.set(answer.questionId, list);
    }
  }

  for (const question of questions) {
    const related = responsesByQuestion.get(question.id) ?? [];
    if (related.length < MIN_ITEM_SAMPLE) continue;

    const correctCount = related.filter(
      (item) => item.answer.awardedPoints >= item.answer.maxPoints,
    ).length;
    const difficultyIndex = round2(correctCount / related.length);

    const upperResponses = related.filter((item) => upper.has(item.attempt.id));
    const lowerResponses = related.filter((item) => lower.has(item.attempt.id));
    const upperTotal = upperResponses.length || 1;
    const lowerTotal = lowerResponses.length || 1;
    const upperCorrect = upperResponses.filter(
      (item) => item.answer.awardedPoints >= item.answer.maxPoints,
    ).length;
    const lowerCorrect = lowerResponses.filter(
      (item) => item.answer.awardedPoints >= item.answer.maxPoints,
    ).length;
    const discrimination = round2(upperCorrect / upperTotal - lowerCorrect / lowerTotal);

    const distractors = question.options.map((option) => {
      const selected = related.filter(
        (item) =>
          item.answer.value.kind === 'choice' && item.answer.value.optionIds.includes(option.id),
      );
      const upperSelected = selected.filter((item) => upper.has(item.attempt.id)).length;
      const lowerSelected = selected.filter((item) => lower.has(item.attempt.id)).length;

      return {
        optionId: option.id,
        optionText: option.text,
        correct: option.correct,
        selectedCount: selected.length,
        selectedPercent: round2((selected.length / related.length) * 100),
        upperGroupPercent: round2((upperSelected / upperTotal) * 100),
        lowerGroupPercent: round2((lowerSelected / lowerTotal) * 100),
      };
    });

    const outcome = outcomeById.get(question.outcomeIds[0] ?? '');

    analyses.push({
      id: ctx.id('ita'),
      questionId: question.id,
      questionCode: question.code,
      questionStem: question.stem,
      questionType: question.type,
      courseId: question.courseId,
      outcomeId: outcome?.id ?? '',
      outcomeCode: outcome?.code ?? '',
      declaredDifficulty: question.difficulty,
      sampleSize: related.length,
      difficultyIndex,
      discrimination,
      averageTimeSeconds: Math.round(
        related.reduce((sum, item) => sum + item.answer.timeSpentSeconds, 0) / related.length,
      ),
      distractors,
      flags: flagItem(difficultyIndex, discrimination, distractors),
      calculatedAt: ctx.date(0, 5),
    });
  }

  return analyses;
}

/** BR-19: eşik dışındaki maddeler inceleme bayrağı alır. */
function flagItem(
  difficultyIndex: number,
  discrimination: number,
  distractors: readonly { correct: boolean; selectedPercent: number }[],
): ItemFlag[] {
  const flags: ItemFlag[] = [];
  if (difficultyIndex > 0.9) flags.push('too_easy');
  if (difficultyIndex < 0.2) flags.push('too_hard');
  if (discrimination < 0.2) flags.push('low_discrimination');
  if (distractors.some((item) => !item.correct && item.selectedPercent < 5)) {
    flags.push('weak_distractor');
  }
  return flags;
}

/* ── Denetim kayıtları ───────────────────────────────────────────────────── */

function buildAuditEvents(
  ctx: SeedContext,
  users: readonly MockUser[],
  courses: readonly Course[],
  exams: readonly Exam[],
  attempts: readonly Attempt[],
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const userById = new Map(users.map((user) => [user.id, user]));

  for (const course of courses.filter((item) => item.publishedAt)) {
    const actor = userById.get(course.instructorId);
    events.push({
      id: ctx.id('aud'),
      action: 'course.published',
      actorId: course.instructorId,
      actorName: actor?.fullName ?? 'Bilinmiyor',
      actorRole: 'INSTRUCTOR',
      targetType: 'Course',
      targetId: course.id,
      targetLabel: `${course.code} · ${course.name}`,
      reason: null,
      changes: [{ field: 'state', label: 'Durum', oldValue: 'REVIEW', newValue: 'PUBLISHED' }],
      correlationId: null,
      createdAt: course.publishedAt!,
    });
  }

  for (const exam of exams.filter((item) => item.publishedAt)) {
    const actor = userById.get(exam.createdBy);
    events.push({
      id: ctx.id('aud'),
      action: 'exam.published',
      actorId: exam.createdBy,
      actorName: actor?.fullName ?? 'Bilinmiyor',
      actorRole: 'INSTRUCTOR',
      targetType: 'Exam',
      targetId: exam.id,
      targetLabel: exam.title,
      reason: null,
      changes: [
        { field: 'state', label: 'Durum', oldValue: 'İncelemede', newValue: 'Yayında' },
        {
          field: 'questionCount',
          label: 'Soru sayısı',
          oldValue: '0',
          newValue: String(exam.questions.length),
        },
      ],
      correlationId: null,
      createdAt: exam.publishedAt!,
    });
  }

  // Puan geçersiz kılma örnekleri — gerekçe alanı dolu olmalıdır (BR-12).
  const releasedAttempts = attempts.filter((item) => item.state === 'RELEASED');
  for (const attempt of ctx.rng.sample(releasedAttempts, Math.min(40, releasedAttempts.length))) {
    const course = courses.find((item) => item.id === attempt.courseId);
    const actorId = course?.instructorId ?? users[1]!.id;
    const previous = round1(Math.max(0, attempt.totalScore - ctx.rng.int(1, 5)));

    events.push({
      id: ctx.id('aud'),
      action: 'attempt.score.overridden',
      actorId,
      actorName: userById.get(actorId)?.fullName ?? 'Bilinmiyor',
      actorRole: 'INSTRUCTOR',
      targetType: 'Attempt',
      targetId: attempt.id,
      targetLabel: `${attempt.studentName} · ${attempt.examTitle}`,
      reason: ctx.rng.pick([
        'Öğrenci itirazı incelendi, çözüm adımı kısmen doğru bulundu.',
        'Rubrik kriteri yeniden değerlendirildi.',
        'Soru metnindeki belirsizlik nedeniyle telafi puanı verildi.',
      ]),
      changes: [
        {
          field: 'totalScore',
          label: 'Toplam puan',
          oldValue: String(previous),
          newValue: String(attempt.totalScore),
        },
      ],
      correlationId: null,
      createdAt: attempt.releasedAt ?? attempt.submittedAt,
    });
  }

  // Değerlendirme ve oturum sonlandırma kayıtları.
  const gradedAttempts = attempts.filter((item) => item.gradedAt !== null);
  for (const attempt of ctx.rng.sample(gradedAttempts, Math.min(60, gradedAttempts.length))) {
    const course = courses.find((item) => item.id === attempt.courseId);
    const actorId = course?.instructorId ?? users[1]!.id;

    events.push({
      id: ctx.id('aud'),
      action: 'attempt.graded',
      actorId,
      actorName: userById.get(actorId)?.fullName ?? 'Bilinmiyor',
      actorRole: 'INSTRUCTOR',
      targetType: 'Attempt',
      targetId: attempt.id,
      targetLabel: `${attempt.studentName} · ${attempt.examTitle}`,
      reason: null,
      changes: [
        {
          field: 'totalScore',
          label: 'Toplam puan',
          oldValue: null,
          newValue: String(attempt.totalScore),
        },
      ],
      correlationId: null,
      createdAt: attempt.gradedAt!,
    });
  }

  return events.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
