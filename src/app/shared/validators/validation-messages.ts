import { ValidationErrors } from '@angular/forms';

/**
 * Doğrulama mesajları TEK yerde çözülür.
 * `AppFormField` bu fonksiyonu kullandığı için ekranlarda mesaj metni tekrarlanmaz.
 */
type MessageResolver = (error: unknown) => string;

const MESSAGES: Readonly<Record<string, MessageResolver>> = {
  required: () => 'Bu alan zorunludur.',
  email: () => 'Geçerli bir e-posta adresi girin.',
  minlength: (error) =>
    `En az ${(error as { requiredLength: number }).requiredLength} karakter girin.`,
  maxlength: (error) =>
    `En fazla ${(error as { requiredLength: number }).requiredLength} karakter girilebilir.`,
  min: (error) => `En küçük değer ${(error as { min: number }).min} olmalıdır.`,
  max: (error) => `En büyük değer ${(error as { max: number }).max} olmalıdır.`,
  pattern: () => 'Girilen değer beklenen biçimde değil.',

  /* Domaine özel doğrulamalar */
  prerequisiteCycle: (error) =>
    `Önkoşul döngüsü oluşuyor: ${(error as { path: string }).path}. Kazanım kendi önkoşulu olamaz.`,
  duplicateOutcomeCode: () => 'Bu kazanım kodu zaten kullanılıyor.',
  rubricLevelsNotMonotonic: () => 'Rubrik seviyelerinin puanları artan sırada olmalıdır.',
  passingScoreTooHigh: (error) =>
    `Geçme puanı toplam puandan (${(error as { maxScore: number }).maxScore}) büyük olamaz.`,
  blueprintTotalMismatch: (error) => {
    const { expected, actual } = error as { expected: number; actual: number };
    return `Soru puanları toplamı ${actual}; blueprint hedefi ${expected}.`;
  },
  reasonRequired: () => 'Bu işlem için gerekçe girilmesi zorunludur.',
  dateRangeInvalid: () => 'Bitiş tarihi başlangıç tarihinden önce olamaz.',
  httpUrl: () => 'http:// veya https:// ile başlayan geçerli bir adres girin.',
  maxTags: (error) => `En fazla ${(error as { max: number }).max} etiket eklenebilir.`,
  tagTooLong: (error) => `Her etiket en fazla ${(error as { max: number }).max} karakter olabilir.`,
};

const FALLBACK = 'Girilen değer geçersiz.';

/** İlk hatayı okunabilir mesaja çevirir; sıralama `MESSAGES` anahtar sırasına bağlı değildir. */
export function resolveValidationMessage(errors: ValidationErrors | null): string | null {
  if (!errors) return null;

  const [key, value] = Object.entries(errors)[0] ?? [];
  if (!key) return null;

  // Sunucudan gelen alan hatası doğrudan mesaj taşır.
  if (key === 'server' && typeof value === 'string') return value;

  return MESSAGES[key]?.(value) ?? FALLBACK;
}
