import { AuditAction } from '../../../../observability/audit.model';
import { PublishState } from '../../../../../features/adaptive-learning/models/common.model';
import {
  PROGRAM_LIMITS,
  Program,
} from '../../../../../features/adaptive-learning/models/program.model';
import { equals, inList } from '../../db/query-engine';
import { businessRule } from '../../mock-errors';
import { MockContext, MockHandler } from '../../mock-router';
import { createCrudHandlers, diffFields } from '../crud/crud-handlers';
import { FieldValidator, readText } from '../crud/field-validator';

const TRANSITION_ACTIONS: Readonly<Record<PublishState, AuditAction>> = {
  DRAFT: 'program.restored',
  REVIEW: 'program.updated',
  PUBLISHED: 'program.published',
  ARCHIVED: 'program.archived',
};

/**
 * Program uç noktaları.
 *
 * Ortak CRUD + yayın iş akışı davranışı `createCrudHandlers`'tan gelir; burada
 * yalnızca programa ÖZGÜ olan doğrulama, kapsam ve bütünlük kuralları tanımlıdır.
 */
export const PROGRAM_HANDLERS: readonly MockHandler[] = createCrudHandlers<Program>({
  collection: 'programs',
  basePath: '/api/programs',
  entityLabel: 'Program',
  auditType: 'Program',
  permissions: {
    read: 'course:read',
    write: 'course:write',
    publish: 'course:publish',
  },

  query: () => ({
    searchable: (program: Program) => [program.code, program.name, program.description],
    filters: {
      state: inList<Program>((program) => program.state),
      coordinatorId: equals<Program>((program) => program.coordinatorId),
    },
    sorters: {
      courseCount: (program) => program.courseCount,
      outcomeCount: (program) => program.outcomeCount,
      studentCount: (program) => program.studentCount,
    },
    defaultSort: { field: 'code', direction: 'asc' },
  }),

  // Programlar kurum genelindedir; okuma izni olan herkes listeyi görebilir.
  scope: () => true,

  labelOf: (program) => `${program.code} · ${program.name}`,

  create: (context, caller) => {
    const body = context.body;
    validate(context, body, null);

    const now = new Date(context.now).toISOString();
    const actor = context.db.collection('users').findById(caller.userId);

    return {
      id: `prg_${context.now.toString(36)}`,
      code: readText(body, 'code').toLocaleUpperCase('tr-TR'),
      name: readText(body, 'name'),
      description: readText(body, 'description'),
      state: 'DRAFT',
      coordinatorId: readText(body, 'coordinatorId'),
      coordinatorName:
        context.db.collection('users').findById(readText(body, 'coordinatorId'))?.fullName ?? '',
      courseCount: 0,
      outcomeCount: 0,
      studentCount: 0,
      publishedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      createdBy: caller.userId,
      updatedBy: actor?.id ?? caller.userId,
    };
  },

  update: (existing, context, caller) => {
    const body = context.body;
    validate(context, body, existing.id);

    return {
      ...existing,
      code: readText(body, 'code').toLocaleUpperCase('tr-TR'),
      name: readText(body, 'name'),
      description: readText(body, 'description'),
      coordinatorId: readText(body, 'coordinatorId'),
      coordinatorName:
        context.db.collection('users').findById(readText(body, 'coordinatorId'))?.fullName ?? '',
      version: existing.version + 1,
      updatedAt: new Date(context.now).toISOString(),
      updatedBy: caller.userId,
    };
  },

  changesOf: (before, after) =>
    diffFields(before, after, [
      { key: 'code', label: 'Kod' },
      { key: 'name', label: 'Ad' },
      { key: 'description', label: 'Açıklama' },
      { key: 'coordinatorName', label: 'Koordinatör' },
    ]),

  assertDeletable: (program, context) => {
    const courseCount = context.db
      .collection('courses')
      .count((course) => course.programId === program.id);

    if (courseCount > 0) {
      throw businessRule(
        `Bu programa bağlı ${courseCount} ders var. Programı silmeden önce dersleri başka bir programa taşıyın veya silin.`,
        { courseCount },
      );
    }
  },

  assertPublishable: (program, context) => {
    const courseCount = context.db
      .collection('courses')
      .count((course) => course.programId === program.id);

    if (courseCount === 0) {
      throw businessRule('Ders içermeyen bir program yayınlanamaz. Önce en az bir ders ekleyin.');
    }
  },

  auditActions: {
    created: 'program.created',
    updated: 'program.updated',
    deleted: 'program.deleted',
    transition: (target) => TRANSITION_ACTIONS[target],
  },

  afterChange: (context) => recalculateProgramCounters(context),
});

/** Program sayaçlarını gerçek verilerden yeniden hesaplar (tek hesaplama noktası). */
export function recalculateProgramCounters(context: MockContext): void {
  const programs = context.db.collection('programs');
  const courses = context.db.collection('courses').all();
  const outcomes = context.db.collection('outcomes').all();
  const cohorts = context.db.collection('cohorts').all();

  for (const program of programs.all()) {
    const programCourses = courses.filter((course) => course.programId === program.id);
    const courseIds = new Set(programCourses.map((course) => course.id));
    const cohortIds = new Set(programCourses.flatMap((course) => course.cohortIds));

    programs.update(program.id, {
      courseCount: programCourses.length,
      outcomeCount: outcomes.filter((outcome) => courseIds.has(outcome.courseId)).length,
      studentCount: cohorts
        .filter((cohort) => cohortIds.has(cohort.id))
        .reduce((total, cohort) => total + cohort.studentIds.length, 0),
    });
  }
}

function validate(context: MockContext, body: unknown, currentId: string | null): void {
  const programs = context.db.collection('programs');

  new FieldValidator(body as Record<string, unknown> | null)
    .text('code', 'Program kodu', PROGRAM_LIMITS.code)
    .unique('code', 'Program kodu', (value) =>
      programs
        .all()
        .some(
          (program) =>
            program.id !== currentId &&
            program.code.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'),
        ),
    )
    .text('name', 'Program adı', PROGRAM_LIMITS.name)
    .text('description', 'Açıklama', PROGRAM_LIMITS.description, { required: false })
    .reference(
      'coordinatorId',
      'Koordinatör',
      (id) => context.db.collection('users').findById(id) !== undefined,
    )
    .assert();
}
