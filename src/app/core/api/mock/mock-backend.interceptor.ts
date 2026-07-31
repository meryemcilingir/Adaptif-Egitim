import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, delay, from, of, switchMap, throwError } from 'rxjs';

import { API_PREFIX } from '../api-endpoints';
import { FakeDb } from './db/fake-db';
import { resolveCaller } from './mock-auth';
import { MockConfig } from './mock-config';
import { MockHttpError, rateLimited, serverError } from './mock-errors';
import { MockContext, MockRouter, parsePageRequest } from './mock-router';

/**
 * Zincirin son halkası — istek ağa çıkmaz, `FakeDb` üzerinden yanıtlanır.
 *
 * Gerçek bir sunucunun davranışlarını taklit eder: gecikme, rastgele hata,
 * yetkisiz erişim, çakışma, rate limit ve offline. (ARCHITECTURE.md §4)
 *
 * Gerçek backend'e geçiş = bu interceptor'ı `app.config.ts`'ten çıkarmak.
 */

/**
 * Handler kaydı ilk istekte, DİNAMİK olarak yüklenir.
 *
 * Mock backend geliştirme amaçlı bir yedek katmandır; tüm endpoint handler'ları,
 * doğrulayıcıları ve iş kuralları başlangıç paketine girmemelidir. Dinamik import
 * bunları ayrı bir chunk'a taşır ve ilk açılış boyutunu küçültür.
 */
let routerPromise: Promise<MockRouter> | null = null;

function loadRouter(): Promise<MockRouter> {
  routerPromise ??= import('./handlers/handler-registry').then(({ MOCK_HANDLERS }) =>
    new MockRouter().register(MOCK_HANDLERS),
  );
  return routerPromise;
}

/** Endpoint başına saniyelik istek sayacı — rate limit simülasyonu. */
const requestWindow = new Map<string, number[]>();

export const mockBackendInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(MockConfig);
  const db = inject(FakeDb);

  if (!config.settings().enabled || !request.url.startsWith(API_PREFIX)) {
    return next(request);
  }

  const latency = config.nextLatency();

  return defer(() => from(respond(request, db, config))).pipe(
    delay(latency),
    switchMap((event) =>
      event instanceof HttpErrorResponse ? throwError(() => event) : of(event),
    ),
  );
};

async function respond(
  request: HttpRequest<unknown>,
  db: FakeDb,
  config: MockConfig,
): Promise<HttpEvent<unknown> | HttpErrorResponse> {
  const url = new URL(request.urlWithParams, 'http://mock.local');
  const path = url.pathname;

  // 1) Offline — ağ hatası (status 0) → ApiError.NETWORK → outbox kuyruğu
  if (config.settings().offline) {
    return new HttpErrorResponse({
      status: 0,
      statusText: 'Unknown Error',
      url: request.url,
      error: { code: 'NETWORK', message: 'Ağ bağlantısı yok.' },
    });
  }

  // 2) Rate limit
  if (exceedsRateLimit(path, config.settings().rateLimitPerSecond)) {
    return toErrorResponse(rateLimited(), request.url);
  }

  // 3) Rastgele sunucu hatası — retry davranışını göstermek için
  if (config.shouldFailRandomly()) {
    return toErrorResponse(serverError(), request.url);
  }

  const matched = (await loadRouter()).match(request.method, path);
  if (!matched) {
    return toErrorResponse(
      new MockHttpError(404, 'NOT_FOUND', `Uç nokta bulunamadı: ${request.method} ${path}`),
      request.url,
    );
  }

  const context: MockContext = {
    db,
    request,
    params: matched.params,
    query: url.searchParams,
    page: parsePageRequest(url.searchParams),
    body: request.body,
    caller: resolveCaller(request, db),
    now: Date.now(),
  };

  try {
    const result = await matched.handler.handle(context);
    return new HttpResponse({ status: result.status, body: result.body, url: request.url });
  } catch (error) {
    return toErrorResponse(error instanceof MockHttpError ? error : serverError(), request.url);
  }
}

function toErrorResponse(error: MockHttpError, url: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: error.status,
    statusText: error.code,
    url,
    error: error.toBody(),
  });
}

function exceedsRateLimit(path: string, limitPerSecond: number): boolean {
  const now = Date.now();
  const recent = (requestWindow.get(path) ?? []).filter((time) => now - time < 1000);
  recent.push(now);
  requestWindow.set(path, recent);
  return recent.length > limitPerSecond;
}
