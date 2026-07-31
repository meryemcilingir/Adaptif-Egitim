/**
 * Uygulamanın TEK hata sözleşmesi.
 * Component ve facade katmanları `HttpErrorResponse` tipini asla görmez;
 * error-mapping.interceptor her şeyi buraya çevirir. (ARCHITECTURE.md §6)
 */

export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'VERSION_CONFLICT'
  | 'RATE_LIMITED'
  | 'BUSINESS_RULE'
  | 'UNKNOWN';

/** Alan bazlı doğrulama hatası (form'a geri yazmak için). */
export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface ApiErrorInit {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly httpStatus: number;
  readonly correlationId?: string;
  readonly fieldErrors?: readonly FieldError[];
  /** Kurala özel ek bilgi (ör. çakışan versiyon numarası). */
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Kullanıcıya gösterilecek varsayılan mesajlar. */
const DEFAULT_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  NETWORK: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.',
  TIMEOUT: 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.',
  UNAUTHORIZED: 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.',
  FORBIDDEN: 'Bu işlem için yetkiniz bulunmuyor.',
  NOT_FOUND: 'Aradığınız kayıt bulunamadı.',
  VALIDATION: 'Girdiğiniz bilgilerde hata var. Lütfen kontrol edin.',
  VERSION_CONFLICT: 'Bu kayıt siz düzenlerken başka bir yerde değiştirildi.',
  RATE_LIMITED: 'Çok fazla istek gönderildi. Kısa bir süre sonra tekrar deneyin.',
  BUSINESS_RULE: 'İşlem iş kuralları nedeniyle tamamlanamadı.',
  UNKNOWN: 'Beklenmeyen bir hata oluştu.',
};

/** Otomatik yeniden denenebilir hata kodları. */
const RETRYABLE_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'NETWORK',
  'TIMEOUT',
  'RATE_LIMITED',
  'UNKNOWN',
]);

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly correlationId?: string;
  readonly fieldErrors: readonly FieldError[];
  readonly details: Readonly<Record<string, unknown>>;

  constructor(init: ApiErrorInit) {
    super(init.message || DEFAULT_MESSAGES[init.code]);
    this.name = 'ApiError';
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.correlationId = init.correlationId;
    this.fieldErrors = init.fieldErrors ?? [];
    this.details = init.details ?? {};
  }

  /** Retry interceptor bu bayrağa bakar; 5xx dışındaki iş hataları tekrarlanmaz. */
  get retryable(): boolean {
    return RETRYABLE_CODES.has(this.code) || this.httpStatus >= 500;
  }

  /** Kullanıcının oturumunu yenilemesi gerekiyor mu? */
  get requiresReauth(): boolean {
    return this.code === 'UNAUTHORIZED';
  }

  static of(code: ApiErrorCode, message?: string, httpStatus = 0): ApiError {
    return new ApiError({ code, message: message ?? DEFAULT_MESSAGES[code], httpStatus });
  }

  static defaultMessage(code: ApiErrorCode): string {
    return DEFAULT_MESSAGES[code];
  }
}

/** HTTP durum kodundan hata koduna eşleme. */
export function httpStatusToErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 0:
      return 'NETWORK';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 408:
      return 'TIMEOUT';
    case 409:
      return 'VERSION_CONFLICT';
    case 422:
      return 'BUSINESS_RULE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status === 400 ? 'VALIDATION' : 'UNKNOWN';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
