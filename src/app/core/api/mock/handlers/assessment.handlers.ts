import { Attempt } from '../../../../features/adaptive-learning/models/attempt.model';
import { equals, inList } from '../db/query-engine';
import { assertWithinScope, isWithinScope, requirePermission } from '../mock-auth';
import { notFound } from '../mock-errors';
import { MockHandler, ok } from '../mock-router';

/**
 * Deneme (attempt) okuma uç noktaları.
 *
 * Soru bankası ve sınav/blueprint uçları `handlers/assessment/` altındaki kendi
 * dosyalarına taşındı; burada yalnızca deneme okuması kalır.
 */
export const ASSESSMENT_HANDLERS: readonly MockHandler[] = [
  /* ── Denemeler ────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    path: '/api/attempts',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:read');

      return ok(
        context.db.collection('attempts').queryWithin(
          (attempt) =>
            isWithinScope(caller, {
              ownerId: attempt.studentId,
              courseId: attempt.courseId,
              cohortId: attempt.cohortId,
            }),
          context.page,
          {
            searchable: (attempt: Attempt) => [attempt.studentName, attempt.examTitle],
            filters: {
              examId: equals<Attempt>((attempt) => attempt.examId),
              courseId: equals<Attempt>((attempt) => attempt.courseId),
              cohortId: equals<Attempt>((attempt) => attempt.cohortId),
              studentId: equals<Attempt>((attempt) => attempt.studentId),
              state: inList<Attempt>((attempt) => attempt.state),
            },
            defaultSort: { field: 'submittedAt', direction: 'desc' },
          },
        ),
      );
    },
  },

  {
    method: 'GET',
    path: '/api/attempts/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'attempt:read');
      const attempt = context.db.collection('attempts').findById(context.params['id'] ?? '');
      if (!attempt) throw notFound('Deneme');

      assertWithinScope(caller, {
        ownerId: attempt.studentId,
        courseId: attempt.courseId,
        cohortId: attempt.cohortId,
      });
      return ok(attempt);
    },
  },
];
