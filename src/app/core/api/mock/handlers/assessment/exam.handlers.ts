import { AuditAction } from '../../../../observability/audit.model';
import { PublishState } from '../../../../../features/adaptive-learning/models/common.model';
import {
  DEFAULT_EXAM_RULES,
  EXAM_LIMITS,
  Exam,
  ExamDetail,
  ExamPublishEvent,
  ExamQuestionRef,
  ExamRules,
  ExamStatistics,
} from '../../../../../features/adaptive-learning/models/exam.model';
import { summarizeBlueprint } from '../../../../../features/adaptive-learning/domain/blueprint.rules';
import { buildConstraintSnapshot } from '../../../../../features/adaptive-learning/domain/exam-validation';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import { isEditable } from '../../../../../features/adaptive-learning/domain/publish-workflow';
import {
  renumber,
  selectQuestions,
  totalPointsOf,
} from '../../../../../features/adaptive-learning/domain/question-selector';
import { AUDIT_ACTION_LABELS } from '../../../../observability/audit.model';
import { equals, inList, includesId } from '../../db/query-engine';
import { businessRule, notFound, validation } from '../../mock-errors';
import { isWithinScope, requirePermission } from '../../mock-auth';
import { MockContext, MockHandler, created, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';
import { createCrudHandlers, diffFields } from '../crud/crud-handlers';
import { FieldValidator, readNumber, readStringArray, readText } from '../crud/field-validator';
import {
  buildQuestionViews,
  buildSelectionPool,
  buildValidationInput,
} from './exam-context';

const TRANSITION_ACTIONS: Readonly<Record<PublishState, AuditAction>> = {
  DRAFT: 'exam.restored',
  REVIEW: 'exam.review_requested',
  PUBLISHED: 'exam.published',
  ARCHIVED: 'exam.archived',
};

/**
 * Sınav uç noktaları.
 *
 * Ortak CRUD + yayın akışı `createCrudHandlers`'tan gelir. Sınava özgü olan
 * otomatik soru seçimi, canlı doğrulama, kopyalama ve zengin detay burada tanımlıdır.
 *
 * SIRA ÖNEMLİ: özgül yollar `:id` kalıbından önce gelmelidir.
 */
export const EXAM_HANDLERS: readonly MockHandler[] = [
  {
    /** Detay: sınav + sorular + kısıtlar + yayın geçmişi + istatistik. */
    method: 'GET',
    path: '/api/exams/:id/detail',
    handle: (context) => {
      const caller = requirePermission(context, 'exam:read');
      const exam = findExam(context);
      assertScope(context, exam);

      return ok(buildDetail(context, exam, caller.userId));
    },
  },

  {
    /**
     * Canlı doğrulama.
     *
     * Wizard her değişiklikte istemcide de hesaplar; bu uç nokta kaydedilmiş
     * hâlin doğrulamasını verir (yenile/paylaş sonrası tutarlılık için).
     */
    method: 'GET',
    path: '/api/exams/:id/validate',
    handle: (context) => {
      requirePermission(context, 'exam:read');
      const exam = findExam(context);
      assertScope(context, exam);

      return ok(buildConstraintSnapshot(buildValidationInput(context.db, exam)));
    },
  },

  {
    /**
     * Blueprint'e göre otomatik soru seçimi (BR-05).
     *
     * `replace=true` gönderilirse mevcut seçim sıfırlanır; aksi hâlde eldeki
     * sorular korunur ve yalnızca eksik hücreler tamamlanır.
     */
    method: 'POST',
    path: '/api/exams/:id/auto-select',
    handle: (context) => {
      const caller = requirePermission(context, 'exam:write');
      const exam = findExam(context);
      assertScope(context, exam);
      assertEditable(exam);

      if (!exam.blueprintId) {
        throw businessRule('Otomatik seçim için önce bir blueprint seçmelisiniz.');
      }

      const blueprint = context.db.collection('blueprints').findById(exam.blueprintId);
      if (!blueprint) throw businessRule('Sınava bağlı blueprint bulunamadı.');

      const replace = (context.body as { replace?: unknown } | null)?.replace === true;
      const pool = buildSelectionPool(context.db, exam.courseId);

      const result = selectQuestions({
        rows: blueprint.rows,
        questions: pool.questions,
        existing: replace ? [] : exam.questions,
        versionIdByQuestion: pool.versionIdByQuestion,
      });

      const updated = saveQuestions(context, exam, result.questions, caller.userId);

      return ok({
        exam: updated,
        questions: buildQuestionViews(context.db, updated.questions),
        shortfalls: result.shortfalls,
        addedCount: result.addedCount,
        constraints: buildConstraintSnapshot(buildValidationInput(context.db, updated)),
      });
    },
  },

  {
    /** Soru listesini elle günceller (ekleme, çıkarma, sıralama). */
    method: 'PUT',
    path: '/api/exams/:id/questions',
    handle: (context) => {
      const caller = requirePermission(context, 'exam:write');
      const exam = findExam(context);
      assertScope(context, exam);
      assertEditable(exam);

      const questionIds = readStringArray(context.body, 'questionIds');
      if (questionIds.length > EXAM_LIMITS.questionCount.max) {
        throw validation(`Bir sınavda en fazla ${EXAM_LIMITS.questionCount.max} soru olabilir.`);
      }

      const pool = buildSelectionPool(context.db, exam.courseId);
      const byId = new Map(pool.questions.map((question) => [question.id, question] as const));

      const refs: ExamQuestionRef[] = questionIds.flatMap((questionId, index) => {
        const question = byId.get(questionId);
        const version = pool.versionIdByQuestion.get(questionId);
        if (!question || !version) return [];

        return [
          {
            questionId,
            questionVersionId: version.id,
            versionNumber: version.versionNumber,
            order: index + 1,
            points: question.points,
          },
        ];
      });

      const updated = saveQuestions(context, exam, refs, caller.userId);

      return ok({
        exam: updated,
        questions: buildQuestionViews(context.db, updated.questions),
        constraints: buildConstraintSnapshot(buildValidationInput(context.db, updated)),
      });
    },
  },

  {
    /**
     * Sınavı kopyalar.
     *
     * `mode=clone` sorularıyla birlikte kopyalar (aynı ölçme planının başka bir
     * gruba uygulanması); `mode=duplicate` yalnızca iskeleti kopyalar.
     */
    method: 'POST',
    path: '/api/exams/:id/duplicate',
    handle: (context) => {
      const caller = requirePermission(context, 'exam:write');
      const source = findExam(context);
      assertScope(context, source);

      const body = context.body as { mode?: unknown; cohortIds?: unknown } | null;
      const withQuestions = String(body?.mode ?? 'clone') === 'clone';
      const cohortIds = Array.isArray(body?.cohortIds)
        ? body.cohortIds.filter((id): id is string => typeof id === 'string')
        : source.cohortIds;

      const nowIso = new Date(context.now).toISOString();
      const questions = withQuestions ? renumber(source.questions) : [];

      const copy: Exam = {
        ...source,
        id: `exm_${context.now.toString(36)}`,
        title: uniqueTitle(context, source.courseId, source.title),
        cohortIds,
        questions,
        totalPoints: totalPointsOf(questions),
        state: 'DRAFT',
        publishedAt: null,
        archivedAt: null,
        attemptCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
        createdBy: caller.userId,
        updatedBy: caller.userId,
      };

      context.db.collection('exams').insert(copy);
      writeAudit(context, caller, 'exam.duplicated', examTarget(copy), `Kaynak: ${source.title}`);

      return created(copy);
    },
  },

  /* ── Ortak CRUD + yayın akışı ───────────────────────────────────────── */
  ...createCrudHandlers<Exam>({
    collection: 'exams',
    basePath: '/api/exams',
    entityLabel: 'Sınav',
    auditType: 'Exam',
    permissions: {
      read: 'exam:read',
      write: 'exam:write',
      publish: 'exam:publish',
    },

    query: () => ({
      searchable: (exam: Exam) => [exam.title, exam.description],
      filters: {
        courseId: equals<Exam>((exam) => exam.courseId),
        blueprintId: equals<Exam>((exam) => exam.blueprintId ?? ''),
        state: inList<Exam>((exam) => exam.state),
        cohortId: includesId<Exam>((exam) => exam.cohortIds),
      },
      sorters: {
        totalPoints: (exam) => exam.totalPoints,
        durationMinutes: (exam) => exam.durationMinutes,
        questionCount: (exam) => exam.questions.length,
        opensAt: (exam) => Date.parse(exam.opensAt),
      },
      defaultSort: { field: 'updatedAt', direction: 'desc' },
    }),

    scope: (caller, exam) =>
      isWithinScope(caller, { courseId: exam.courseId, cohortIds: exam.cohortIds }),

    labelOf: (exam) => exam.title,

    create: (context, caller) => {
      validate(context, null);
      const now = new Date(context.now).toISOString();

      return {
        id: `exm_${context.now.toString(36)}`,
        ...writableFields(context),
        questions: [],
        totalPoints: 0,
        state: 'DRAFT',
        publishedAt: null,
        archivedAt: null,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
        version: 1,
        createdBy: caller.userId,
        updatedBy: caller.userId,
      };
    },

    update: (existing, context, caller) => {
      validate(context, existing.id);

      return {
        ...existing,
        ...writableFields(context),
        version: existing.version + 1,
        updatedAt: new Date(context.now).toISOString(),
        updatedBy: caller.userId,
      };
    },

    changesOf: (before, after) =>
      diffFields(before, after, [
        { key: 'title', label: 'Ad' },
        { key: 'description', label: 'Açıklama' },
        { key: 'blueprintId', label: 'Blueprint' },
        { key: 'durationMinutes', label: 'Süre (dk)' },
        { key: 'opensAt', label: 'Açılış' },
        { key: 'closesAt', label: 'Kapanış' },
        { key: 'cohortIds', label: 'Gruplar' },
        { key: 'totalPoints', label: 'Toplam puan' },
      ]),

    assertDeletable: (exam) => {
      if (exam.attemptCount > 0) {
        throw businessRule(
          `Bu sınava ${exam.attemptCount} deneme yapılmış. Silmek yerine arşivleyin.`,
          { attemptCount: exam.attemptCount },
        );
      }
    },

    /* Yayına almadan önce doğrulama motoru bir kez daha çalışır (BR-04). */
    assertPublishable: (exam, context) => {
      const result = buildConstraintSnapshot(buildValidationInput(context.db, exam)).validation;

      if (!result.publishReady) {
        const first = result.issues.find((issue) => issue.severity === 'error');
        throw businessRule(
          `Sınav yayına alınamaz: ${first?.message ?? 'doğrulama kuralları sağlanmıyor.'}`,
          { issues: result.issues },
        );
      }
    },

    auditActions: {
      created: 'exam.created',
      updated: 'exam.updated',
      deleted: 'exam.deleted',
      transition: (target) => TRANSITION_ACTIONS[target],
    },
  }),
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function findExam(context: MockContext): Exam {
  const exam = context.db.collection('exams').findById(context.params['id'] ?? '');
  if (!exam) throw notFound('Sınav');
  return exam;
}

function assertScope(context: MockContext, exam: Exam): void {
  const caller = context.caller;
  if (!caller || !isWithinScope(caller, { courseId: exam.courseId, cohortIds: exam.cohortIds })) {
    throw businessRule('Bu sınav kapsamınız dışında.');
  }
}

/** Yayındaki/arşivdeki sınav düzenlenemez (BR-21). */
function assertEditable(exam: Exam): void {
  if (!isEditable(exam.state)) {
    throw businessRule(
      'Yayındaki bir sınavın soruları değiştirilemez. Önce taslağa geri alın veya kopyalayın.',
      { state: exam.state },
    );
  }
}

function writableFields(context: MockContext) {
  const body = context.body as Record<string, unknown> | null;

  return {
    title: readText(body, 'title'),
    description: readText(body, 'description'),
    instructions: readText(body, 'instructions'),
    courseId: readText(body, 'courseId'),
    blueprintId: readText(body, 'blueprintId') || null,
    cohortIds: readStringArray(body, 'cohortIds'),
    durationMinutes: readNumber(body, 'durationMinutes', 60),
    opensAt: readText(body, 'opensAt'),
    closesAt: readText(body, 'closesAt'),
    rules: readRules(body),
  };
}

function readRules(body: Record<string, unknown> | null): ExamRules {
  const raw = body?.['rules'];
  if (typeof raw !== 'object' || raw === null) return DEFAULT_EXAM_RULES;

  const rules = raw as Record<string, unknown>;
  return {
    shuffleQuestions: rules['shuffleQuestions'] === true,
    shuffleOptions: rules['shuffleOptions'] === true,
    allowBackNavigation: rules['allowBackNavigation'] !== false,
    showResultImmediately: rules['showResultImmediately'] === true,
    passingScore: clamp(
      Number(rules['passingScore'] ?? DEFAULT_EXAM_RULES.passingScore),
      EXAM_LIMITS.passingScore.min,
      EXAM_LIMITS.passingScore.max,
    ),
    maxAttempts: clamp(
      Number(rules['maxAttempts'] ?? DEFAULT_EXAM_RULES.maxAttempts),
      EXAM_LIMITS.maxAttempts.min,
      EXAM_LIMITS.maxAttempts.max,
    ),
    autoSubmit: rules['autoSubmit'] !== false,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function validate(context: MockContext, currentId: string | null): void {
  const body = context.body as Record<string, unknown> | null;
  const exams = context.db.collection('exams');
  const courseId = readText(body, 'courseId');
  const cohortIds = readStringArray(body, 'cohortIds');
  const course = context.db.collection('courses').findById(courseId);

  new FieldValidator(body)
    .text('title', 'Sınav adı', EXAM_LIMITS.title)
    .unique('title', 'Sınav adı', (value) =>
      exams
        .all()
        .some(
          (exam) =>
            exam.id !== currentId &&
            exam.courseId === courseId &&
            exam.title.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'),
        ),
    )
    .text('description', 'Açıklama', EXAM_LIMITS.description, { required: false })
    .text('instructions', 'Yönerge', EXAM_LIMITS.instructions, { required: false })
    .reference('courseId', 'Ders', () => course !== undefined)
    .integer('durationMinutes', 'Sınav süresi', EXAM_LIMITS.durationMinutes)
    .custom('cohortIds', 'Sınav en az bir gruba atanmalıdır.', cohortIds.length > 0)
    .custom(
      'cohortIds',
      'Seçilen gruplardan bazıları bu derse atanmamış.',
      cohortIds.every((id) => (course?.cohortIds ?? []).includes(id)),
    )
    .custom(
      'blueprintId',
      'Seçilen blueprint bu derse ait değil.',
      isBlueprintValid(context, readText(body, 'blueprintId'), courseId),
    )
    .custom('opensAt', 'Açılış tarihi zorunludur.', readText(body, 'opensAt').length > 0)
    .custom(
      'closesAt',
      'Kapanış tarihi açılış tarihinden sonra olmalıdır.',
      isWindowValid(readText(body, 'opensAt'), readText(body, 'closesAt')),
    )
    .assert();
}

function isBlueprintValid(context: MockContext, blueprintId: string, courseId: string): boolean {
  if (blueprintId.length === 0) return true;
  return context.db.collection('blueprints').findById(blueprintId)?.courseId === courseId;
}

function isWindowValid(opensAt: string, closesAt: string): boolean {
  const opens = Date.parse(opensAt);
  const closes = Date.parse(closesAt);
  if (Number.isNaN(opens) || Number.isNaN(closes)) return false;
  return closes > opens;
}

/** Kopyalanan sınava çakışmayan bir ad üretir. */
function uniqueTitle(context: MockContext, courseId: string, baseTitle: string): string {
  const taken = new Set(
    context.db
      .collection('exams')
      .filter((exam) => exam.courseId === courseId)
      .map((exam) => exam.title.toLocaleLowerCase('tr-TR')),
  );

  for (let suffix = 1; suffix < 50; suffix++) {
    const candidate = `${baseTitle} (kopya ${suffix})`.slice(0, EXAM_LIMITS.title.max);
    if (!taken.has(candidate.toLocaleLowerCase('tr-TR'))) return candidate;
  }
  return `${baseTitle} (${Date.now().toString(36)})`.slice(0, EXAM_LIMITS.title.max);
}

/** Soru listesini kaydeder ve toplam puanı yeniden hesaplar. */
function saveQuestions(
  context: MockContext,
  exam: Exam,
  refs: readonly ExamQuestionRef[],
  userId: string,
): Exam {
  const ordered = renumber(refs);

  return context.db.collection('exams').update(exam.id, {
    questions: ordered,
    totalPoints: totalPointsOf(ordered),
    version: exam.version + 1,
    updatedAt: new Date(context.now).toISOString(),
    updatedBy: userId,
  })!;
}

/* ── Detay ───────────────────────────────────────────────────────────────── */

function buildDetail(context: MockContext, exam: Exam, _callerId: string): ExamDetail {
  const db = context.db;
  const course = db.collection('courses').findById(exam.courseId);
  const cohorts = db.collection('cohorts');
  const outcomes = db.collection('outcomes');

  const blueprint = exam.blueprintId ? db.collection('blueprints').findById(exam.blueprintId) : null;
  const courseOutcomeIds = outcomes
    .filter((outcome) => outcome.courseId === exam.courseId)
    .map((outcome) => outcome.id);

  const questions = buildQuestionViews(db, exam.questions);
  const usedOutcomeIds = [...new Set(questions.flatMap((question) => question.outcomeIds))];

  return {
    exam,
    courseCode: course?.code ?? '',
    courseName: course?.name ?? '',
    cohortNames: exam.cohortIds
      .map((id) => cohorts.findById(id)?.name)
      .filter((name): name is string => name !== undefined),
    blueprintName: blueprint?.name ?? null,
    blueprintSummary: blueprint
      ? {
          totalQuestions: summarizeBlueprint(blueprint, courseOutcomeIds).totalQuestions,
          targetTotalPoints: blueprint.targetTotalPoints,
          coveragePercent: summarizeBlueprint(blueprint, courseOutcomeIds).coveragePercent,
        }
      : null,
    questions,
    outcomes: usedOutcomeIds.flatMap((id) => {
      const outcome = outcomes.findById(id);
      return outcome ? [{ id: outcome.id, code: outcome.code, title: outcome.title }] : [];
    }),
    constraints: buildConstraintSnapshot(buildValidationInput(db, exam)),
    publishHistory: buildPublishHistory(context, exam),
    statistics: buildStatistics(context, exam),
    runtimeStatus: examRuntimeStatus(exam, context.now),
    isEditable: isEditable(exam.state),
  };
}

/** Yayın geçmişi denetim kaydından okunur — ayrı bir tablo tutulmaz. */
function buildPublishHistory(context: MockContext, exam: Exam): ExamPublishEvent[] {
  return context.db
    .collection('auditEvents')
    .filter((event) => event.targetId === exam.id && event.targetType === 'Exam')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12)
    .map((event) => ({
      id: event.id,
      action: event.action,
      actionLabel: AUDIT_ACTION_LABELS[event.action] ?? event.action,
      actorName: event.actorName,
      reason: event.reason,
      at: event.createdAt,
    }));
}

/** Sınav istatistikleri — deneme verisinden; oturum modülü gelince zenginleşir. */
function buildStatistics(context: MockContext, exam: Exam): ExamStatistics {
  const attempts = context.db
    .collection('attempts')
    .filter((attempt) => attempt.examId === exam.id);

  if (attempts.length === 0) {
    return {
      attemptCount: 0,
      averageScorePercent: null,
      passRatePercent: null,
      averageDurationMinutes: null,
    };
  }

  const average = (values: readonly number[]) =>
    Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  return {
    attemptCount: attempts.length,
    averageScorePercent: average(attempts.map((attempt) => attempt.scorePercent)),
    passRatePercent: Math.round(
      (attempts.filter((attempt) => attempt.passed).length / attempts.length) * 100,
    ),
    averageDurationMinutes: average(
      attempts.map((attempt) => Math.round(attempt.durationSeconds / 60)),
    ),
  };
}

/** Denetim kaydında sınavın nasıl görüneceği. */
function examTarget(exam: Exam) {
  return { type: 'Exam', id: exam.id, label: exam.title };
}
