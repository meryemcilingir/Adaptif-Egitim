import { Injectable, computed, inject } from '@angular/core';

import { AuthStore } from './auth.store';
import { DataScope } from './permission.model';

/** Bir kaydın hangi kapsama ait olduğunu tanımlayan alanlar. */
export interface ScopedRecord {
  readonly ownerId?: string | null;
  readonly courseId?: string | null;
  readonly cohortId?: string | null;
  readonly cohortIds?: readonly string[];
}

/**
 * Veri kapsamı denetimi (PROJECT_RULES.md §6).
 *
 * Sunucu (mock backend) zaten kapsam dışı kayıtları göndermez; bu servis
 * istemci tarafında ikinci savunma hattıdır: aksiyon butonlarını ve
 * detay yönlendirmelerini kapsam dışında devre dışı bırakır.
 */
@Injectable({ providedIn: 'root' })
export class DataScopeService {
  private readonly store = inject(AuthStore);

  readonly scope = this.store.scope;
  readonly isGlobal = computed(() => this.store.scope() === 'global');

  /** Repository sorgusuna eklenen kapsam parametresi. */
  readonly scopeParams = computed<Record<string, string>>(() => {
    const session = this.store.session();
    if (!session) return {};

    const scope: DataScope = session.scope;
    const params: Record<string, string> = { scope };

    switch (scope) {
      case 'own':
        params['studentId'] = session.user.id;
        break;
      case 'course':
        params['courseIds'] = session.user.courseIds.join(',');
        break;
      case 'cohort':
        params['cohortIds'] = session.user.cohortIds.join(',');
        break;
      case 'program':
        params['programId'] = session.user.programId ?? '';
        break;
      case 'global':
        break;
    }

    return params;
  });

  canAccess(record: ScopedRecord): boolean {
    const session = this.store.session();
    if (!session) return false;

    const { user, scope } = session;

    switch (scope) {
      case 'global':
      case 'program':
        return true;

      case 'course':
        return (
          (record.courseId != null && user.courseIds.includes(record.courseId)) ||
          record.ownerId === user.id
        );

      case 'cohort': {
        const cohorts = record.cohortIds ?? (record.cohortId ? [record.cohortId] : []);
        return cohorts.some((id) => user.cohortIds.includes(id));
      }

      case 'own':
        return (
          record.ownerId === user.id ||
          (record.ownerId == null &&
            (record.courseId == null || user.courseIds.includes(record.courseId)))
        );
    }
  }

  /** Öğrenci kendi analitiğini görebilir; başkasınınkini göremez. */
  canViewStudent(studentId: string): boolean {
    const session = this.store.session();
    if (!session) return false;
    return session.scope === 'own' ? session.user.id === studentId : true;
  }
}
