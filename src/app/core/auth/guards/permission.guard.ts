import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';

import { AuditService } from '../../observability/audit.service';
import { PermissionService } from '../permission.service';
import { Permission, Role } from '../permission.model';

/**
 * İzin bazlı route koruması.
 *
 * `canMatch` olduğu için yetkisiz kullanıcı ilgili feature bundle'ını indirmez.
 * Reddedilen erişim denetim kaydına yazılır — "kim neye erişmeye çalıştı" izlenebilir.
 */
export function permissionGuard(...required: readonly Permission[]): CanMatchFn {
  return (route): boolean | UrlTree => {
    const permissions = inject(PermissionService);
    const router = inject(Router);

    if (permissions.canAny(required)) return true;

    inject(AuditService).recordPermissionDenied('Route', route.path ?? '', required.join(', '));

    return router.createUrlTree(['/403'], {
      queryParams: { required: required.join(','), from: route.path ?? '' },
    });
  };
}

/** Rol bazlı koruma — izin matrisiyle ifade edilemeyen özel durumlar için. */
export function roleGuard(...roles: readonly Role[]): CanMatchFn {
  return (route): boolean | UrlTree => {
    const permissions = inject(PermissionService);
    const router = inject(Router);

    if (permissions.hasAnyRole(roles)) return true;

    return router.createUrlTree(['/403'], {
      queryParams: { required: roles.join(','), from: route.path ?? '' },
    });
  };
}
