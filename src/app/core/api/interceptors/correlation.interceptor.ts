import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { ID_GENERATOR } from '../../platform/platform.tokens';

/**
 * Her isteğe izlenebilir bir kimlik ekler.
 * Hata ekranında bu kimlik gösterilir; kullanıcı destek talebinde kullanabilir.
 */
export const correlationInterceptor: HttpInterceptorFn = (request, next) => {
  const correlationId = inject(ID_GENERATOR).next('req');
  return next(request.clone({ setHeaders: { 'X-Correlation-Id': correlationId } }));
};
