import { isHttpUrl } from '../../../../../shared/utils/url.util';
import { FieldError } from '../../../api-error';
import { MockHttpError, validation } from '../../mock-errors';

/**
 * Sunucu tarafı alan doğrulaması.
 *
 * İstemcideki Reactive Form validator'ları ile AYNI sabitleri (`*_LIMITS`) kullanır;
 * böylece istemci doğrulaması atlansa bile (doğrudan API çağrısı) kurallar korunur.
 * Hatalar alan bazında toplanır ve tek seferde döner — kullanıcı tüm eksikleri
 * birden görür, tek tek denemek zorunda kalmaz.
 */
export class FieldValidator {
  private readonly errors: FieldError[] = [];

  constructor(private readonly body: Record<string, unknown> | null) {}

  private value(field: string): unknown {
    return this.body?.[field];
  }

  private add(field: string, message: string): void {
    // Alan başına ilk hata yeterlidir; arayüzde tek mesaj gösterilir.
    if (!this.errors.some((error) => error.field === field)) {
      this.errors.push({ field, message });
    }
  }

  text(
    field: string,
    label: string,
    limits: { readonly min?: number; readonly max: number },
    options: { readonly required?: boolean } = {},
  ): this {
    const raw = this.value(field);
    const text = typeof raw === 'string' ? raw.trim() : '';

    if (options.required !== false && text.length === 0) {
      this.add(field, `${label} zorunludur.`);
      return this;
    }
    if (text.length === 0) return this;

    if (limits.min !== undefined && text.length < limits.min) {
      this.add(field, `${label} en az ${limits.min} karakter olmalıdır.`);
    } else if (text.length > limits.max) {
      this.add(field, `${label} en fazla ${limits.max} karakter olabilir.`);
    }
    return this;
  }

  integer(
    field: string,
    label: string,
    limits: { readonly min: number; readonly max: number },
  ): this {
    const raw = Number(this.value(field));

    if (!Number.isFinite(raw)) {
      this.add(field, `${label} sayısal bir değer olmalıdır.`);
      return this;
    }
    if (!Number.isInteger(raw) || raw < limits.min) {
      this.add(field, `${label} en az ${limits.min} olan pozitif bir tam sayı olmalıdır.`);
    } else if (raw > limits.max) {
      this.add(field, `${label} en fazla ${limits.max} olabilir.`);
    }
    return this;
  }

  oneOf(field: string, label: string, allowed: readonly string[]): this {
    const raw = this.value(field);
    if (typeof raw !== 'string' || !allowed.includes(raw)) {
      this.add(field, `${label} geçerli bir seçenek olmalıdır.`);
    }
    return this;
  }

  reference(field: string, label: string, exists: (id: string) => boolean): this {
    const raw = this.value(field);
    if (typeof raw !== 'string' || raw.length === 0) {
      this.add(field, `${label} seçilmelidir.`);
      return this;
    }
    if (!exists(raw)) this.add(field, `Seçilen ${label.toLocaleLowerCase('tr-TR')} bulunamadı.`);
    return this;
  }

  tags(
    field: string,
    label: string,
    limits: { readonly max: number; readonly itemMax: number },
  ): this {
    const raw = this.value(field);
    if (raw === undefined || raw === null) return this;

    if (!Array.isArray(raw)) {
      this.add(field, `${label} liste biçiminde olmalıdır.`);
      return this;
    }
    if (raw.length > limits.max) {
      this.add(field, `En fazla ${limits.max} ${label.toLocaleLowerCase('tr-TR')} eklenebilir.`);
      return this;
    }

    const tooLong = raw.find(
      (tag) => typeof tag !== 'string' || tag.trim().length > limits.itemMax,
    );
    if (tooLong !== undefined) {
      this.add(
        field,
        `Her ${label.toLocaleLowerCase('tr-TR')} en fazla ${limits.itemMax} karakter olabilir.`,
      );
    }
    return this;
  }

  /**
   * Bağlantı alanı. Boş bırakılabilir (zorunlu değilse); doluysa mutlak
   * http/https adresi olmalıdır — göreli yol veya `javascript:` kabul edilmez.
   */
  url(
    field: string,
    label: string,
    limits: { readonly max: number },
    options: { readonly required?: boolean } = {},
  ): this {
    const raw = this.value(field);
    const text = typeof raw === 'string' ? raw.trim() : '';

    if (text.length === 0) {
      if (options.required) this.add(field, `${label} zorunludur.`);
      return this;
    }
    if (text.length > limits.max) {
      this.add(field, `${label} en fazla ${limits.max} karakter olabilir.`);
      return this;
    }
    if (!isHttpUrl(text)) {
      this.add(field, `${label} http:// veya https:// ile başlayan geçerli bir adres olmalıdır.`);
    }
    return this;
  }

  /** Kod/ad gibi benzersiz olması gereken alanlar için. */
  unique(field: string, label: string, isTaken: (value: string) => boolean): this {
    const raw = this.value(field);
    if (typeof raw !== 'string' || raw.trim().length === 0) return this;
    if (isTaken(raw.trim()))
      this.add(field, `Bu ${label.toLocaleLowerCase('tr-TR')} zaten kullanılıyor.`);
    return this;
  }

  custom(field: string, message: string, isValid: boolean): this {
    if (!isValid) this.add(field, message);
    return this;
  }

  get isValid(): boolean {
    return this.errors.length === 0;
  }

  /** Hata varsa 400 fırlatır; yoksa akış devam eder. */
  assert(message = 'Girdiğiniz bilgilerde hata var. Lütfen kontrol edin.'): void {
    if (this.errors.length > 0) throw validation(message, this.errors);
  }

  toError(message: string): MockHttpError {
    return validation(message, this.errors);
  }
}

/** `string` alanları güvenle okumak için — `undefined` yerine boş metin döner. */
export function readText(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === 'string' ? value.trim() : '';
}

export function readNumber(body: unknown, field: string, fallback = 0): number {
  const value = Number((body as Record<string, unknown> | null)?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

export function readStringArray(body: unknown, field: string): string[] {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
