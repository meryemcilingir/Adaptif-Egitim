import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { SessionTokenStore } from '../../auth/session-token.store';

/**
 * Oturum jetonunu ve aktif rolü her isteğe ekler.
 * Mock backend bu başlıkları okuyarak yetki ve veri kapsamı kontrolü yapar —
 * yani yetki denetimi yalnızca istemcide "buton gizleyerek" yapılmaz.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionTokenStore).session();
  if (!session) return next(request);

  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${session.token}`,
        'X-Active-Role': session.activeRole,
        'X-User-Id': session.user.id,
      },
    }),
  );
};
