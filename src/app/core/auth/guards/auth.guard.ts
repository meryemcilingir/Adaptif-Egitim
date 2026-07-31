import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';

import { AuthStore } from '../auth.store';

/**
 * Oturum zorunlu.
 *
 * `canActivate` yerine `canMatch` kullanılır: yetkisiz kullanıcı feature
 * bundle'ını İNDİRMEDEN engellenir (ADR-007).
 */
export const authGuard: CanMatchFn = (_route, segments): boolean | UrlTree => {
  const store = inject(AuthStore);
  const router = inject(Router);

  if (store.isAuthenticated() || store.hasValidStoredSession()) return true;

  const returnUrl = `/${segments.map((segment) => segment.path).join('/')}`;
  return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl } });
};

/** Giriş yapmış kullanıcıyı login sayfasından uzak tutar. */
export const anonymousGuard: CanMatchFn = (): boolean | UrlTree => {
  const store = inject(AuthStore);
  const router = inject(Router);

  return store.isAuthenticated() ? router.createUrlTree(['/learning/dashboard']) : true;
};
