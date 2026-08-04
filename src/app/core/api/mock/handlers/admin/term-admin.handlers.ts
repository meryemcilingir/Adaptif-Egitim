import {
  Semester,
  TermRecord,
  isEditable,
  termName,
  validateTerm,
} from '../../../../../features/adaptive-learning/domain/academic-term.rules';
import { Term } from '../../../../../features/adaptive-learning/models/common.model';
import { requirePermission } from '../../mock-auth';
import { businessRule, conflict, notFound, validation } from '../../mock-errors';
import { MockContext, MockHandler, created, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';

/**
 * Akademik dönem yönetimi (Sprint 9 §5).
 *
 * Doğrulama `domain/academic-term.rules.ts` içindedir ve İSTEMCİYLE AYNI
 * fonksiyondur. Sunucunun ayrı bir kural yazması, formun "kaydedilebilir"
 * dediği bir dönemin sunucuda reddedilmesi demek olurdu.
 */
export const TERM_ADMIN_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/admin/terms',
    handle: (context) => {
      requirePermission(context, 'admin:manage');

      return ok(
        [...context.db.collection('terms').all()].sort(
          (a, b) => Date.parse(b.startDate) - Date.parse(a.startDate),
        ),
      );
    },
  },

  {
    method: 'POST',
    path: '/api/admin/terms',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const draft = readDraft(context);

      assertValid(context, { ...draft, id: null });

      const nowIso = new Date(context.now).toISOString();

      const term: Term = {
        id: `trm_${context.now.toString(36)}`,
        name: termName(draft),
        academicYear: draft.academicYear,
        semester: draft.semester,
        startDate: draft.startDate,
        endDate: draft.endDate,
        archivedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
      };

      context.db.collection('terms').insert(term);
      writeAudit(context, caller, 'term.created', target(term), null, [
        { field: 'startDate', label: 'Başlangıç', oldValue: null, newValue: term.startDate },
        { field: 'endDate', label: 'Bitiş', oldValue: null, newValue: term.endDate },
      ]);

      return created(term);
    },
  },

  {
    method: 'PUT',
    path: '/api/admin/terms/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const existing = find(context);
      const draft = readDraft(context);

      assertVersion(context, existing);

      if (!isEditable(toRecord(existing), context.now)) {
        throw businessRule('Tamamlanmış veya arşivlenmiş dönem düzenlenemez.');
      }

      assertValid(context, { ...draft, id: existing.id });

      const updated = context.db.collection('terms').update(existing.id, {
        name: termName(draft),
        academicYear: draft.academicYear,
        semester: draft.semester,
        startDate: draft.startDate,
        endDate: draft.endDate,
        updatedAt: new Date(context.now).toISOString(),
        version: existing.version + 1,
      })!;

      writeAudit(context, caller, 'term.updated', target(updated), null, [
        {
          field: 'startDate',
          label: 'Başlangıç',
          oldValue: existing.startDate,
          newValue: updated.startDate,
        },
        { field: 'endDate', label: 'Bitiş', oldValue: existing.endDate, newValue: updated.endDate },
      ]);

      return ok(updated);
    },
  },

  {
    method: 'POST',
    path: '/api/admin/terms/:id/archive',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const term = find(context);
      const restoring = term.archivedAt !== null;

      /*
       * Derslere bağlı dönem arşivlenemez.
       *
       * Arşivlenseydi dersin dönemi "yok" olur ve takvim bilgisi kopardı;
       * bütünlük kontrolü silmede olduğu gibi burada da gereklidir.
       */
      if (!restoring) {
        const inUse = context.db.collection('courses').filter((course) => course.termId === term.id);

        if (inUse.length > 0) {
          throw businessRule(
            `Bu döneme bağlı ${inUse.length} ders var. Önce derslerin dönemini değiştirin.`,
          );
        }
      }

      const updated = context.db.collection('terms').update(term.id, {
        archivedAt: restoring ? null : new Date(context.now).toISOString(),
        updatedAt: new Date(context.now).toISOString(),
        version: term.version + 1,
      })!;

      writeAudit(context, caller, 'term.archived', target(updated), null, [
        {
          field: 'archivedAt',
          label: 'Arşiv',
          oldValue: term.archivedAt,
          newValue: updated.archivedAt,
        },
      ]);

      return ok(updated);
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function find(context: MockContext): Term {
  const term = context.db.collection('terms').findById(context.params['id'] ?? '');
  if (!term) throw notFound('Dönem');

  return term;
}

function target(term: Term) {
  return { type: 'Term', id: term.id, label: term.name };
}

function toRecord(term: Term): TermRecord {
  return {
    id: term.id,
    academicYear: term.academicYear,
    semester: term.semester,
    startDate: term.startDate,
    endDate: term.endDate,
    archivedAt: term.archivedAt,
  };
}

interface TermDraft {
  readonly academicYear: string;
  readonly semester: Semester;
  readonly startDate: string;
  readonly endDate: string;
}

function readDraft(context: MockContext): TermDraft {
  const body = (context.body ?? {}) as Partial<TermDraft>;

  return {
    academicYear: (body.academicYear ?? '').trim(),
    semester: (body.semester ?? 'FALL') as Semester,
    startDate: (body.startDate ?? '').slice(0, 10),
    endDate: (body.endDate ?? '').slice(0, 10),
  };
}

function assertValid(context: MockContext, input: TermDraft & { id: string | null }): void {
  const violations = validateTerm(
    input,
    context.db.collection('terms').all().map(toRecord),
    context.now,
  );

  if (violations.length > 0) {
    throw validation(
      'Dönem bilgileri geçersiz.',
      violations.map((violation) => ({ field: violation.field, message: violation.message })),
    );
  }
}

function assertVersion(context: MockContext, term: Term): void {
  const expected = (context.body as { expectedVersion?: number } | null)?.expectedVersion;

  if (typeof expected === 'number' && expected !== term.version) {
    throw conflict('Bu dönem siz düzenlerken başkası tarafından değiştirildi.');
  }
}
