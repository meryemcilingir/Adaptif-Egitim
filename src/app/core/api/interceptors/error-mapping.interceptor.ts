import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { ApiError, ApiErrorCode, FieldError, httpStatusToErrorCode } from '../api-error';

/**
 * Zincirdeki tek hata çevirici. Bu noktadan yukarısı `HttpErrorResponse` görmez.
 * (ARCHITECTURE.md §6)
 */
export const errorMappingInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof ApiError) return throwError(() => error);
      return throwError(() => toApiError(error, request.headers.get('X-Correlation-Id')));
    }),
  );

interface ServerErrorBody {
  readonly code?: string;
  readonly message?: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly details?: Record<string, unknown>;
}

function toApiError(error: unknown, correlationId: string | null): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return new ApiError({
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : ApiError.defaultMessage('UNKNOWN'),
      httpStatus: 0,
      correlationId: correlationId ?? undefined,
    });
  }

  const body = (error.error ?? {}) as ServerErrorBody;
  const code = isKnownCode(body.code) ? body.code : httpStatusToErrorCode(error.status);

  return new ApiError({
    code,
    message: body.message ?? ApiError.defaultMessage(code),
    httpStatus: error.status,
    correlationId: correlationId ?? undefined,
    fieldErrors: body.fieldErrors,
    details: body.details,
  });
}

const KNOWN_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'NETWORK',
  'TIMEOUT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'VERSION_CONFLICT',
  'RATE_LIMITED',
  'BUSINESS_RULE',
  'UNKNOWN',
]);

function isKnownCode(code: string | undefined): code is ApiErrorCode {
  return code !== undefined && KNOWN_CODES.has(code);
}
