import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { buildContext, RequestOptions } from './http-context';
import { PageRequest, PageResponse, toHttpParams } from './page-request';

type ParamsInput = HttpParams | Record<string, string | number | boolean>;

/**
 * HttpClient üzerine ince bir sarmalayıcı.
 *
 * Sorumluluğu (SRP): istek kurma + bağlam ayarları. Hata eşleme, retry, token ekleme
 * interceptor'ların işidir. Repository katmanı yalnızca bu sınıfı kullanır.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(url: string, params?: ParamsInput, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(url, {
      params: normalizeParams(params),
      context: buildContext({ idempotent: true, ...options }),
    });
  }

  /** Liste sorgusu — PageRequest'i query param'a çevirir. */
  getPage<T>(
    url: string,
    request: PageRequest,
    options?: RequestOptions,
  ): Observable<PageResponse<T>> {
    return this.http.get<PageResponse<T>>(url, {
      params: toHttpParams(request),
      context: buildContext({ idempotent: true, ...options }),
    });
  }

  post<T>(url: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.post<T>(url, body, { context: buildContext(options) });
  }

  put<T>(url: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.put<T>(url, body, { context: buildContext({ idempotent: true, ...options }) });
  }

  patch<T>(url: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.patch<T>(url, body, { context: buildContext(options) });
  }

  delete<T>(url: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(url, {
      context: buildContext({ idempotent: true, ...options }),
    });
  }
}

function normalizeParams(params?: ParamsInput): HttpParams | undefined {
  if (!params) return undefined;
  if (params instanceof HttpParams) return params;

  let result = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    result = result.set(key, String(value));
  }
  return result;
}
