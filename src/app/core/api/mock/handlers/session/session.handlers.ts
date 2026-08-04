import {
  Attempt,
  AttemptAnswer,
} from '../../../../../features/adaptive-learning/models/attempt.model';
import {
  AnswerDraft,
  HeartbeatRequest,
  SaveAnswerRequest,
  SessionView,
  SubmitSessionRequest,
  SubmissionReceipt,
  WaitingRoomView,
  emptyIntegrity,
  isAnswered,
} from '../../../../../features/adaptive-learning/models/exam-session.model';
import { Exam } from '../../../../../features/adaptive-learning/models/exam.model';
import { computeTotals, nextAttemptState } from '../../../../../features/adaptive-learning/domain/grading.rules';
import { scoreAnswer } from '../../../../../features/adaptive-learning/domain/scoring';
import {
  acceptsAnswerAt,
  isClosed,
  sessionExpiry,
  waitingPhase,
} from '../../../../../features/adaptive-learning/domain/session.rules';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import { FakeDb } from '../../db/fake-db';
import { requireCaller, requirePermission } from '../../mock-auth';
import { businessRule, conflict, notFound } from '../../mock-errors';
import { MockContext, MockHandler, created, ok } from '../../mock-router';
import {
  appendEvent,
  buildQuestionViews,
  draftsOf,
  lastSavedAt,
  resumableSession,
  timelineEvent,
  usedAttemptCount,
} from './session-context';

/**
 * Sınav oturumu uç noktaları.
 *
 * Zamanla ilgili HER karar burada verilir; istemciden gelen saat bilgisine
 * güvenilmez (BR-07). `serverNow` her yanıtta döner ve istemci sayacını bununla
 * düzeltir.
 *
 * Kural fonksiyonları `domain/session.rules.ts` içindedir ve istemci de aynı
 * fonksiyonları kullanır → ekran ile sunucu farklı karar veremez.
 */
export const SESSION_HANDLERS: readonly MockHandler[] = [
  {
    /** Bekleme odası: sınav başlamadan gösterilen özet ve faz bilgisi. */
    method: 'GET',
    path: '/api/exams/:id/waiting-room',
    handle: (context) => {
      const caller = requirePermission(context, 'exam:read');
      const exam = findExam(context);
      const course = context.db.collection('courses').findById(exam.courseId);

      const used = usedAttemptCount(context.db, exam.id, caller.userId);
      const resumable = resumableSession(context.db, exam.id, caller.userId);
      const phase = waitingPhase(exam, context.now, used, resumable !== null);

      const view: WaitingRoomView = {
        examId: exam.id,
        examTitle: exam.title,
        courseCode: course?.code ?? '',
        courseName: course?.name ?? '',
        durationMinutes: exam.durationMinutes,
        questionCount: exam.questions.length,
        totalPoints: exam.totalPoints,
        opensAt: exam.opensAt,
        closesAt: exam.closesAt,
        serverNow: new Date(context.now).toISOString(),
        phase,
        instructions: exam.instructions,
        rules: examRules(exam),
        maxAttempts: exam.rules.maxAttempts,
        usedAttempts: used,
        resumableToken: resumable?.token ?? null,
      };

      return ok(view);
    },
  },

  {
    /**
     * Oturum başlatır ya da yarım kalanı döndürür.
     *
     * BR-06: aynı sınav için ikinci bir AKTİF oturum açılmaz. İkinci istek hata
     * yerine mevcut oturumu döndürür — öğrenci sekmesini kapatıp geri döndüğünde
     * karşısına hata çıkmamalıdır.
     */
    method: 'POST',
    path: '/api/exams/:id/session',
    handle: (context) => {
      const caller = requirePermission(context, 'exam:read');
      const exam = findExam(context);

      const existing = resumableSession(context.db, exam.id, caller.userId);
      if (existing) return ok(buildSessionView(context.db, existing, exam, context.now));

      const used = usedAttemptCount(context.db, exam.id, caller.userId);
      const phase = waitingPhase(exam, context.now, used, false);

      if (phase === 'too_early') {
        throw businessRule('Sınav henüz başlamadı; başlama saatinden önce giriş yapılamaz.');
      }
      if (phase === 'closed') {
        throw businessRule('Sınav süresi doldu; bu sınava artık giriş yapılamaz.');
      }
      if (phase === 'used') {
        throw conflict('Bu sınav için deneme hakkınız doldu.', {
          maxAttempts: exam.rules.maxAttempts,
        });
      }
      if (exam.questions.length === 0) {
        throw businessRule('Bu sınavda soru yok; oturum başlatılamaz.');
      }

      const startedAt = new Date(context.now).toISOString();
      const expiresAt = new Date(sessionExpiry(exam, context.now)).toISOString();

      const session = context.db.collection('sessions').insert({
        id: `ses_${context.now.toString(36)}`,
        token: `ses-${caller.userId}-${context.now.toString(36)}`,
        examId: exam.id,
        studentId: caller.userId,
        state: 'IN_PROGRESS',
        startedAt,
        expiresAt,
        serverNow: startedAt,
        remainingMs: Math.max(0, sessionExpiry(exam, context.now) - context.now),
        connection: 'online',
        lastHeartbeatAt: startedAt,
        flaggedQuestionIds: [],
        visitedQuestionIds: [],
        currentQuestionIndex: 0,
        submittedAt: null,
        terminationReason: null,
        autoSubmitted: false,
        timeline: [timelineEvent('started', context.now, null, 'Oturum açıldı')],
        integrity: emptyIntegrity(),
        createdAt: startedAt,
        updatedAt: startedAt,
        version: 1,
      });

      return created(buildSessionView(context.db, session, exam, context.now));
    },
  },

  {
    /** Oturumu jetonla okur — yeniden bağlanma bu uçtan beslenir. */
    method: 'GET',
    path: '/api/sessions/:token',
    handle: (context) => {
      const { session, exam } = requireSession(context);
      const expired = autoExpire(context, session.token);

      return ok(buildSessionView(context.db, expired ?? session, exam, context.now));
    },
  },

  {
    /**
     * Cevap kaydı (autosave).
     *
     * İki koruma birlikte çalışır:
     * · BR-08 — süre dolduktan sonra gelen cevap kabul edilmez.
     * · BR-09 — sunucudaki versiyon daha yeniyse cevap SESSİZCE EZİLMEZ; iki
     *   taraf da döndürülür ve kararı kullanıcı verir (iki sekme senaryosu).
     */
    method: 'PUT',
    path: '/api/sessions/:token/answers',
    handle: (context) => {
      const { session, exam } = requireSession(context);
      const request = context.body as SaveAnswerRequest;

      if (isClosed(session.state)) {
        throw businessRule('Oturum kapandı; cevap kaydedilemez.');
      }

      const answeredAtMs = Date.parse(request.answeredAt);
      if (!acceptsAnswerAt(session.state, session.expiresAt, answeredAtMs)) {
        throw businessRule('Süre dolduğu için bu cevap kaydedilemedi.', {
          questionId: request.questionId,
        });
      }

      if (!exam.questions.some((ref) => ref.questionId === request.questionId)) {
        throw notFound('Soru');
      }

      const drafts = context.db.collection('answerDrafts');
      const existing = drafts
        .filter(
          (draft) =>
            draft.sessionToken === session.token && draft.questionId === request.questionId,
        )
        .at(0);

      if (existing && existing.version > request.version) {
        throw conflict('Bu soru başka bir sekmede güncellenmiş.', {
          questionId: request.questionId,
          localVersion: request.version,
          serverVersion: existing.version,
          serverValue: existing.value,
          serverUpdatedAt: existing.updatedAt,
        });
      }

      const savedAt = new Date(context.now).toISOString();
      const saved: AnswerDraft = existing
        ? drafts.update(existing.id, {
            value: request.value,
            version: existing.version + 1,
            syncState: 'SYNCED',
            updatedAt: savedAt,
            savedAt,
          })!
        : drafts.insert({
            id: `dft_${context.now.toString(36)}_${request.questionId}`,
            sessionToken: session.token,
            questionId: request.questionId,
            value: request.value,
            version: 1,
            syncState: 'SYNCED',
            updatedAt: savedAt,
            savedAt,
          });

      const kind = existing ? 'updated' : 'answered';
      const order = exam.questions.findIndex((ref) => ref.questionId === request.questionId) + 1;

      touchSession(context, session.token, (current) => ({
        visitedQuestionIds: unique([...current.visitedQuestionIds, request.questionId]),
        timeline: appendEvent(
          current.timeline,
          timelineEvent(kind, context.now, request.questionId, `${order}. soru`),
        ),
      }));

      return ok(saved);
    },
  },

  {
    /** Soru işaretleme — aynı uç işareti kaldırmak için de kullanılır. */
    method: 'PUT',
    path: '/api/sessions/:token/flag',
    handle: (context) => {
      const { session, exam } = requireSession(context);
      const { questionId, flagged } = context.body as {
        questionId: string;
        flagged: boolean;
      };

      if (isClosed(session.state)) throw businessRule('Oturum kapandı.');

      const order = exam.questions.findIndex((ref) => ref.questionId === questionId) + 1;
      if (order === 0) throw notFound('Soru');

      const updated = touchSession(context, session.token, (current) => ({
        flaggedQuestionIds: flagged
          ? unique([...current.flaggedQuestionIds, questionId])
          : current.flaggedQuestionIds.filter((id) => id !== questionId),
        timeline: appendEvent(
          current.timeline,
          timelineEvent(
            flagged ? 'flagged' : 'unflagged',
            context.now,
            questionId,
            `${order}. soru`,
          ),
        ),
      }));

      return ok(buildSessionView(context.db, updated, exam, context.now));
    },
  },

  {
    /**
     * Kalp atışı: bağlantı durumu ve bütünlük sayaçları.
     *
     * Bağlantı durumu DEĞİŞTİĞİNDE zaman çizelgesine kayıt düşülür; her atışta
     * kayıt düşmek çizelgeyi anlamsız biçimde şişirirdi.
     */
    method: 'POST',
    path: '/api/sessions/:token/heartbeat',
    handle: (context) => {
      const { session, exam } = requireSession(context);
      const request = context.body as HeartbeatRequest;

      const expired = autoExpire(context, session.token);
      if (expired) return ok(buildSessionView(context.db, expired, exam, context.now));

      const wasOffline = session.connection === 'offline';
      const isOffline = request.connection === 'offline';
      const changed = session.connection !== request.connection;

      const updated = touchSession(context, session.token, (current) => ({
        connection: request.connection,
        lastHeartbeatAt: new Date(context.now).toISOString(),
        integrity: {
          ...current.integrity,
          connection: request.connection,
          fullscreen: request.fullscreen,
          tabSwitchCount: request.tabSwitchCount,
          offlineCount: current.integrity.offlineCount + (!wasOffline && isOffline ? 1 : 0),
        },
        timeline: changed
          ? appendEvent(
              current.timeline,
              timelineEvent(
                isOffline ? 'offline' : 'reconnected',
                context.now,
                null,
                isOffline ? 'Bağlantı kesildi' : 'Bağlantı geri geldi',
              ),
            )
          : current.timeline,
      }));

      return ok(buildSessionView(context.db, updated, exam, context.now));
    },
  },

  {
    /** Bulunulan soruyu kaydeder — yeniden bağlanınca aynı sorudan devam edilir. */
    method: 'PUT',
    path: '/api/sessions/:token/position',
    handle: (context) => {
      const { session, exam } = requireSession(context);
      const { index } = context.body as { index: number };

      if (isClosed(session.state)) throw businessRule('Oturum kapandı.');

      const bounded = Math.max(0, Math.min(exam.questions.length - 1, Math.trunc(index)));
      const questionId = exam.questions[bounded]?.questionId;

      const updated = touchSession(context, session.token, (current) => ({
        currentQuestionIndex: bounded,
        visitedQuestionIds: questionId
          ? unique([...current.visitedQuestionIds, questionId])
          : current.visitedQuestionIds,
      }));

      return ok(buildSessionView(context.db, updated, exam, context.now));
    },
  },

  {
    /**
     * Teslim.
     *
     * Teslim anında objektif cevaplar otomatik puanlanır (BR-11) ve deneme
     * kaydı oluşur. Puan öğrenciye DÖNMEZ (BR-49): teslim ekranı yalnızca
     * makbuz gösterir.
     */
    method: 'POST',
    path: '/api/sessions/:token/submit',
    handle: (context) => {
      const { session, exam } = requireSession(context);
      const request = (context.body ?? {}) as SubmitSessionRequest;

      // BR-48: kapanmış oturum ikinci kez teslim edilemez.
      if (isClosed(session.state)) {
        throw conflict('Bu oturum zaten teslim edilmiş.', { state: session.state });
      }

      const attempt = finalizeAttempt(context, session.token, request.autoSubmitted === true);

      const receipt: SubmissionReceipt = {
        attemptId: attempt.id,
        examTitle: exam.title,
        courseCode: context.db.collection('courses').findById(exam.courseId)?.code ?? '',
        submittedAt: attempt.submittedAt,
        durationSeconds: attempt.durationSeconds,
        answered: attempt.answers.filter((answer) => isAnswered(answer.value)).length,
        totalQuestions: attempt.answers.length,
        autoSubmitted: request.autoSubmitted === true,
      };

      return created(receipt);
    },
  },

  {
    /** Öğrencinin sınav geçmişi — kendi denemeleri. */
    method: 'GET',
    path: '/api/my/exam-history',
    handle: (context) => {
      const caller = requireCaller(context);

      const rows = context.db
        .collection('attempts')
        .filter((attempt) => attempt.studentId === caller.userId)
        .map((attempt) => ({
          attemptId: attempt.id,
          examId: attempt.examId,
          examTitle: attempt.examTitle,
          courseCode:
            context.db.collection('courses').findById(attempt.courseId)?.code ?? '',
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          durationSeconds: attempt.durationSeconds,
          state: attempt.state,
          // Sonuç açıklanmadıysa puan gösterilmez (BR-49).
          scorePercent: attempt.state === 'RELEASED' ? attempt.scorePercent : null,
          passed: attempt.state === 'RELEASED' ? attempt.passed : null,
        }))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

      return ok(rows);
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function findExam(context: MockContext): Exam {
  const exam = context.db.collection('exams').findById(context.params['id'] ?? '');
  if (!exam) throw notFound('Sınav');

  if (examRuntimeStatus(exam, context.now) === 'not_ready') {
    throw businessRule('Bu sınav henüz yayında değil.');
  }

  return exam;
}

/** Oturumu jetondan bulur ve sahibi olduğunu doğrular. */
function requireSession(context: MockContext) {
  const caller = requireCaller(context);
  const token = context.params['token'] ?? '';

  const session = context.db
    .collection('sessions')
    .filter((item) => item.token === token)
    .at(0);
  if (!session) throw notFound('Oturum');

  // Oturum kişiye özeldir: başkasının jetonuyla sınava girilemez.
  if (session.studentId !== caller.userId) {
    throw businessRule('Bu oturum size ait değil.');
  }

  const exam = context.db.collection('exams').findById(session.examId);
  if (!exam) throw notFound('Sınav');

  return { session, exam, caller };
}

function touchSession(
  context: MockContext,
  token: string,
  patch: (current: NonNullable<ReturnType<typeof findSession>>) => Record<string, unknown>,
) {
  const current = findSession(context.db, token);
  if (!current) throw notFound('Oturum');

  return context.db.collection('sessions').update(current.id, {
    ...patch(current),
    serverNow: new Date(context.now).toISOString(),
    updatedAt: new Date(context.now).toISOString(),
  })!;
}

function findSession(db: FakeDb, token: string) {
  return db
    .collection('sessions')
    .filter((item) => item.token === token)
    .at(0);
}

/**
 * Süresi dolmuş oturumu kapatır ve denemeye çevirir.
 *
 * Otomatik teslim istemcinin sayacına bırakılamaz: öğrenci sekmeyi kapatırsa
 * hiç tetiklenmezdi. Sunucu, oturuma her dokunulduğunda süreyi kontrol eder.
 */
function autoExpire(context: MockContext, token: string) {
  const session = findSession(context.db, token);
  if (!session || isClosed(session.state)) return null;
  if (context.now < Date.parse(session.expiresAt)) return null;

  finalizeAttempt(context, token, true);
  return findSession(context.db, token) ?? null;
}

/**
 * Oturumu kapatıp deneme kaydı üretir.
 *
 * Teslim ve otomatik teslim AYNI yoldan geçer; iki ayrı kod yolu, birinde
 * düzeltilen hatanın diğerinde kalmasına yol açardı.
 */
function finalizeAttempt(context: MockContext, token: string, autoSubmitted: boolean): Attempt {
  const session = findSession(context.db, token);
  if (!session) throw notFound('Oturum');

  const exam = context.db.collection('exams').findById(session.examId);
  if (!exam) throw notFound('Sınav');

  const questions = context.db.collection('questions');
  const drafts = draftsOf(context.db, token);
  const draftByQuestion = new Map(drafts.map((draft) => [draft.questionId, draft]));

  const answers: AttemptAnswer[] = exam.questions.map((ref) => {
    const question = questions.findById(ref.questionId);
    const draft = draftByQuestion.get(ref.questionId);
    const value = draft?.value ?? { kind: 'text' as const, value: '' };

    const score = question
      ? scoreAnswer(question, draft ? draft.value : null)
      : { awardedPoints: 0, correct: null, graded: false, partial: false };

    return {
      questionId: ref.questionId,
      questionVersionId: ref.questionVersionId,
      value,
      maxPoints: ref.points,
      awardedPoints: score.graded ? score.awardedPoints : 0,
      autoGraded: score.graded,
      correct: score.correct,
      gradedBy: null,
      feedback: '',
      rubricScores: [],
      timeSpentSeconds: 0,
    };
  });

  const totals = computeTotals(answers, exam.rules.passingScore);
  const submittedAtMs = Math.min(context.now, Date.parse(session.expiresAt));
  const submittedAt = new Date(submittedAtMs).toISOString();

  const student = context.db.collection('users').findById(session.studentId);
  const attemptNumber = usedAttemptCount(context.db, exam.id, session.studentId) + 1;

  const attempt = context.db.collection('attempts').insert({
    id: `att_${context.now.toString(36)}`,
    examId: exam.id,
    examTitle: exam.title,
    courseId: exam.courseId,
    studentId: session.studentId,
    studentName: student?.fullName ?? '',
    cohortId: student?.cohortIds[0] ?? exam.cohortIds[0] ?? '',
    sessionToken: token,
    attemptNumber,
    state: nextAttemptState(answers, 'AUTO_GRADED'),
    answers,
    totalScore: totals.totalScore,
    maxScore: totals.maxScore,
    scorePercent: totals.scorePercent,
    passed: totals.passed,
    startedAt: session.startedAt,
    submittedAt,
    gradedAt: null,
    releasedAt: null,
    durationSeconds: Math.max(0, Math.round((submittedAtMs - Date.parse(session.startedAt)) / 1000)),
    scoreHistory: [],
    createdAt: submittedAt,
    updatedAt: submittedAt,
    version: 1,
  });

  context.db.collection('sessions').update(session.id, {
    state: autoSubmitted ? 'EXPIRED' : 'SUBMITTED',
    submittedAt,
    autoSubmitted,
    serverNow: new Date(context.now).toISOString(),
    updatedAt: submittedAt,
    timeline: appendEvent(
      session.timeline,
      timelineEvent(
        autoSubmitted ? 'expired' : 'submitted',
        submittedAtMs,
        null,
        autoSubmitted ? 'Süre doldu, sınav otomatik teslim edildi' : 'Sınav teslim edildi',
      ),
    ),
  });

  // Sınavın deneme sayacı listelerde gösterilir; teslimle birlikte artar.
  context.db.collection('exams').update(exam.id, { attemptCount: exam.attemptCount + 1 });

  return attempt;
}

function buildSessionView(
  db: FakeDb,
  session: NonNullable<ReturnType<typeof findSession>>,
  exam: Exam,
  nowMs: number,
): SessionView {
  const drafts = draftsOf(db, session.token);
  const course = db.collection('courses').findById(exam.courseId);

  return {
    session: {
      ...session,
      serverNow: new Date(nowMs).toISOString(),
      remainingMs: Math.max(0, Date.parse(session.expiresAt) - nowMs),
    },
    examTitle: exam.title,
    courseCode: course?.code ?? '',
    instructions: exam.instructions,
    totalPoints: exam.totalPoints,
    questions: buildQuestionViews(db, exam, session.token),
    answers: drafts,
    integrity: session.integrity,
    timeline: session.timeline,
    lastSavedAt: lastSavedAt(drafts),
  };
}

/** Bekleme odasında gösterilen kural listesi — sınav ayarlarından türetilir. */
function examRules(exam: Exam): string[] {
  const rules = [
    'Sınav süresince sekme değiştirmemeniz önerilir; sekme değişimleri kayıt altına alınır.',
    'Cevaplarınız her değişiklikte otomatik kaydedilir; ayrıca kaydetmeniz gerekmez.',
    'Bağlantınız kesilirse cevaplarınız cihazınızda saklanır ve bağlantı gelince gönderilir.',
    `Süre dolduğunda sınav otomatik olarak teslim edilir (${exam.durationMinutes} dakika).`,
    'Tam ekran modunda çalışmanız, dikkat dağıtıcı öğeleri azaltır.',
  ];

  rules.push(
    exam.rules.allowBackNavigation
      ? 'Sorular arasında ileri geri geçiş yapabilirsiniz.'
      : 'Bir sonraki soruya geçtikten sonra geri dönemezsiniz.',
  );

  if (exam.rules.shuffleQuestions) {
    rules.push('Sorular her öğrenciye farklı sırada gösterilir.');
  }

  rules.push(
    exam.rules.showResultImmediately
      ? 'Sonucunuz teslimden hemen sonra açıklanır.'
      : 'Sonucunuz değerlendirme süreci tamamlandıktan sonra açıklanacaktır.',
  );

  return rules;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
