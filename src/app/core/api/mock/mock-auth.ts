import { HttpRequest } from '@angular/common/http';

import {
  DataScope,
  Permission,
  ROLE_DATA_SCOPE,
  Role,
} from '../../auth/permission.model';
import { permissionsFromDefinitions } from '../../auth/role-definition';
import { FakeDb } from './db/fake-db';
import { MockCaller, MockContext } from './mock-router';
import { forbidden, unauthorized } from './mock-errors';

/**
 * Mock backend'in kimlik ve yetki katmanı.
 *
 * Kritik nokta: izinler istemciden GELMEZ; token'dan çözülen kullanıcı için
 * sunucudaki rol tanımlarından okunur. Böylece "istemci kendi iznini
 * uydurabilir mi?" sorusu demo edilebilir biçimde kapatılmış olur.
 *
 * Rol tanımları Sprint 9'dan itibaren veritabanındadır (ADR-066): yönetici bir
 * rolün izinlerini değiştirdiğinde etki BURADAN yayılır. Tanım bulunamazsa
 * derleme zamanı varsayılanına düşülür — kullanıcı izinsiz kalmaz.
 */

export const MOCK_TOKEN_PREFIX = 'mock';

export function issueToken(userId: string, role: Role): string {
  return `${MOCK_TOKEN_PREFIX}.${userId}.${role}`;
}

export function resolveCaller(request: HttpRequest<unknown>, db: FakeDb): MockCaller | null {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const userId = token?.split('.')[1];
  if (!userId) return null;

  const account = db.collection('users').findById(userId);
  if (!account) return null;

  const requestedRole = request.headers.get('X-Active-Role') as Role | null;
  const role: Role =
    requestedRole && account.roles.includes(requestedRole) ? requestedRole : account.roles[0]!;
  const permissions = permissionsFromDefinitions([role], db.collection('roleDefinitions').all());

  return {
    userId: account.id,
    role,
    permissions,
    courseIds: account.courseIds,
    cohortIds: account.cohortIds,
    programId: account.programId,
    can: (permission: Permission) => permissions.includes(permission),
  };
}

/** Oturum zorunlu — yoksa 401. */
export function requireCaller(context: MockContext): MockCaller {
  if (!context.caller) throw unauthorized();
  return context.caller;
}

/** İzin zorunlu — yoksa 403. Handler'lar bunu ilk satırda çağırır. */
export function requirePermission(context: MockContext, permission: Permission): MockCaller {
  const caller = requireCaller(context);
  if (!caller.can(permission)) {
    throw forbidden('Bu işlem için gerekli izne sahip değilsiniz.', { permission });
  }
  return caller;
}

/**
 * Verilenlerden EN AZ BİRİ zorunlu — yoksa 403.
 *
 * Aynı ekranı birden fazla rolün farklı yetki seviyesiyle paylaştığı yerlerde
 * kullanılır (ör. akademik dönemleri Platform Yöneticisi tam yetkiyle,
 * Program Yöneticisi salt okunur görür — route guard'daki `permissionGuard`
 * ile aynı `canAny` mantığı).
 */
export function requireAnyPermission(
  context: MockContext,
  ...permissions: readonly Permission[]
): MockCaller {
  const caller = requireCaller(context);
  if (!permissions.some((permission) => caller.can(permission))) {
    throw forbidden('Bu işlem için gerekli izne sahip değilsiniz.', {
      permission: permissions.join(', '),
    });
  }
  return caller;
}

export function scopeOf(caller: MockCaller): DataScope {
  return ROLE_DATA_SCOPE[caller.role];
}

/**
 * Veri kapsamı yüklemi (PROJECT_RULES.md §6).
 * Liste handler'ları sorguyu çalıştırmadan ÖNCE bu yüklemle daraltır —
 * yetkisiz kayıt istemciye hiç ulaşmaz.
 */
export interface ScopeTarget {
  readonly ownerId?: string | null;
  readonly courseId?: string | null;
  readonly cohortId?: string | null;
  readonly cohortIds?: readonly string[];
}

export function isWithinScope(caller: MockCaller, target: ScopeTarget): boolean {
  switch (scopeOf(caller)) {
    case 'global':
    case 'program':
      return true;

    case 'course':
      // Eğitmen: sorumlu olduğu dersler + kendi kayıtları.
      return (
        (target.courseId != null && caller.courseIds.includes(target.courseId)) ||
        target.ownerId === caller.userId
      );

    case 'cohort': {
      const cohorts = target.cohortIds ?? (target.cohortId ? [target.cohortId] : []);
      return cohorts.some((id) => caller.cohortIds.includes(id));
    }

    case 'own':
      return (
        target.ownerId === caller.userId ||
        (target.ownerId == null &&
          (target.courseId == null || caller.courseIds.includes(target.courseId)))
      );
  }
}

/** Tek kayıt erişimi — kapsam dışıysa 403. */
export function assertWithinScope(caller: MockCaller, target: ScopeTarget): void {
  if (!isWithinScope(caller, target)) {
    throw forbidden('Bu kaydı görüntüleme kapsamınız dışında.');
  }
}
