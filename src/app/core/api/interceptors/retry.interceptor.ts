import { HttpInterceptorFn } from '@angular/common/http';
import { retry, timer, throwError } from 'rxjs';

import { ApiError } from '../api-error';
import { IDEMPOTENT, SKIP_RETRY } from '../http-context';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 4000;

/**
 * Yalnızca idempotent isteklerde ve yalnızca yeniden denenebilir hatalarda
 * exponential backoff + jitter ile tekrar dener.
 *
 * Yan etkili POST istekleri (ör. sınav gönderimi) asla tekrarlanmaz —
 * aksi hâlde çift kayıt oluşabilirdi.
 */
export const retryInterceptor: HttpInterceptorFn = (request, next) => {
  const idempotent = request.method === 'GET' || request.context.get(IDEMPOTENT);
  if (request.context.get(SKIP_RETRY) || !idempotent) {
    return next(request);
  }

  return next(request).pipe(
    retry({
      count: MAX_ATTEMPTS - 1,
      delay: (error: unknown, attempt: number) => {
        if (!(error instanceof ApiError) || !error.retryable) {
          return throwError(() => error);
        }
        return timer(backoffDelay(attempt));
      },
    }),
  );
};

/** Aynı anda hata alan isteklerin üst üste binmemesi için jitter eklenir. */
function backoffDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  return exponential + Math.random() * BASE_DELAY_MS;
}
