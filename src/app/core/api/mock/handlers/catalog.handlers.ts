import { requirePermission } from '../mock-auth';
import { MockHandler, ok } from '../mock-router';

/**
 * Referans (dönem, eğitmen) uç noktaları.
 *
 * Program, ders, kazanım ve içerik CRUD'ları `handlers/catalog/` altındaki kendi
 * dosyalarındadır; burada yalnızca form ve liste ekranlarının ihtiyaç duyduğu
 * yardımcı okuma uç noktaları bulunur.
 */
export const CATALOG_HANDLERS: readonly MockHandler[] = [
  {
    /** Form açılır listeleri için: dönemler. */
    method: 'GET',
    path: '/api/terms',
    handle: (context) => {
      requirePermission(context, 'course:read');
      return ok(context.db.collection('terms').all());
    },
  },

  {
    /**
     * Form ve filtre açılır listeleri için: gruplar (cohort).
     * Öğrenci listesi taşınmaz; yalnızca seçim için gereken alanlar döner.
     */
    method: 'GET',
    path: '/api/cohorts',
    handle: (context) => {
      requirePermission(context, 'course:read');
      const programId = context.query.get('programId');

      return ok(
        context.db
          .collection('cohorts')
          .filter((cohort) => !programId || cohort.programId === programId)
          .map((cohort) => ({
            id: cohort.id,
            name: cohort.name,
            programId: cohort.programId,
            termId: cohort.termId,
            studentCount: cohort.studentIds.length,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR')),
      );
    },
  },

  {
    /**
     * Form açılır listeleri için: eğitmen ve koordinatör adayları.
     * Parola ve yönetimsel alanlar dönmez — yalnızca seçim için gereken alanlar.
     */
    method: 'GET',
    path: '/api/staff',
    handle: (context) => {
      requirePermission(context, 'course:read');
      const role = context.query.get('role');

      return ok(
        context.db
          .collection('users')
          .filter(
            (user) => user.state === 'ACTIVE' && (!role || user.roles.includes(role as never)),
          )
          .map((user) => ({
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            primaryRole: user.primaryRole,
            title: user.title,
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr-TR')),
      );
    },
  },
];
