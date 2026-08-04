import {
  GlobalSearchResult,
  SEARCH_CATEGORIES,
  SearchCategory,
  SearchGroup,
  SearchHit,
} from '../../../../../features/administration/models/admin.model';
import { FakeDb } from '../../db/fake-db';
import { MockCaller } from '../../mock-router';
import { requireCaller } from '../../mock-auth';
import { MockHandler, ok } from '../../mock-router';

/**
 * Genel arama (Sprint 9 §13).
 *
 * Sonuçlar YETKİYE göre süzülür: arama, izin kontrolünü atlamanın kestirme yolu
 * olmamalıdır. `admin:manage` izni olmayan biri kullanıcı arayamaz; soru
 * göremeyen biri soru sonucu almaz.
 *
 * Her kategori için toplayıcı bir tablo tutulur; yeni bir kategori eklemek
 * tabloya bir satır yazmaktır — arama gövdesinde `if (category === ...)`
 * dallanması yoktur (Open/Closed).
 */

/** Kategori başına gösterilen en fazla sonuç — daha fazlası paneli okunmaz kılar. */
const HITS_PER_CATEGORY = 5;

interface Collector {
  readonly permission: string | null;
  readonly collect: (db: FakeDb, needle: string) => readonly SearchHit[];
}

const COLLECTORS: Readonly<Record<SearchCategory, Collector>> = {
  user: {
    permission: 'admin:manage',
    collect: (db, needle) =>
      db
        .collection('users')
        .filter((user) => matches(needle, user.fullName, user.email, user.username, user.department))
        .map((user) => ({
          id: user.id,
          label: user.fullName,
          sublabel: `${user.email} · ${user.department}`,
          link: `/admin/users/${user.id}`,
        })),
  },

  program: {
    permission: 'course:read',
    collect: (db, needle) =>
      db
        .collection('programs')
        .filter((program) => matches(needle, program.code, program.name))
        .map((program) => ({
          id: program.id,
          label: program.name,
          sublabel: program.code,
          link: `/programs/${program.id}`,
        })),
  },

  course: {
    permission: 'course:read',
    collect: (db, needle) =>
      db
        .collection('courses')
        .filter((course) => matches(needle, course.code, course.name))
        .map((course) => ({
          id: course.id,
          label: course.name,
          sublabel: course.code,
          link: `/courses/${course.id}`,
        })),
  },

  cohort: {
    permission: 'course:read',
    collect: (db, needle) =>
      db
        .collection('cohorts')
        .filter((cohort) => matches(needle, cohort.name))
        .map((cohort) => ({
          id: cohort.id,
          label: cohort.name,
          sublabel: `${cohort.studentIds.length} öğrenci`,
          link: '/cohort-analytics',
        })),
  },

  exam: {
    permission: 'exam:read',
    collect: (db, needle) =>
      db
        .collection('exams')
        .filter((exam) => matches(needle, exam.title))
        .map((exam) => ({
          id: exam.id,
          label: exam.title,
          sublabel: exam.state,
          link: `/exams/${exam.id}`,
        })),
  },

  question: {
    permission: 'question:read',
    collect: (db, needle) =>
      db
        .collection('questions')
        .filter((question) => question.deletedAt === null && matches(needle, question.stem))
        .map((question) => ({
          id: question.id,
          label: stripHtml(question.stem).slice(0, 90),
          sublabel: question.type,
          link: `/question-bank/${question.id}`,
        })),
  },
};

export const SEARCH_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/admin/search',
    handle: (context) => {
      const caller = requireCaller(context);
      const term = (context.query.get('q') ?? '').trim();

      // Tek harflik aramalar neredeyse her kaydı döndürür; anlamlı değildir.
      if (term.length < 2) {
        const empty: GlobalSearchResult = { term, groups: [], totalHits: 0 };
        return ok(empty);
      }

      const needle = term.toLocaleLowerCase('tr-TR');
      const groups: SearchGroup[] = [];
      let totalHits = 0;

      for (const category of SEARCH_CATEGORIES) {
        const collector = COLLECTORS[category];
        if (!allowed(caller, collector.permission)) continue;

        const hits = collector.collect(context.db, needle);
        if (hits.length === 0) continue;

        totalHits += hits.length;
        groups.push({
          category,
          hits: hits.slice(0, HITS_PER_CATEGORY),
          total: hits.length,
        });
      }

      const result: GlobalSearchResult = { term, groups, totalHits };
      return ok(result);
    },
  },
];

function allowed(caller: MockCaller, permission: string | null): boolean {
  return permission === null || caller.permissions.includes(permission as never);
}

function matches(needle: string, ...fields: readonly (string | null | undefined)[]): boolean {
  return fields.some(
    (field) => typeof field === 'string' && field.toLocaleLowerCase('tr-TR').includes(needle),
  );
}

/** Soru gövdesi zengin metindir; arama sonucunda etiketler gösterilmez. */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
