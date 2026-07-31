import { AuditAction } from '../../../../observability/audit.model';
import { PublishState } from '../../../../../features/adaptive-learning/models/common.model';
import {
  BLUEPRINT_LIMITS,
  BlueprintDetail,
  BlueprintOutcomeRow,
  ExamBlueprint,
} from '../../../../../features/adaptive-learning/models/blueprint.model';
import {
  alignRows,
  blueprintTotalQuestions,
  summarizeBlueprint,
} from '../../../../../features/adaptive-learning/domain/blueprint.rules';
import { equals, inList } from '../../db/query-engine';
import { businessRule, notFound } from '../../mock-errors';
import { isWithinScope, requirePermission } from '../../mock-auth';
import { MockContext, MockHandler, ok } from '../../mock-router';
import { createCrudHandlers, diffFields } from '../crud/crud-handlers';
import { FieldValidator, readNumber, readText } from '../crud/field-validator';

const TRANSITION_ACTIONS: Readonly<Record<PublishState, AuditAction>> = {
  DRAFT: 'blueprint.restored',
  REVIEW: 'blueprint.updated',
  PUBLISHED: 'blueprint.published',
  ARCHIVED: 'blueprint.archived',
};

/**
 * Blueprint uç noktaları.
 *
 * Ortak CRUD + yayın akışı `createCrudHandlers`'tan gelir; buraya blueprint'e
 * özgü satır doğrulaması, cohort kapsamı ve özet hesabı eklenir.
 */
export const BLUEPRINT_HANDLERS: readonly MockHandler[] = [
  {
    /** Detay: blueprint + ders/cohort adları + canlı özet + kazanım listesi. */
    method: 'GET',
    path: '/api/blueprints/:id/detail',
    handle: (context) => {
      const caller = requirePermission(context, 'blueprint:read');
      const blueprint = context.db.collection('blueprints').findById(context.params['id'] ?? '');
      if (!blueprint) throw notFound('Blueprint');

      if (!isWithinScope(caller, { courseId: blueprint.courseId })) {
        throw businessRule('Bu blueprint kapsamınız dışında.');
      }

      return ok(buildDetail(context, blueprint));
    },
  },

  ...createCrudHandlers<ExamBlueprint>({
    collection: 'blueprints',
    basePath: '/api/blueprints',
    entityLabel: 'Blueprint',
    auditType: 'ExamBlueprint',
    permissions: {
      read: 'blueprint:read',
      write: 'blueprint:write',
      publish: 'blueprint:write',
    },

    query: () => ({
      searchable: (blueprint: ExamBlueprint) => [blueprint.name, blueprint.description],
      filters: {
        courseId: equals<ExamBlueprint>((blueprint) => blueprint.courseId),
        cohortId: equals<ExamBlueprint>((blueprint) => blueprint.cohortId ?? ''),
        state: inList<ExamBlueprint>((blueprint) => blueprint.state),
        // "Yalnızca gruba özel planlar" filtresi.
        cohortOnly: (blueprint, value) =>
          value === true || value === 'true' ? blueprint.cohortId !== null : true,
      },
      sorters: {
        totalQuestions: (blueprint) => blueprintTotalQuestions(blueprint.rows),
        targetTotalPoints: (blueprint) => blueprint.targetTotalPoints,
      },
      defaultSort: { field: 'updatedAt', direction: 'desc' },
    }),

    scope: (caller, blueprint) => isWithinScope(caller, { courseId: blueprint.courseId }),

    labelOf: (blueprint) => blueprint.name,

    create: (context, caller) => {
      validate(context, null);
      const now = new Date(context.now).toISOString();

      return {
        id: `blp_${context.now.toString(36)}`,
        ...writableFields(context),
        state: 'DRAFT',
        publishedAt: null,
        archivedAt: null,
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
        { key: 'name', label: 'Ad' },
        { key: 'description', label: 'Açıklama' },
        { key: 'cohortId', label: 'Grup' },
        { key: 'targetTotalPoints', label: 'Hedef puan' },
        { key: 'targetDurationMinutes', label: 'Hedef süre (dk)' },
      ]),

    assertDeletable: (blueprint, context) => {
      const examCount = context.db
        .collection('exams')
        .count((exam) => exam.blueprintId === blueprint.id);

      if (examCount > 0) {
        throw businessRule(
          `Bu blueprint ${examCount} sınavda kullanılıyor. Silmek yerine arşivleyin.`,
          { examCount },
        );
      }
    },

    assertPublishable: (blueprint) => {
      if (blueprintTotalQuestions(blueprint.rows) === 0) {
        throw businessRule(
          'Blueprint hiç soru istemiyor. Yayına almadan önce en az bir kazanıma soru sayısı girin.',
        );
      }
    },

    auditActions: {
      created: 'blueprint.created',
      updated: 'blueprint.updated',
      deleted: 'blueprint.deleted',
      transition: (target) => TRANSITION_ACTIONS[target],
    },
  }),
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function writableFields(context: MockContext) {
  const body = context.body as Record<string, unknown> | null;

  return {
    name: readText(body, 'name'),
    description: readText(body, 'description'),
    courseId: readText(body, 'courseId'),
    cohortId: readText(body, 'cohortId') || null,
    rows: readRows(body),
    targetTotalPoints: readNumber(body, 'targetTotalPoints', 100),
    targetDurationMinutes: readNumber(body, 'targetDurationMinutes', 60),
  };
}

/** Satırlar okunurken negatif ve ondalıklı değerler kırpılır. */
function readRows(body: Record<string, unknown> | null): BlueprintOutcomeRow[] {
  const value = body?.['rows'];
  if (!Array.isArray(value)) return [];

  return value
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      outcomeId: readText(row, 'outcomeId'),
      easy: clampCell(row['easy']),
      medium: clampCell(row['medium']),
      hard: clampCell(row['hard']),
    }))
    .filter((row) => row.outcomeId.length > 0);
}

function clampCell(value: unknown): number {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed)) return 0;

  return Math.min(
    BLUEPRINT_LIMITS.questionsPerCell.max,
    Math.max(BLUEPRINT_LIMITS.questionsPerCell.min, parsed),
  );
}

function validate(context: MockContext, currentId: string | null): void {
  const body = context.body as Record<string, unknown> | null;
  const blueprints = context.db.collection('blueprints');
  const courses = context.db.collection('courses');
  const outcomes = context.db.collection('outcomes');

  const courseId = readText(body, 'courseId');
  const cohortId = readText(body, 'cohortId');
  const rows = readRows(body);

  new FieldValidator(body)
    .text('name', 'Blueprint adı', BLUEPRINT_LIMITS.name)
    .unique('name', 'Blueprint adı', (value) =>
      blueprints
        .all()
        .some(
          (item) =>
            item.id !== currentId &&
            item.courseId === courseId &&
            item.name.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'),
        ),
    )
    .text('description', 'Açıklama', BLUEPRINT_LIMITS.description, { required: false })
    .reference('courseId', 'Ders', (id) => courses.findById(id) !== undefined)
    .integer('targetTotalPoints', 'Hedef puan', BLUEPRINT_LIMITS.targetTotalPoints)
    .integer('targetDurationMinutes', 'Hedef süre', BLUEPRINT_LIMITS.targetDurationMinutes)
    .custom(
      'rows',
      'Blueprint en az bir kazanım satırı içermelidir.',
      rows.length >= BLUEPRINT_LIMITS.rowCount.min,
    )
    .custom(
      'rows',
      'Seçilen kazanımlardan bazıları bu derse ait değil.',
      rows.every((row) => outcomes.findById(row.outcomeId)?.courseId === courseId),
    )
    // Cohort verildiyse dersin gruplarından biri olmalı.
    .custom(
      'cohortId',
      'Seçilen grup bu derse atanmamış.',
      cohortId.length === 0 ||
        (courses.findById(courseId)?.cohortIds ?? []).includes(cohortId),
    )
    .assert();
}

function buildDetail(context: MockContext, blueprint: ExamBlueprint): BlueprintDetail {
  const course = context.db.collection('courses').findById(blueprint.courseId);
  const cohort = blueprint.cohortId
    ? context.db.collection('cohorts').findById(blueprint.cohortId)
    : null;

  const courseOutcomes = context.db
    .collection('outcomes')
    .filter((outcome) => outcome.courseId === blueprint.courseId)
    .sort((a, b) => a.code.localeCompare(b.code, 'tr-TR'));

  const outcomeIds = courseOutcomes.map((outcome) => outcome.id);

  return {
    blueprint: { ...blueprint, rows: alignRows(blueprint.rows, outcomeIds) },
    courseCode: course?.code ?? '',
    courseName: course?.name ?? '',
    cohortName: cohort?.name ?? null,
    summary: summarizeBlueprint(blueprint, outcomeIds),
    outcomes: courseOutcomes.map((outcome) => ({
      id: outcome.id,
      code: outcome.code,
      title: outcome.title,
    })),
    examCount: context.db.collection('exams').count((exam) => exam.blueprintId === blueprint.id),
  };
}
