import { ApiErrorCode, FieldError } from '../api-error';

/**
 * Handler'ların hata üretmek için fırlattığı tip.
 * Interceptor bunu `HttpErrorResponse`'a çevirir; error-mapping.interceptor de
 * oradan `ApiError`'a. Böylece mock, gerçek bir sunucu gibi davranmış olur.
 */
export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
    readonly fieldErrors: readonly FieldError[] = [],
  ) {
    super(message);
    this.name = 'MockHttpError';
  }

  toBody(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      fieldErrors: this.fieldErrors,
    };
  }
}

export const unauthorized = (message = 'Oturum bulunamadı veya süresi dolmuş.'): MockHttpError =>
  new MockHttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (
  message = 'Bu işlem için yetkiniz bulunmuyor.',
  details: Record<string, unknown> = {},
): MockHttpError => new MockHttpError(403, 'FORBIDDEN', message, details);

export const notFound = (entity = 'Kayıt'): MockHttpError =>
  new MockHttpError(404, 'NOT_FOUND', `${entity} bulunamadı.`);

export const validation = (
  message: string,
  fieldErrors: readonly FieldError[] = [],
): MockHttpError => new MockHttpError(400, 'VALIDATION', message, {}, fieldErrors);

export const conflict = (message: string, details: Record<string, unknown> = {}): MockHttpError =>
  new MockHttpError(409, 'VERSION_CONFLICT', message, details);

export const businessRule = (
  message: string,
  details: Record<string, unknown> = {},
): MockHttpError => new MockHttpError(422, 'BUSINESS_RULE', message, details);

export const rateLimited = (): MockHttpError =>
  new MockHttpError(429, 'RATE_LIMITED', 'Çok fazla istek gönderildi. Lütfen bekleyin.');

export const serverError = (): MockHttpError =>
  new MockHttpError(500, 'UNKNOWN', 'Sunucu geçici olarak yanıt veremiyor.');
