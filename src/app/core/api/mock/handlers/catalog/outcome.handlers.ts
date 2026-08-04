import { AuditAction } from '../../../../observability/audit.model';
import { mockIpAddress } from '../audit-writer';
import {
  COGNITIVE_LEVELS,
  DIFFICULTIES,
  PublishState,
} from '../../../../../features/adaptive-learning/models/common.model';
import {
  OUTCOME_LIMITS,
  LearningOutcome,
  OutcomeGraph,
} from '../../../../../features/adaptive-learning/models/learning-outcome.model';
import {
  computeDepths,
  detectCycles,
  directDependents,
  findCyclePath,
} from '../../../../../features/adaptive-learning/domain/outcome-graph.rules';
import { equals, inList, includesId } from '../../db/query-engine';
import { FakeDb } from '../../db/fake-db';
import { businessRule, notFound, validation } from '../../mock-errors';
import { isWithinScope, requirePermission } from '../../mock-auth';
import { MockContext, MockHandler, ok } from '../../mock-router';
import { createCrudHandlers, diffFields } from '../crud/crud-handlers';
import { FieldValidator, readNumber, readStringArray, readText } from '../crud/field-validator';
import { recalculateCourseCounters } from './course.handlers';
import { recalculateProgramCounters } from './program.handlers';

const TRANSITION_ACTIONS: Readonly<Record<PublishState, AuditAction>> = {
  DRAFT: 'outcome.restored',
  REVIEW: 'outcome.updated',
  PUBLISHED: 'outcome.published',
  ARCHIVED: 'outcome.archived',
};

/**
 * Kazanım uç noktaları: CRUD + yayın iş akışı + önkoşul yönetimi + grafik.
 *
 * Döngü kontrolü (BR-01) hem `PUT /outcomes/:id` hem de önkoşul uç noktalarında
 * uygulanır ve **istemciyle aynı saf fonksiyonları** kullanır
 * (`domain/outcome-graph.rules.ts`) — iki taraf farklı sonuç veremez.
 */
export const OUTCOME_HANDLERS: readonly MockHandler[] = [
  /* Özgül yollar genel `:id` kalıbından ÖNCE gelmelidir. */
  {
    method: 'GET',
    path: '/api/outcomes/graph',
    handle: (context) => {
      const caller = requirePermission(context, 'outcome:read');
      const courseId = context.query.get('courseId');

      const outcomes = context.db
        .collection('outcomes')
        .filter(
          (outcome) =>
            (!courseId || outcome.courseId === courseId) &&
            isWithinScope(caller, { courseId: outcome.courseId }),
        );

      return ok(buildGraph(context.db, outcomes));
    },
  },

  {
    /**
     * Bir önkoşul adayının döngü oluşturup oluşturmayacağını önceden sorar.
     * Form, kullanıcı seçim yaparken anında geri bildirim verebilsin diye vardır.
     */
    method: 'POST',
    path: '/api/outcomes/graph/validate',
    handle: (context) => {
      requirePermission(context, 'outcome:read');

      const outcomeId = readText(context.body, 'outcomeId');
      const candidateIds = readStringArray(context.body, 'prerequisiteIds');
      const graph = prerequisiteMap(context.db, outcomeId, candidateIds);
      const outcomes = context.db.collection('outcomes');

      for (const candidate of candidateIds) {
        const path = findCyclePath(graph, outcomeId, candidate);
        if (path) {
          return ok({
            valid: false,
            candidateId: candidate,
            path: path.map((id) => outcomes.findById(id)?.code ?? id),
          });
        }
      }

      return ok({ valid: true, candidateId: null, path: [] });
    },
  },

  ...createCrudHandlers<LearningOutcome>({
    collection: 'outcomes',
    basePath: '/api/outcomes',
    entityLabel: 'Kazanım',
    auditType: 'LearningOutcome',
    permissions: {
      read: 'outcome:read',
      write: 'outcome:write',
      publish: 'outcome:write',
    },

    query: () => ({
      searchable: (outcome: LearningOutcome) => [
        outcome.code,
        outcome.title,
        outcome.description,
        ...outcome.tags,
      ],
      filters: {
        courseId: equals<LearningOutcome>((outcome) => outcome.courseId),
        level: inList<LearningOutcome>((outcome) => outcome.level),
        difficulty: inList<LearningOutcome>((outcome) => outcome.difficulty),
        state: inList<LearningOutcome>((outcome) => outcome.state),
        tags: includesId<LearningOutcome>((outcome) => outcome.tags),
        hasPrerequisite: (outcome, value) =>
          outcome.prerequisiteIds.length > 0 === (value === 'true' || value === true),
      },
      sorters: {
        estimatedDurationMinutes: (outcome) => outcome.estimatedDurationMinutes,
        prerequisiteCount: (outcome) => outcome.prerequisiteIds.length,
        questionCount: (outcome) => outcome.questionCount,
      },
      defaultSort: { field: 'code', direction: 'asc' },
    }),

    scope: (caller, outcome) => isWithinScope(caller, { courseId: outcome.courseId }),

    labelOf: (outcome) => `${outcome.code} · ${outcome.title}`,

    create: (context, caller) => {
      const body = context.body;
      const id = `out_${context.now.toString(36)}`;
      validate(context, body, null);

      const prerequisiteIds = readStringArray(body, 'prerequisiteIds');
      assertNoCycle(context, id, prerequisiteIds);

      const now = new Date(context.now).toISOString();

      return {
        id,
        code: readText(body, 'code').toLocaleUpperCase('tr-TR'),
        title: readText(body, 'title'),
        description: readText(body, 'description'),
        courseId: readText(body, 'courseId'),
        level: readText(body, 'level') as LearningOutcome['level'],
        difficulty: readText(body, 'difficulty') as LearningOutcome['difficulty'],
        estimatedDurationMinutes: readNumber(body, 'estimatedDurationMinutes'),
        tags: readStringArray(body, 'tags'),
        prerequisiteIds,
        state: 'DRAFT',
        weight: readNumber(body, 'weight', 1),
        questionCount: 0,
        contentCount: 0,
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
      const body = context.body;
      validate(context, body, existing.id);

      const prerequisiteIds = readStringArray(body, 'prerequisiteIds');
      assertNoCycle(context, existing.id, prerequisiteIds);

      return {
        ...existing,
        code: readText(body, 'code').toLocaleUpperCase('tr-TR'),
        title: readText(body, 'title'),
        description: readText(body, 'description'),
        courseId: readText(body, 'courseId'),
        level: readText(body, 'level') as LearningOutcome['level'],
        difficulty: readText(body, 'difficulty') as LearningOutcome['difficulty'],
        estimatedDurationMinutes: readNumber(body, 'estimatedDurationMinutes'),
        tags: readStringArray(body, 'tags'),
        prerequisiteIds,
        weight: readNumber(body, 'weight', existing.weight),
        version: existing.version + 1,
        updatedAt: new Date(context.now).toISOString(),
        updatedBy: caller.userId,
      };
    },

    changesOf: (before, after) =>
      diffFields(before, after, [
        { key: 'code', label: 'Kod' },
        { key: 'title', label: 'Başlık' },
        { key: 'description', label: 'Açıklama' },
        { key: 'level', label: 'Bilişsel seviye' },
        { key: 'difficulty', label: 'Zorluk' },
        { key: 'estimatedDurationMinutes', label: 'Tahmini süre (dk)' },
        { key: 'weight', label: 'Ağırlık' },
        { key: 'tags', label: 'Etiketler' },
        { key: 'prerequisiteIds', label: 'Önkoşullar' },
      ]),

    assertDeletable: (outcome, context) => {
      const outcomes = context.db.collection('outcomes').all();
      const dependents = directDependents(toPrerequisiteMap(outcomes), outcome.id);

      if (dependents.length > 0) {
        const codes = dependents
          .map((id) => outcomes.find((item) => item.id === id)?.code ?? id)
          .join(', ');
        throw businessRule(
          `Bu kazanım ${dependents.length} kazanımın önkoşulu (${codes}). Silmeden önce bu bağlantıları kaldırın.`,
          { dependents },
        );
      }

      const questionCount = context.db
        .collection('questions')
        .count((question) => question.outcomeIds.includes(outcome.id));

      if (questionCount > 0) {
        throw businessRule(
          `Bu kazanıma bağlı ${questionCount} soru var. Kazanımı silmeden önce soruları başka bir kazanıma taşıyın.`,
          { questionCount },
        );
      }
    },

    assertPublishable: (outcome, context) => {
      // Yayınlanmamış bir önkoşula bağlı kazanım yayınlanamaz (BR-01 tamamlayıcısı).
      const outcomes = context.db.collection('outcomes').all();
      const unpublished = outcome.prerequisiteIds
        .map((id) => outcomes.find((item) => item.id === id))
        .filter((item) => item !== undefined && item.state !== 'PUBLISHED');

      if (unpublished.length > 0) {
        throw businessRule(
          `Önkoşulları henüz yayınlanmamış: ${unpublished.map((item) => item!.code).join(', ')}. Önce önkoşul kazanımları yayına alın.`,
          { unpublished: unpublished.map((item) => item!.id) },
        );
      }
    },

    auditActions: {
      created: 'outcome.created',
      updated: 'outcome.updated',
      deleted: 'outcome.deleted',
      transition: (target) => TRANSITION_ACTIONS[target],
    },

    afterChange: (context) => {
      recalculateCourseCounters(context);
      recalculateProgramCounters(context);
    },
  }),

  /* ── Önkoşul yönetimi ───────────────────────────────────────────────── */
  {
    method: 'GET',
    path: '/api/outcomes/:id/prerequisites',
    handle: (context) => {
      requirePermission(context, 'outcome:read');
      const outcomes = context.db.collection('outcomes');
      const outcome = outcomes.findById(context.params['id'] ?? '');
      if (!outcome) throw notFound('Kazanım');

      return ok({
        prerequisites: outcome.prerequisiteIds
          .map((id) => outcomes.findById(id))
          .filter((item): item is LearningOutcome => item !== undefined),
        dependents: directDependents(toPrerequisiteMap(outcomes.all()), outcome.id)
          .map((id) => outcomes.findById(id))
          .filter((item): item is LearningOutcome => item !== undefined),
      });
    },
  },

  {
    method: 'PUT',
    path: '/api/outcomes/:id/prerequisites',
    handle: (context) => {
      const caller = requirePermission(context, 'outcome:write');
      const outcomes = context.db.collection('outcomes');
      const outcome = outcomes.findById(context.params['id'] ?? '');
      if (!outcome) throw notFound('Kazanım');

      const prerequisiteIds = readStringArray(context.body, 'prerequisiteIds');

      if (prerequisiteIds.length > OUTCOME_LIMITS.prerequisiteCount.max) {
        throw validation(
          `Bir kazanıma en fazla ${OUTCOME_LIMITS.prerequisiteCount.max} önkoşul tanımlanabilir.`,
        );
      }

      const missing = prerequisiteIds.filter((id) => outcomes.findById(id) === undefined);
      if (missing.length > 0) throw validation('Seçilen önkoşullardan bazıları bulunamadı.');

      assertNoCycle(context, outcome.id, prerequisiteIds);

      const updated = outcomes.update(outcome.id, {
        prerequisiteIds,
        version: outcome.version + 1,
        updatedAt: new Date(context.now).toISOString(),
        updatedBy: caller.userId,
      })!;

      const actor = context.db.collection('users').findById(caller.userId);
      const codeOf = (id: string) => outcomes.findById(id)?.code ?? id;

      context.db.collection('auditEvents').insert({
        id: `aud_${context.now}_${Math.random().toString(36).slice(2, 8)}`,
        action: 'outcome.prerequisites.updated',
        actorId: caller.userId,
        actorName: actor?.fullName ?? 'Bilinmiyor',
        actorRole: caller.role,
        targetType: 'LearningOutcome',
        targetId: outcome.id,
        targetLabel: `${outcome.code} · ${outcome.title}`,
        reason: null,
        changes: [
          {
            field: 'prerequisiteIds',
            label: 'Önkoşullar',
            oldValue: outcome.prerequisiteIds.map(codeOf).join(', ') || null,
            newValue: prerequisiteIds.map(codeOf).join(', ') || null,
          },
        ],
        correlationId: context.request.headers.get('X-Correlation-Id'),
        ipAddress: mockIpAddress(caller.userId),
        success: true,
        createdAt: new Date(context.now).toISOString(),
      });

      return ok(updated);
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function toPrerequisiteMap(
  outcomes: readonly LearningOutcome[],
): ReadonlyMap<string, readonly string[]> {
  return new Map(outcomes.map((outcome) => [outcome.id, outcome.prerequisiteIds] as const));
}

/** Değişiklik uygulanmış hâliyle grafiği kurar — "kaydedilirse ne olur" sorusunu yanıtlar. */
function prerequisiteMap(
  db: FakeDb,
  outcomeId: string,
  prerequisiteIds: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>(
    db
      .collection('outcomes')
      .all()
      .map((outcome) => [outcome.id, outcome.prerequisiteIds]),
  );
  map.set(outcomeId, prerequisiteIds);
  return map;
}

/**
 * BR-01: Döngü oluşturacak önkoşul kaydedilmez.
 * Hata mesajı döngü yolunu kazanım KODLARIYLA gösterir — kullanıcı hangi zincirin
 * sorun çıkardığını doğrudan görür.
 */
function assertNoCycle(
  context: MockContext,
  outcomeId: string,
  prerequisiteIds: readonly string[],
): void {
  const outcomes = context.db.collection('outcomes');
  const graph = prerequisiteMap(context.db, outcomeId, prerequisiteIds);

  for (const candidate of prerequisiteIds) {
    const path = findCyclePath(graph, outcomeId, candidate);
    if (!path) continue;

    const readable = path.map((id) => outcomes.findById(id)?.code ?? id).join(' → ');
    throw businessRule(
      `Önkoşul döngüsü oluşuyor: ${readable}. Bir kazanım doğrudan veya dolaylı olarak kendi önkoşulu olamaz.`,
      { cyclePath: path },
    );
  }
}

/** Kazanım grafiğini kurar; döngüye dâhil kenarları işaretler. */
function buildGraph(db: FakeDb, outcomes: readonly LearningOutcome[]): OutcomeGraph {
  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome] as const));
  const graph = toPrerequisiteMap(outcomes);
  const courses = db.collection('courses');

  const { cycles } = detectCycles(graph);
  const cycleEdges = new Set(
    cycles.flatMap((cycle) =>
      cycle.map((id, index) => `${cycle[(index + 1) % cycle.length]}->${id}`),
    ),
  );
  const depths = computeDepths(graph);

  return {
    nodes: outcomes.map((outcome) => ({
      id: outcome.id,
      code: outcome.code,
      title: outcome.title,
      level: outcome.level,
      difficulty: outcome.difficulty,
      state: outcome.state,
      courseId: outcome.courseId,
      courseCode: courses.findById(outcome.courseId)?.code ?? '',
      depth: depths.get(outcome.id) ?? 0,
      prerequisiteCount: outcome.prerequisiteIds.filter((id) => byId.has(id)).length,
      dependentCount: directDependents(graph, outcome.id).length,
    })),
    edges: outcomes.flatMap((outcome) =>
      outcome.prerequisiteIds
        .filter((prerequisiteId) => byId.has(prerequisiteId))
        .map((prerequisiteId) => ({
          from: prerequisiteId,
          to: outcome.id,
          partOfCycle: cycleEdges.has(`${prerequisiteId}->${outcome.id}`),
        })),
    ),
    cycles,
  };
}

function validate(context: MockContext, body: unknown, currentId: string | null): void {
  const outcomes = context.db.collection('outcomes');

  new FieldValidator(body as Record<string, unknown> | null)
    .text('code', 'Kazanım kodu', OUTCOME_LIMITS.code)
    .unique('code', 'Kazanım kodu', (value) =>
      outcomes
        .all()
        .some(
          (outcome) =>
            outcome.id !== currentId &&
            outcome.code.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'),
        ),
    )
    .text('title', 'Kazanım adı', OUTCOME_LIMITS.title)
    .text('description', 'Açıklama', OUTCOME_LIMITS.description, { required: false })
    .reference(
      'courseId',
      'Ders',
      (id) => context.db.collection('courses').findById(id) !== undefined,
    )
    .oneOf('level', 'Bilişsel seviye', COGNITIVE_LEVELS)
    .oneOf('difficulty', 'Zorluk', DIFFICULTIES)
    .integer('estimatedDurationMinutes', 'Tahmini süre', OUTCOME_LIMITS.estimatedDurationMinutes)
    .integer('weight', 'Ağırlık', OUTCOME_LIMITS.weight)
    .tags('tags', 'Etiket', {
      max: OUTCOME_LIMITS.tagCount.max,
      itemMax: OUTCOME_LIMITS.tag.max,
    })
    .custom(
      'prerequisiteIds',
      `En fazla ${OUTCOME_LIMITS.prerequisiteCount.max} önkoşul seçilebilir.`,
      readStringArray(body, 'prerequisiteIds').length <= OUTCOME_LIMITS.prerequisiteCount.max,
    )
    .assert();
}
