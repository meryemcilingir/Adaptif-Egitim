/**
 * Sistem ayarları doğrulaması (Sprint 9 §6, §17).
 *
 * Ayarlar "serbest metin kutusu" değildir: her biri uygulamanın davranışını
 * değiştirir. Oturum zaman aşımını 0 yapmak herkesi anında dışarı atar,
 * autosave aralığını 1 saniye yapmak sunucuyu gereksiz yere döver. Sınırlar
 * bu yüzden tek yerde ve saf fonksiyonlarda durur.
 */

export const SETTING_LIMITS = {
  platformName: { min: 3, max: 100 },
  examDurationMinutes: { min: 5, max: 480 },
  autosaveSeconds: { min: 5, max: 300 },
  sessionTimeoutMinutes: { min: 5, max: 480 },
  passwordMinLength: { min: 6, max: 64 },
  loginAttempts: { min: 3, max: 10 },
  dataRetentionMonths: { min: 3, max: 120 },
  exportRowLimit: { min: 100, max: 100_000 },
} as const;

export const TIME_ZONES = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'UTC',
] as const;
export type TimeZoneOption = (typeof TIME_ZONES)[number];

export const LANGUAGES = ['tr', 'en'] as const;
export type LanguageOption = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Readonly<Record<LanguageOption, string>> = {
  tr: 'Türkçe',
  en: 'İngilizce',
};

export interface SettingsViolation {
  readonly field: string;
  readonly message: string;
}

/** Doğrulanacak ayar kümesi — modelin kendisiyle aynı şekle sahiptir. */
export interface SettingsInput {
  readonly platformName: string;
  readonly timeZone: string;
  readonly language: string;
  readonly examDurationMinutes: number;
  readonly autosaveSeconds: number;
  readonly sessionTimeoutMinutes: number;
  readonly passwordMinLength: number;
  readonly loginAttempts: number;
  readonly dataRetentionMonths: number;
  readonly exportRowLimit: number;
}

export function validateSettings(input: SettingsInput): readonly SettingsViolation[] {
  const violations: SettingsViolation[] = [];
  const name = input.platformName.trim();

  if (name.length < SETTING_LIMITS.platformName.min) {
    violations.push({
      field: 'platformName',
      message: `Platform adı en az ${SETTING_LIMITS.platformName.min} karakter olmalıdır.`,
    });
  }
  if (name.length > SETTING_LIMITS.platformName.max) {
    violations.push({
      field: 'platformName',
      message: `Platform adı en fazla ${SETTING_LIMITS.platformName.max} karakter olabilir.`,
    });
  }

  if (!TIME_ZONES.includes(input.timeZone as TimeZoneOption)) {
    violations.push({ field: 'timeZone', message: 'Geçersiz saat dilimi.' });
  }
  if (!LANGUAGES.includes(input.language as LanguageOption)) {
    violations.push({ field: 'language', message: 'Geçersiz dil.' });
  }

  pushRange(violations, 'examDurationMinutes', input.examDurationMinutes, 'Varsayılan sınav süresi', 'dakika');
  pushRange(violations, 'autosaveSeconds', input.autosaveSeconds, 'Otomatik kayıt aralığı', 'saniye');
  pushRange(violations, 'sessionTimeoutMinutes', input.sessionTimeoutMinutes, 'Oturum zaman aşımı', 'dakika');
  pushRange(violations, 'passwordMinLength', input.passwordMinLength, 'Parola uzunluğu', 'karakter');
  pushRange(violations, 'loginAttempts', input.loginAttempts, 'Giriş denemesi', 'deneme');
  pushRange(violations, 'dataRetentionMonths', input.dataRetentionMonths, 'Veri saklama süresi', 'ay');
  pushRange(violations, 'exportRowLimit', input.exportRowLimit, 'Dışa aktarım satır sınırı', 'satır');

  /*
   * Oturum zaman aşımı, otomatik kayıt aralığından kısa olamaz.
   *
   * Olsaydı öğrenci daha ilk kaydını gönderemeden oturumu düşerdi: iki ayar tek
   * tek geçerli, birlikte tutarsız olurdu.
   */
  if (input.sessionTimeoutMinutes * 60 <= input.autosaveSeconds) {
    violations.push({
      field: 'sessionTimeoutMinutes',
      message: 'Oturum zaman aşımı, otomatik kayıt aralığından uzun olmalıdır.',
    });
  }

  return violations;
}

function pushRange(
  violations: SettingsViolation[],
  field: keyof typeof SETTING_LIMITS,
  value: number,
  label: string,
  unit: string,
): void {
  const limit = SETTING_LIMITS[field];

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    violations.push({ field, message: `${label} tam sayı olmalıdır.` });
    return;
  }

  if (value < limit.min || value > limit.max) {
    violations.push({
      field,
      message: `${label} ${limit.min}–${limit.max} ${unit} aralığında olmalıdır.`,
    });
  }
}

/* ── Parola politikası ───────────────────────────────────────────────────── */

export interface PasswordPolicy {
  readonly minLength: number;
  readonly requireNumber: boolean;
  readonly requireUppercase: boolean;
  readonly requireSymbol: boolean;
}

/**
 * Parola politikası kontrolü.
 *
 * Tüm ihlaller birlikte döner ve olumlu biçimde yazılır ("en az bir rakam
 * içermelidir"), çünkü kullanıcı parolayı düzeltirken NE eksik olduğunu
 * bilmelidir — "parola yeterince güçlü değil" hiçbir şey söylemez.
 */
export function checkPassword(password: string, policy: PasswordPolicy): readonly string[] {
  const problems: string[] = [];

  if (password.length < policy.minLength) {
    problems.push(`En az ${policy.minLength} karakter olmalıdır.`);
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    problems.push('En az bir rakam içermelidir.');
  }
  if (policy.requireUppercase && !/\p{Lu}/u.test(password)) {
    problems.push('En az bir büyük harf içermelidir.');
  }
  if (policy.requireSymbol && !/[^\p{L}\p{N}]/u.test(password)) {
    problems.push('En az bir sembol içermelidir.');
  }

  return problems;
}

/** Politikayı bir cümlede özetler — form altında ipucu olarak gösterilir. */
export function describePolicy(policy: PasswordPolicy): string {
  const parts = [`en az ${policy.minLength} karakter`];

  if (policy.requireUppercase) parts.push('bir büyük harf');
  if (policy.requireNumber) parts.push('bir rakam');
  if (policy.requireSymbol) parts.push('bir sembol');

  return `Parola ${parts.join(', ')} içermelidir.`;
}
