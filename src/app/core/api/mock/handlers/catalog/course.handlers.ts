import { AuditAction } from '../../../../observability/audit.model';
import { PublishState } from '../../../../../features/adaptive-learning/models/common.model';
import {
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  COURSE_LIMITS,
  Course,
} from '../../../../../features/adaptive-learning/models/course.model';
import { equals, inList, includesId } from '../../db/query-engine';
import { businessRule } from '../../mock-errors';
import { isWithinScope } from '../../mock-auth';
import { MockContext, MockHandler } from '../../mock-router';
import { createCrudHandlers, diffFields } from '../crud/crud-handlers';
import { FieldValidator, readNumber, readText } from '../crud/field-validator';
import { recalculateProgramCounters } from './program.handlers';

const TRANSITION_ACTIONS: Readonly<Record<PublishState, AuditAction>> = {
  DRAFT: 'course.restored',
  REVIEW: 'course.updated',
  PUBLISHED: 'course.published',
  ARCHIVED: 'course.archived',
};

/** Yeni derse atanan varsayılan kart rengi paleti. */
const COURSE_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6'];

/**
 * Ders uç noktaları.
 *
 * Ortak CRUD + yayın iş akışı `createCrudHandlers`'tan gelir; burada derse özgü
 * doğrulama, veri kapsamı ve bütünlük kuralları tanımlıdır.
 */
export const COURSE_HANDLERS: readonly MockHandler[] = createCrudHandlers<Course>({
  collection: 'courses',
  basePath: '/api/courses',
  entityLabel: 'Ders',
  auditType: 'Course',
  permissions: {
    read: 'course:read',
    write: 'course:write',
    publish: 'course:publish',
  },

  query: () => ({
    searchable: (course: Course) => [
      course.code,
      course.name,
      course.description,
      course.instructorName,
    ],
    filters: {
      state: inList<Course>((course) => course.state),
      programId: equals<Course>((course) => course.programId),
      termId: equals<Course>((course) => course.termId),
      instructorId: equals<Course>((course) => course.instructorId),
      category: inList<Course>((course) => course.category),
      level: inList<Course>((course) => course.level),
      cohortId: includesId<Course>((course) => course.cohortIds),
    },
    sorters: {
      outcomeCount: (course) => course.outcomeCount,
      enrolledCount: (course) => course.enrolledCount,
      estimatedDurationHours: (course) => course.estimatedDurationHours,
    },
    defaultSort: { field: 'code', direction: 'asc' },
  }),

  scope: (caller, course) =>
    isWithinScope(caller, { courseId: course.id, cohortIds: course.cohortIds }) ||
    caller.courseIds.includes(course.id),

  labelOf: (course) => `${course.code} · ${course.name}`,

  create: (context, caller) => {
    const body = context.body;
    validate(context, body, null);

    const now = new Date(context.now).toISOString();
    const instructorId = readText(body, 'instructorId');
    const instructor = context.db.collection('users').findById(instructorId);
    const courseCount = context.db.collection('courses').count();

    return {
      id: `crs_${context.now.toString(36)}`,
      code: readText(body, 'code').toLocaleUpperCase('tr-TR'),
      name: readText(body, 'name'),
      description: readText(body, 'description'),
      programId: readText(body, 'programId'),
      termId: readText(body, 'termId'),
      instructorId,
      instructorName: instructor?.fullName ?? '',
      cohortIds: [],
      category: readText(body, 'category') as Course['category'],
      level: readText(body, 'level') as Course['level'],
      estimatedDurationHours: readNumber(body, 'estimatedDurationHours'),
      state: 'DRAFT',
      outcomeCount: 0,
      contentCount: 0,
      enrolledCount: 0,
      publishedAt: null,
      archivedAt: null,
      color: COURSE_COLORS[courseCount % COURSE_COLORS.length]!,
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

    const instructorId = readText(body, 'instructorId');
    const instructor = context.db.collection('users').findById(instructorId);

    return {
      ...existing,
      code: readText(body, 'code').toLocaleUpperCase('tr-TR'),
      name: readText(body, 'name'),
      description: readText(body, 'description'),
      programId: readText(body, 'programId'),
      termId: readText(body, 'termId'),
      instructorId,
      instructorName: instructor?.fullName ?? '',
      category: readText(body, 'category') as Course['category'],
      level: readText(body, 'level') as Course['level'],
      estimatedDurationHours: readNumber(body, 'estimatedDurationHours'),
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
      { key: 'instructorName', label: 'Eğitmen' },
      { key: 'category', label: 'Kategori' },
      { key: 'level', label: 'Seviye' },
      { key: 'estimatedDurationHours', label: 'Tahmini süre (saat)' },
      { key: 'programId', label: 'Program' },
    ]),

  assertDeletable: (course, context) => {
    const outcomeCount = context.db
      .collection('outcomes')
      .count((outcome) => outcome.courseId === course.id);

    if (outcomeCount > 0) {
      throw businessRule(
        `Bu derse bağlı ${outcomeCount} kazanım var. Dersi silmeden önce kazanımları kaldırın.`,
        { outcomeCount },
      );
    }
  },

  assertPublishable: (course, context) => {
    const published = context.db
      .collection('outcomes')
      .count((outcome) => outcome.courseId === course.id && outcome.state === 'PUBLISHED');

    if (published === 0) {
      throw businessRule(
        'Yayınlanmış kazanımı olmayan bir ders yayınlanamaz. Önce en az bir kazanımı yayına alın.',
      );
    }
  },

  auditActions: {
    created: 'course.created',
    updated: 'course.updated',
    deleted: 'course.deleted',
    transition: (target) => TRANSITION_ACTIONS[target],
  },

  afterChange: (context) => {
    recalculateCourseCounters(context);
    recalculateProgramCounters(context);
  },
});

/** Ders sayaçlarını gerçek verilerden yeniden hesaplar. */
export function recalculateCourseCounters(context: MockContext): void {
  const courses = context.db.collection('courses');
  const outcomes = context.db.collection('outcomes').all();
  const contents = context.db.collection('contents').all();
  const cohorts = context.db.collection('cohorts').all();

  for (const course of courses.all()) {
    courses.update(course.id, {
      outcomeCount: outcomes.filter((outcome) => outcome.courseId === course.id).length,
      contentCount: contents.filter((content) => content.courseId === course.id).length,
      enrolledCount: cohorts
        .filter((cohort) => course.cohortIds.includes(cohort.id))
        .reduce((total, cohort) => total + cohort.studentIds.length, 0),
    });
  }
}

function validate(context: MockContext, body: unknown, currentId: string | null): void {
  const courses = context.db.collection('courses');

  new FieldValidator(body as Record<string, unknown> | null)
    .text('code', 'Ders kodu', COURSE_LIMITS.code)
    .unique('code', 'Ders kodu', (value) =>
      courses
        .all()
        .some(
          (course) =>
            course.id !== currentId &&
            course.code.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'),
        ),
    )
    .text('name', 'Ders adı', COURSE_LIMITS.name)
    .text('description', 'Açıklama', COURSE_LIMITS.description, { required: false })
    .reference(
      'programId',
      'Program',
      (id) => context.db.collection('programs').findById(id) !== undefined,
    )
    .reference('termId', 'Dönem', (id) => context.db.collection('terms').findById(id) !== undefined)
    .reference('instructorId', 'Eğitmen', (id) => {
      const user = context.db.collection('users').findById(id);
      return user !== undefined && user.roles.includes('INSTRUCTOR');
    })
    .oneOf('category', 'Kategori', COURSE_CATEGORIES)
    .oneOf('level', 'Seviye', COURSE_LEVELS)
    .integer('estimatedDurationHours', 'Tahmini süre', COURSE_LIMITS.estimatedDurationHours)
    .assert();
}
