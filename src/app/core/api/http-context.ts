import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * İstek başına interceptor davranışını ayarlayan bağlam anahtarları.
 * Böylece interceptor'lar URL string'i tahmin etmek yerine açık sözleşmeyle çalışır.
 */

/** Retry interceptor bu isteği yeniden denemesin (yan etkili POST vb.). */
export const SKIP_RETRY = new HttpContextToken<boolean>(() => false);

/** İstek idempotent — GET olmasa bile yeniden denenebilir. */
export const IDEMPOTENT = new HttpContextToken<boolean>(() => false);

/** Global loading göstergesine sayılmasın (autosave, polling, telemetry). */
export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

/** 401 alındığında otomatik logout tetiklenmesin (login isteğinin kendisi). */
export const SKIP_AUTH_REDIRECT = new HttpContextToken<boolean>(() => false);

export interface RequestOptions {
  readonly skipRetry?: boolean;
  readonly idempotent?: boolean;
  readonly skipLoading?: boolean;
  readonly skipAuthRedirect?: boolean;
}

export function buildContext(options: RequestOptions = {}): HttpContext {
  const context = new HttpContext();
  if (options.skipRetry !== undefined) context.set(SKIP_RETRY, options.skipRetry);
  if (options.idempotent !== undefined) context.set(IDEMPOTENT, options.idempotent);
  if (options.skipLoading !== undefined) context.set(SKIP_LOADING, options.skipLoading);
  if (options.skipAuthRedirect !== undefined) {
    context.set(SKIP_AUTH_REDIRECT, options.skipAuthRedirect);
  }
  return context;
}
