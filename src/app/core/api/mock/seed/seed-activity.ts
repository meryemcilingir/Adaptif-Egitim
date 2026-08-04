import { AuditEvent } from '../../../observability/audit.model';
import {
  Attempt,
  AttemptAnswer,
  ScoreChange,
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
  SessionTimelineEvent,
  TimelineKind,
  isAnswered,
} from '../../../../features/adaptive-learning/models/exam-session.model';
import {
  AnswerSignal,
  calculateMastery,
} from '../../../../features/adaptive-learning/domain/mastery.calculator';
import { MockUser } from '../db/db-schema';
import { OrganizationSeed } from './seed-organization';
import { examRuntimeStatus } from '../../../../features/adaptive-learning/domain/exam-runtime';
import { SeedContext } from './seed-context';

/** Tohum denetim kayıtları tek bir örnek adresten görünür; veri deterministik kalır. */
const SEED_IP = '10.0.0.1';

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
  const sessions = buildSessions(ctx, organization, exams, attempts);
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

  /* Çakışma senaryosunda ikinci puanı veren ölçme uzmanı. */
  const secondGrader =
    organization.users.find((user) => user.primaryRole === 'ASSESSMENT_SPECIALIST') ?? null;

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
            secondGrader,
            instructorName: userById.get(course.instructorId)?.fullName ?? 'Eğitmen',
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
              secondGrader,
              instructorName: userById.get(course.instructorId)?.fullName ?? 'Eğitmen',
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
  /** İkinci değerlendirici — çakışma senaryosu bunun puanıyla oluşur. */
  readonly secondGrader: MockUser | null;
  readonly instructorName: string;
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

  /*
   * Puan geçmişi.
   *
   * Değerlendirilmiş denemelerin küçük bir bölümünde ikinci bir uzman farklı
   * puan verir (çakışma) ya da öğrenci itirazı sonucu puan düzeltilir. Bu
   * kayıtlar `scoreHistory` üzerinden türetilir; ayrı koleksiyon tutulmaz.
   */
  const gradedManual = effectiveAnswers.find(
    (answer) => !answer.autoGraded && answer.gradedBy !== null,
  );

  const scoreHistory: ScoreChange[] =
    state === 'PENDING_MANUAL' || !gradedManual
      ? []
      : buildScoreHistory(ctx, {
          answer: gradedManual,
          submittedAt: ctx.minutesFrom(exam.opensAt, 60),
          instructorId: course.instructorId,
          instructorName: input.instructorName,
          secondGrader: input.secondGrader,
        });

  const finalAnswers = applyScoreHistory(effectiveAnswers, scoreHistory);

  const totalScore = round1(
    finalAnswers.reduce((sum, answer) => sum + answer.awardedPoints, 0),
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
    answers: finalAnswers,
    totalScore,
    maxScore: exam.totalPoints,
    scorePercent: exam.totalPoints > 0 ? Math.round((totalScore / exam.totalPoints) * 100) : 0,
    passed: totalScore >= exam.rules.passingScore,
    startedAt,
    submittedAt,
    gradedAt: state === 'PENDING_MANUAL' ? null : ctx.minutesFrom(submittedAt, 2880),
    releasedAt: state === 'RELEASED' ? ctx.minutesFrom(submittedAt, 4320) : null,
    durationSeconds: finalAnswers.reduce((sum, answer) => sum + answer.timeSpentSeconds, 0),
    scoreHistory,
    createdAt: submittedAt,
    updatedAt: submittedAt,
    version: 1,
  };
}

/* ── Puan geçmişi ────────────────────────────────────────────────────────── */

interface ScoreHistoryInput {
  readonly answer: AttemptAnswer;
  readonly submittedAt: string;
  readonly instructorId: string;
  readonly instructorName: string;
  readonly secondGrader: MockUser | null;
}

/**
 * Bir cevabın puan geçmişini üretir.
 *
 * Üç senaryo vardır ve ağırlıkları gerçekçi tutulur: denemelerin çoğunda tek
 * bir değerlendirme kaydı olur, bir kısmında ikinci uzman farklı puan verir
 * (çakışma), küçük bir kısmında da itiraz sonucu puan düzeltilir.
 */
function buildScoreHistory(ctx: SeedContext, input: ScoreHistoryInput): ScoreChange[] {
  const { answer, submittedAt, instructorId, instructorName, secondGrader } = input;

  const first: ScoreChange = {
    id: ctx.id('chg'),
    questionId: answer.questionId,
    previousScore: 0,
    newScore: answer.awardedPoints,
    reason: 'İlk değerlendirme',
    changedBy: instructorId,
    changedByName: instructorName,
    changedAt: ctx.minutesFrom(submittedAt, 2880),
  };

  const scenario = ctx.rng.weighted<'single' | 'conflict' | 'regrade'>([
    ['single', 70],
    ['conflict', 18],
    ['regrade', 12],
  ]);

  if (scenario === 'single' || answer.maxPoints === 0) return [first];

  if (scenario === 'conflict' && secondGrader) {
    // İkinci uzman belirgin biçimde farklı bir puan verir ki çakışma görünür olsun.
    const delta = Math.max(1, Math.round(answer.maxPoints * 0.25));
    const alternative = clamp(answer.awardedPoints + delta, 0, answer.maxPoints);
    if (alternative === answer.awardedPoints) return [first];

    return [
      first,
      {
        id: ctx.id('chg'),
        questionId: answer.questionId,
        previousScore: answer.awardedPoints,
        newScore: round1(alternative),
        reason: 'İkinci değerlendirme',
        changedBy: secondGrader.id,
        changedByName: secondGrader.fullName,
        changedAt: ctx.minutesFrom(submittedAt, 3200),
      },
    ];
  }

  const corrected = clamp(answer.awardedPoints + 1, 0, answer.maxPoints);
  return [
    first,
    {
      id: ctx.id('chg'),
      questionId: answer.questionId,
      previousScore: answer.awardedPoints,
      newScore: round1(corrected),
      reason: 'İTİRAZ: Çözümün ikinci adımı gözden kaçmış, puan düzeltildi.',
      changedBy: instructorId,
      changedByName: instructorName,
      changedAt: ctx.minutesFrom(submittedAt, 5760),
    },
  ];
}

/** Geçmişteki SON puanı cevaba uygular — nihai puan her zaman son karardır. */
function applyScoreHistory(
  answers: readonly AttemptAnswer[],
  history: readonly ScoreChange[],
): AttemptAnswer[] {
  if (history.length === 0) return [...answers];

  const latestByQuestion = new Map<string, number>();
  for (const change of history) {
    if (change.questionId) latestByQuestion.set(change.questionId, change.newScore);
  }

  return answers.map((answer) => {
    const points = latestByQuestion.get(answer.questionId);
    return points === undefined ? answer : { ...answer, awardedPoints: points };
  });
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
/** Sınav başına kaç deneme için oturum kaydı üretileceği. */
const SESSIONS_PER_EXAM = 3;

/**
 * Tamamlanmış bir denemenin oturum kaydı.
 *
 * Olaylar UYDURULMAZ: cevaplanan soru sayısı, harcanan süre ve teslim anı
 * denemenin kendi verisinden gelir. Yalnızca bu bilgilerden çıkarılabilecek
 * olaylar üretilir; gerçekte olup olmadığı bilinmeyen bağlantı kopması gibi
 * olaylar eklenmez.
 */
function buildCompletedSession(ctx: SeedContext, attempt: Attempt): ExamSession {
  const startedMs = Date.parse(attempt.startedAt);
  const submittedMs = Date.parse(attempt.submittedAt);

  const timeline: SessionTimelineEvent[] = [event(ctx, 'started', startedMs, null, 'Oturum açıldı')];

  // Cevaplar, harcadıkları süre kadar aralıklarla sırayla işlenir.
  let cursorMs = startedMs;
  attempt.answers.forEach((answer, index) => {
    cursorMs = Math.min(submittedMs, cursorMs + answer.timeSpentSeconds * 1000);
    if (!isAnswered(answer.value)) return;

    timeline.push(
      event(ctx, 'answered', cursorMs, answer.questionId, `${index + 1}. soru cevaplandı`),
    );
  });

  timeline.push(
    event(ctx, 'autosave', Math.max(startedMs, submittedMs - 30_000), null, 'Cevaplar kaydedildi'),
    event(ctx, 'submitted', submittedMs, null, 'Sınav teslim edildi'),
  );

  return {
    id: ctx.id('ses'),
    token: attempt.sessionToken,
    examId: attempt.examId,
    studentId: attempt.studentId,
    state: 'SUBMITTED',
    startedAt: attempt.startedAt,
    expiresAt: attempt.submittedAt,
    serverNow: attempt.submittedAt,
    remainingMs: 0,
    connection: 'online',
    lastHeartbeatAt: attempt.submittedAt,
    flaggedQuestionIds: [],
    visitedQuestionIds: attempt.answers.map((answer) => answer.questionId),
    currentQuestionIndex: Math.max(0, attempt.answers.length - 1),
    submittedAt: attempt.submittedAt,
    terminationReason: null,
    autoSubmitted: false,
    timeline,
    integrity: {
      fullscreen: ctx.rng.bool(0.4),
      tabSwitchCount: ctx.rng.int(0, 6),
      warningCount: 0,
      connection: 'online',
      offlineCount: 0,
      lastWarningAt: null,
    },
    createdAt: attempt.startedAt,
    updatedAt: attempt.submittedAt,
    version: 1,
  };
}

function buildSessions(
  ctx: SeedContext,
  organization: OrganizationSeed,
  exams: readonly Exam[],
  attempts: readonly Attempt[],
): ExamSession[] {
  /*
   * Tamamlanmış denemeler için de oturum kaydı üretilir; deneme detayındaki
   * zaman çizelgesi bundan beslenir. HEPSİ için üretilmez: 1000'den fazla
   * oturum × ~8 olay, demoya hiçbir şey katmadan veritabanını şişirirdi.
   * Sınav başına ilk birkaç deneme temsilî olarak yeterlidir.
   */
  const completed: ExamSession[] = [];
  const perExam = new Map<string, number>();

  for (const attempt of attempts) {
    const seen = perExam.get(attempt.examId) ?? 0;
    if (seen >= SESSIONS_PER_EXAM) continue;
    perExam.set(attempt.examId, seen + 1);

    completed.push(buildCompletedSession(ctx, attempt));
  }

  const demoStudent = organization.users.find((user) => user.email === 'student@adaptif.dev');
  if (!demoStudent) return [];

  /*
   * Yarım kalmış TEK bir oturum üretilir; "yeniden bağlan ve kaldığın yerden
   * devam et" akışı demoda görülebilsin diye. Öğrencinin diğer açık sınavları
   * temiz kalır, böylece sıfırdan başlatma akışı da denenebilir.
   */
  const nowMs = Date.now();
  const openExams = exams.filter(
    (exam) =>
      examRuntimeStatus(exam, nowMs) === 'active' &&
      exam.questions.length > 0 &&
      exam.cohortIds.some((id) => demoStudent.cohortIds.includes(id)),
  );

  const target = openExams[0];
  if (!target) return completed;

  // Oturum 12 dakika önce başlamış gibi kurulur: sayaç ilerlemiş ama süre bitmemiş.
  const startedAtMs = nowMs - 12 * 60_000;
  const startedAt = new Date(startedAtMs).toISOString();
  const expiresAt = new Date(
    Math.min(startedAtMs + target.durationMinutes * 60_000, Date.parse(target.closesAt)),
  ).toISOString();
  const serverNow = new Date(nowMs).toISOString();

  const questionIds = target.questions.map((ref) => ref.questionId);
  const visited = questionIds.slice(0, 3);
  const flagged = questionIds.slice(1, 2);

  const timeline: SessionTimelineEvent[] = [
    event(ctx, 'started', startedAtMs, null, 'Oturum açıldı'),
    event(ctx, 'answered', startedAtMs + 95_000, questionIds[0] ?? null, '1. soru cevaplandı'),
    event(ctx, 'autosave', startedAtMs + 100_000, null, '1 cevap kaydedildi'),
    event(ctx, 'flagged', startedAtMs + 220_000, flagged[0] ?? null, '2. soru işaretlendi'),
    event(ctx, 'offline', startedAtMs + 300_000, null, 'Bağlantı kesildi'),
    event(ctx, 'reconnected', startedAtMs + 342_000, null, '42 saniye sonra yeniden bağlanıldı'),
    event(ctx, 'autosave', startedAtMs + 345_000, null, 'Bekleyen 2 cevap senkronlandı'),
  ];

  return [
    ...completed,
    {
      id: ctx.id('ses'),
      token: 'demo-session-token',
      examId: target.id,
      studentId: demoStudent.id,
      state: 'IN_PROGRESS',
      startedAt,
      expiresAt,
      serverNow,
      remainingMs: Math.max(0, Date.parse(expiresAt) - nowMs),
      connection: 'online',
      lastHeartbeatAt: serverNow,
      flaggedQuestionIds: flagged,
      visitedQuestionIds: visited,
      currentQuestionIndex: 2,
      submittedAt: null,
      terminationReason: null,
      autoSubmitted: false,
      timeline,
      integrity: {
        fullscreen: false,
        tabSwitchCount: 2,
        warningCount: 1,
        connection: 'online',
        offlineCount: 1,
        lastWarningAt: new Date(startedAtMs + 300_000).toISOString(),
      },
      createdAt: startedAt,
      updatedAt: serverNow,
      version: 1,
    },
  ];
}

function event(
  ctx: SeedContext,
  kind: TimelineKind,
  atMs: number,
  questionId: string | null,
  detail: string,
): SessionTimelineEvent {
  return { id: ctx.id('evt'), kind, at: new Date(atMs).toISOString(), questionId, detail };
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
      ipAddress: SEED_IP,
      success: true,
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
      ipAddress: SEED_IP,
      success: true,
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
      ipAddress: SEED_IP,
      success: true,
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
      ipAddress: SEED_IP,
      success: true,
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
