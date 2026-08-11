import {
  Attempt,
  AttemptAnswer,
  AttemptDetail,
  GRADING_LIMITS,
  GradeAttemptRequest,
  GradingQueueItem,
  RegradeRequest,
  ResolveConflictRequest,
  ScoreChange,
} from '../../../../../features/adaptive-learning/models/attempt.model';
import { emptyIntegrity } from '../../../../../features/adaptive-learning/models/exam-session.model';
import {
  computeTotals,
  nextAttemptState,
  validateGrading,
} from '../../../../../features/adaptive-learning/domain/grading.rules';
import { evaluateRubric, normalizeScores } from '../../../../../features/adaptive-learning/domain/rubric.calculator';
import { filterValues } from '../../db/query-engine';
import { assertWithinScope, isWithinScope, requirePermission } from '../../mock-auth';
import { businessRule, conflict, notFound } from '../../mock-errors';
import { MockCaller, MockContext, MockHandler, created, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';
import {
  CONFLICT_PREFIX,
  REGRADE_PREFIX,
  buildAnswerViews,
  conflictsOf,
  manualAnswers,
  regradesOf,
  sessionOf,
} from './grading-context';

/**
 * Değerlendirme uç noktaları.
 *
 * Puan hesaplaması İSTEMCİDEN ALINMAZ: rubrik puanı seçilen seviyelerden,
 * deneme toplamı da cevapların toplamından yeniden hesaplanır (BR-13).
 * Her puan değişikliği gerekçesiyle birlikte `scoreHistory`'ye ve denetim
 * kaydına yazılır (BR-12, BR-18).
 */
export const GRADING_HANDLERS: readonly MockHandler[] = [
  {
    /** Değerlendirme kuyruğu — elle puanlama bekleyen denemeler. */
    method: 'GET',
    path: '/api/grading/queue',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:grade');

      const items: GradingQueueItem[] = context.db
        .collection('attempts')
        .filter((attempt) =>
          isWithinScope(caller, {
            ownerId: attempt.studentId,
            courseId: attempt.courseId,
            cohortId: attempt.cohortId,
          }),
        )
        .map((attempt) => toQueueItem(context, attempt))
        // Kuyruk yalnızca İŞ BEKLEYEN denemeleri gösterir; tamamlananlar
        // deneme listesinden izlenir.
        .filter(
          (item) =>
            item.pendingManualCount > 0 || item.conflictCount > 0 || item.openRegradeCount > 0,
        )
        .sort((a, b) => b.waitingHours - a.waitingHours);

      return ok(paginate(items, context));
    },
  },

  {
    /**
     * Çakışma listesi — hakemlik bekleyen denemeler.
     *
     * Değerlendirme kuyruğundan AYRI bir uçtur ve `attempt:override` ister,
     * `attempt:grade` DEĞİL. Çakışmayı çözmek puanlamak değildir: iki
     * değerlendirici anlaşamadığında karar veren kişi (Program Yöneticisi)
     * öğrencilerin açık uçlu cevaplarını baştan puanlamaz, yalnızca hakemlik
     * yapar. Bu yüzden puanlama kuyruğunu hiç görmez.
     */
    method: 'GET',
    path: '/api/grading/conflicts',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:override');

      const items: GradingQueueItem[] = context.db
        .collection('attempts')
        .filter((attempt) =>
          isWithinScope(caller, {
            ownerId: attempt.studentId,
            courseId: attempt.courseId,
            cohortId: attempt.cohortId,
          }),
        )
        .map((attempt) => toQueueItem(context, attempt))
        // Yalnızca ÇÖZÜLMEMİŞ çakışması olanlar; puanlama bekleyenler burada değil.
        .filter((item) => item.conflictCount > 0);
      /*
       * Sıralama `paginate` içinde yapılır (istemcinin seçtiği sütuna göre).
       * Varsayılan sütun `state`: karar verilebilenler önce, sonra en uzun
       * bekleyen — bkz. `compare()`.
       */

      return ok(paginate(items, context));
    },
  },

  {
    /** Deneme detayı: cevaplar, rubrikler, çakışmalar, çizelge, bütünlük. */
    method: 'GET',
    path: '/api/attempts/:id/detail',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:read');
      const attempt = findAttempt(context);

      assertWithinScope(caller, {
        ownerId: attempt.studentId,
        courseId: attempt.courseId,
        cohortId: attempt.cohortId,
      });

      const student = context.db.collection('users').findById(attempt.studentId);
      const cohort = context.db.collection('cohorts').findById(attempt.cohortId);
      const course = context.db.collection('courses').findById(attempt.courseId);
      const session = sessionOf(context.db, attempt);

      const answers = buildAnswerViews(context.db, attempt);
      const rubricIds = new Set(
        answers.map((answer) => answer.rubricId).filter((id): id is string => id !== null),
      );

      const detail: AttemptDetail = {
        attempt,
        studentEmail: student?.email ?? '',
        cohortName: cohort?.name ?? '',
        courseCode: course?.code ?? '',
        courseName: course?.name ?? '',
        answers,
        rubrics: context.db.collection('rubrics').filter((rubric) => rubricIds.has(rubric.id)),
        timeline: session?.timeline ?? [],
        integrity: session?.integrity ?? emptyIntegrity(),
        conflicts: conflictsOf(context.db, attempt),
        regrades: regradesOf(attempt),
        pendingManualCount: pendingCount(context, attempt),
        isGradable: attempt.state !== 'RELEASED',
      };

      return ok(detail);
    },
  },

  {
    /**
     * Puanlama.
     *
     * Tek tek soru yerine TÜM cevaplar birlikte gönderilir: değerlendirici
     * ekranda birden çok soruyu puanlayıp bir kez kaydeder ve toplam tek
     * seferde tutarlı hâle gelir.
     */
    method: 'PUT',
    path: '/api/attempts/:id/grade',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:grade');
      const attempt = findAttempt(context);

      assertWithinScope(caller, {
        ownerId: attempt.studentId,
        courseId: attempt.courseId,
        cohortId: attempt.cohortId,
      });

      const request = context.body as GradeAttemptRequest;

      if (request.expectedVersion !== attempt.version) {
        throw conflict('Bu deneme başka bir değerlendirici tarafından güncellendi.', {
          expectedVersion: request.expectedVersion,
          actualVersion: attempt.version,
        });
      }

      const { answers, changes } = applyGrades(context, caller, attempt, request);

      return ok(persist(context, caller, attempt, answers, changes, 'attempt.graded'));
    },
  },

  {
    /**
     * İtiraz üzerine yeniden değerlendirme.
     *
     * Sıradan bir düzeltmeden ayrı tutulur: gerekçe `İTİRAZ:` önekiyle yazılır ve
     * deneme `UNDER_REVIEW` durumuna geçer. Böylece sonucu açıklanmış bir deneme
     * de yeniden ele alınabilir.
     */
    method: 'POST',
    path: '/api/attempts/:id/regrade',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:grade');
      const attempt = findAttempt(context);
      const request = context.body as RegradeRequest;

      const reason = (request.reason ?? '').trim();
      if (reason.length < 10) {
        throw businessRule('İtiraz gerekçesi en az 10 karakter olmalıdır.');
      }
      if (reason.length > GRADING_LIMITS.regradeReason.max) {
        throw businessRule(
          `İtiraz gerekçesi en fazla ${GRADING_LIMITS.regradeReason.max} karakter olabilir.`,
        );
      }

      const answer = request.questionId
        ? attempt.answers.find((item) => item.questionId === request.questionId)
        : undefined;

      if (request.questionId && !answer) throw notFound('Cevap');

      const previous = answer ? answer.awardedPoints : attempt.totalScore;
      const nowIso = new Date(context.now).toISOString();

      let answers = attempt.answers;
      const changes: ScoreChange[] = [];

      // Yeni puan verildiyse uygulanır; verilmediyse yalnızca inceleme açılır.
      if (answer && request.newScore !== null) {
        if (request.newScore < 0 || request.newScore > answer.maxPoints) {
          throw businessRule(`Puan 0 ile ${answer.maxPoints} arasında olmalıdır.`);
        }

        answers = attempt.answers.map((item) =>
          item.questionId === answer.questionId
            ? { ...item, awardedPoints: request.newScore!, gradedBy: caller.userId }
            : item,
        );

        changes.push(
          scoreChange(context, caller, {
            questionId: answer.questionId,
            previousScore: previous,
            newScore: request.newScore,
            reason: `${REGRADE_PREFIX} ${reason}`,
          }),
        );
      } else {
        changes.push(
          scoreChange(context, caller, {
            questionId: request.questionId,
            previousScore: previous,
            newScore: previous,
            reason: `${REGRADE_PREFIX} ${reason}`,
          }),
        );
      }

      const exam = context.db.collection('exams').findById(attempt.examId);
      const totals = computeTotals(answers, exam?.rules.passingScore ?? 0);

      const updated = context.db.collection('attempts').update(attempt.id, {
        answers,
        ...totals,
        state: 'UNDER_REVIEW',
        scoreHistory: [...attempt.scoreHistory, ...changes],
        gradedAt: nowIso,
        updatedAt: nowIso,
        version: attempt.version + 1,
      })!;

      writeAudit(context, caller, 'attempt.score.overridden', attemptTarget(updated), reason);
      return created(updated);
    },
  },

  {
    /**
     * Çakışma çözümü.
     *
     * İki uzman farklı puan verdiğinde nihai kararı yetkili bir kullanıcı verir.
     * Karar da bir puan değişikliğidir; `ÇAKIŞMA:` önekiyle geçmişe yazılır.
     */
    method: 'POST',
    path: '/api/attempts/:id/resolve-conflict',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:override');
      const attempt = findAttempt(context);
      const request = context.body as ResolveConflictRequest;

      const answer = attempt.answers.find((item) => item.questionId === request.questionId);
      if (!answer) throw notFound('Cevap');

      const reason = (request.reason ?? '').trim();
      if (reason.length < 10) {
        throw businessRule('Karar gerekçesi en az 10 karakter olmalıdır.');
      }
      if (request.points < 0 || request.points > answer.maxPoints) {
        throw businessRule(`Puan 0 ile ${answer.maxPoints} arasında olmalıdır.`);
      }

      const answers = attempt.answers.map((item) =>
        item.questionId === answer.questionId
          ? { ...item, awardedPoints: request.points, gradedBy: caller.userId }
          : item,
      );

      const changes = [
        scoreChange(context, caller, {
          questionId: answer.questionId,
          previousScore: answer.awardedPoints,
          newScore: request.points,
          reason: `${CONFLICT_PREFIX} ${reason}`,
        }),
      ];

      return ok(persist(context, caller, attempt, answers, changes, 'attempt.graded'));
    },
  },

  {
    /** Sonucu öğrenciye açar — puanın görünür olması AYRI bir karardır (BR-49). */
    method: 'POST',
    path: '/api/attempts/:id/release',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:grade');
      const attempt = findAttempt(context);

      if (attempt.state !== 'GRADED') {
        throw businessRule('Yalnızca değerlendirmesi tamamlanmış denemenin sonucu açıklanabilir.');
      }
      if (pendingCount(context, attempt) > 0) {
        throw businessRule('Elle puanlanmayı bekleyen cevaplar var; sonuç açıklanamaz.');
      }

      /*
       * Çözülmemiş çakışma varken sonuç AÇIKLANAMAZ.
       *
       * Aksi hâlde öğrenciye, iki değerlendiricinin üzerinde anlaşamadığı bir
       * puan bildirilmiş olur; üstelik açıklandıktan sonra deneme kilitlenir
       * (`isGradable = state !== 'RELEASED'`) ve hakem artık düzeltemez —
       * yani hata kalıcılaşır. Bekleyen manuel cevap kontrolüyle aynı gerekçe.
       */
      const openConflicts = conflictsOf(context.db, attempt).filter(
        (item) => item.resolvedPoints === null,
      ).length;

      if (openConflicts > 0) {
        throw businessRule(
          `Değerlendiriciler arasında karara bağlanmamış ${openConflicts} soru var; sonuç açıklanamaz. Önce çakışmalar sonuçlandırılmalıdır.`,
          { openConflicts },
        );
      }

      const nowIso = new Date(context.now).toISOString();
      const updated = context.db.collection('attempts').update(attempt.id, {
        state: 'RELEASED',
        releasedAt: nowIso,
        updatedAt: nowIso,
        version: attempt.version + 1,
      })!;

      writeAudit(context, caller, 'attempt.released', attemptTarget(updated), 'Sonuç öğrenciye açıldı');
      return ok(updated);
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function findAttempt(context: MockContext): Attempt {
  const attempt = context.db.collection('attempts').findById(context.params['id'] ?? '');
  if (!attempt) throw notFound('Deneme');
  return attempt;
}

function pendingCount(context: MockContext, attempt: Attempt): number {
  return manualAnswers(context.db, attempt.answers).filter((answer) => answer.gradedBy === null)
    .length;
}

/**
 * Puan girdilerini uygular.
 *
 * Rubrikli cevaplarda puan İSTEMCİDEN alınmaz: seçilen seviyelerden yeniden
 * hesaplanır (BR-13). Böylece "kriterler 12 diyor ama puan 18 yazılmış" durumu
 * oluşamaz.
 */
function applyGrades(
  context: MockContext,
  caller: MockCaller,
  attempt: Attempt,
  request: GradeAttemptRequest,
): { answers: AttemptAnswer[]; changes: ScoreChange[] } {
  const questions = context.db.collection('questions');
  const rubrics = context.db.collection('rubrics');
  const inputByQuestion = new Map(request.answers.map((input) => [input.questionId, input]));

  const validationInputs = request.answers.map((input) => {
    const existing = attempt.answers.find((answer) => answer.questionId === input.questionId);
    return {
      questionId: input.questionId,
      awardedPoints: input.awardedPoints,
      feedback: input.feedback,
      maxPoints: existing?.maxPoints ?? 0,
      previousPoints: existing?.awardedPoints ?? 0,
      // Otomatik puanlanmış ya da bir uzman tarafından puanlanmışsa "önceden puanlı".
      previouslyGraded: (existing?.autoGraded ?? false) || existing?.gradedBy !== null,
    };
  });

  const issues = validateGrading(validationInputs, request.reason ?? '', attempt.state);
  if (issues.length > 0) {
    throw businessRule(issues[0].message, { issues });
  }

  const changes: ScoreChange[] = [];

  const answers = attempt.answers.map((answer) => {
    const input = inputByQuestion.get(answer.questionId);
    if (!input) return answer;

    const question = questions.findById(answer.questionId);
    const rubric = question?.rubricId ? rubrics.findById(question.rubricId) : undefined;

    const rubricScores = rubric ? normalizeScores(rubric, input.rubricScores) : [];
    const points = rubric
      ? evaluateRubric(rubric, rubricScores, answer.maxPoints).scaledPoints
      : input.awardedPoints;

    if (points !== answer.awardedPoints) {
      changes.push(
        scoreChange(context, caller, {
          questionId: answer.questionId,
          previousScore: answer.awardedPoints,
          newScore: points,
          reason: request.reason ?? 'İlk değerlendirme',
        }),
      );
    }

    return {
      ...answer,
      awardedPoints: points,
      feedback: input.feedback,
      rubricScores,
      gradedBy: caller.userId,
      autoGraded: false,
    };
  });

  return { answers, changes };
}

function persist(
  context: MockContext,
  caller: MockCaller,
  attempt: Attempt,
  answers: readonly AttemptAnswer[],
  changes: readonly ScoreChange[],
  action: 'attempt.graded',
): Attempt {
  const exam = context.db.collection('exams').findById(attempt.examId);
  const totals = computeTotals(answers, exam?.rules.passingScore ?? 0);
  const nowIso = new Date(context.now).toISOString();

  const updated = context.db.collection('attempts').update(attempt.id, {
    answers: [...answers],
    ...totals,
    state: nextAttemptState(answers, attempt.state),
    scoreHistory: [...attempt.scoreHistory, ...changes],
    gradedAt: nowIso,
    updatedAt: nowIso,
    version: attempt.version + 1,
  })!;

  if (changes.length > 0) {
    writeAudit(context, caller, action, attemptTarget(updated), changes[changes.length - 1].reason);
  }

  return updated;
}

function scoreChange(
  context: MockContext,
  caller: MockCaller,
  input: {
    questionId: string | null;
    previousScore: number;
    newScore: number;
    reason: string;
  },
): ScoreChange {
  const user = context.db.collection('users').findById(caller.userId);

  return {
    id: `chg_${context.now.toString(36)}_${input.questionId ?? 'all'}`,
    questionId: input.questionId,
    previousScore: input.previousScore,
    newScore: input.newScore,
    reason: input.reason,
    changedBy: caller.userId,
    changedByName: user?.fullName ?? '',
    changedAt: new Date(context.now).toISOString(),
  };
}

function toQueueItem(context: MockContext, attempt: Attempt): GradingQueueItem {
  const course = context.db.collection('courses').findById(attempt.courseId);
  const cohort = context.db.collection('cohorts').findById(attempt.cohortId);

  return {
    id: attempt.id,
    examTitle: attempt.examTitle,
    courseCode: course?.code ?? '',
    studentName: attempt.studentName,
    cohortName: cohort?.name ?? '',
    submittedAt: attempt.submittedAt,
    state: attempt.state,
    pendingManualCount: pendingCount(context, attempt),
    conflictCount: conflictsOf(context.db, attempt).filter(
      (item) => item.resolvedPoints === null,
    ).length,
    openRegradeCount: attempt.state === 'UNDER_REVIEW' ? 1 : 0,
    totalScore: attempt.totalScore,
    maxScore: attempt.maxScore,
    waitingHours: Math.max(
      0,
      Math.round((context.now - Date.parse(attempt.submittedAt)) / 3_600_000),
    ),
  };
}

/**
 * Kuyruk türetilmiş satırlardan oluştuğu için `QueryEngine` kullanılamaz;
 * arama, filtre, sıralama ve sayfalama burada bellek içinde uygulanır.
 */
function paginate(items: readonly GradingQueueItem[], context: MockContext) {
  const { search, filters, sort, page, size } = context.page;

  let rows = [...items];

  if (search) {
    const needle = search.toLocaleLowerCase('tr-TR');
    rows = rows.filter((item) =>
      [item.studentName, item.examTitle, item.courseCode]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(needle),
    );
  }

  const courseId = filters['courseCode'];
  if (typeof courseId === 'string' && courseId) {
    rows = rows.filter((item) => item.courseCode === courseId);
  }

  const states = filterValues(filters['state']);
  if (states.length > 0) {
    rows = rows.filter((item) => states.includes(item.state));
  }

  const field = sort?.field ?? 'waitingHours';
  const direction = sort?.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => compare(a, b, field) * direction);

  const start = (page - 1) * size;

  return {
    items: rows.slice(start, start + size),
    total: rows.length,
    page,
    size,
  };
}

function compare(a: GradingQueueItem, b: GradingQueueItem, field: string): number {
  switch (field) {
    case 'studentName':
      return a.studentName.localeCompare(b.studentName, 'tr-TR');
    case 'examTitle':
      return a.examTitle.localeCompare(b.examTitle, 'tr-TR');
    case 'submittedAt':
      return a.submittedAt.localeCompare(b.submittedAt);
    case 'pendingManualCount':
      return a.pendingManualCount - b.pendingManualCount;
    /*
     * Durum sıralaması "işlem yapılabilirlik" sıralamasıdır, alfabetik değil:
     * sonucu açıklanmış deneme kilitlidir ve hakem onu düzeltemez. Eşitlikte
     * en uzun bekleyen öne alınır. Çakışma listesinin varsayılan sıralaması.
     */
    case 'state': {
      const rank = (item: GradingQueueItem) => (item.state === 'RELEASED' ? 0 : 1);
      const byRank = rank(a) - rank(b);
      return byRank !== 0 ? byRank : a.waitingHours - b.waitingHours;
    }
    default:
      return a.waitingHours - b.waitingHours;
  }
}

/** Denetim kaydında denemenin nasıl görüneceği. */
function attemptTarget(attempt: Attempt) {
  return {
    type: 'Attempt',
    id: attempt.id,
    label: `${attempt.studentName} · ${attempt.examTitle}`,
  };
}
