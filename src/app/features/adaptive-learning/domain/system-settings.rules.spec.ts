import { describe, expect, it } from 'vitest';

import {
  PasswordPolicy,
  SETTING_LIMITS,
  SettingsInput,
  checkPassword,
  describePolicy,
  validateSettings,
} from './system-settings.rules';

function settings(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    platformName: 'Adaptif Eğitim',
    timeZone: 'Europe/Istanbul',
    language: 'tr',
    examDurationMinutes: 60,
    autosaveSeconds: 15,
    sessionTimeoutMinutes: 30,
    passwordMinLength: 8,
    loginAttempts: 5,
    dataRetentionMonths: 24,
    exportRowLimit: 5000,
    ...overrides,
  };
}

describe('validateSettings', () => {
  it('geçerli ayarları kabul eder', () => {
    expect(validateSettings(settings())).toEqual([]);
  });

  it('kısa platform adını reddeder', () => {
    expect(validateSettings(settings({ platformName: 'AB' }))[0]?.field).toBe('platformName');
  });

  it('bilinmeyen saat dilimini reddeder', () => {
    const violations = validateSettings(settings({ timeZone: 'Mars/Olympus' }));

    expect(violations.some((violation) => violation.field === 'timeZone')).toBe(true);
  });

  it('aralık dışındaki sayıyı reddeder', () => {
    const violations = validateSettings(
      settings({ examDurationMinutes: SETTING_LIMITS.examDurationMinutes.max + 1 }),
    );

    expect(violations.some((violation) => violation.field === 'examDurationMinutes')).toBe(true);
  });

  it('ondalık sayıyı reddeder', () => {
    const violations = validateSettings(settings({ loginAttempts: 4.5 }));

    expect(violations.some((violation) => violation.field === 'loginAttempts')).toBe(true);
  });

  it('oturum zaman aşımı autosave aralığından kısa olamaz', () => {
    const violations = validateSettings(
      settings({ sessionTimeoutMinutes: 5, autosaveSeconds: 300 }),
    );

    expect(violations.some((violation) => violation.field === 'sessionTimeoutMinutes')).toBe(true);
  });

  it('tüm ihlalleri birlikte döner', () => {
    const violations = validateSettings(
      settings({ platformName: 'A', timeZone: 'yok', loginAttempts: 99 }),
    );

    expect(violations.length).toBeGreaterThanOrEqual(3);
  });
});

describe('checkPassword', () => {
  const policy: PasswordPolicy = {
    minLength: 8,
    requireNumber: true,
    requireUppercase: true,
    requireSymbol: false,
  };

  it('politikaya uyan parolada sorun bildirmez', () => {
    expect(checkPassword('Guclu123', policy)).toEqual([]);
  });

  it('eksik olan her koşulu ayrı ayrı bildirir', () => {
    const problems = checkPassword('abc', policy);

    expect(problems).toHaveLength(3);
  });

  it('Türkçe büyük harfi tanır', () => {
    expect(checkPassword('Şifre123', policy)).toEqual([]);
  });

  it('sembol koşulu kapalıyken sembol istemez', () => {
    expect(checkPassword('Parola12', policy)).toEqual([]);
  });

  it('sembol koşulu açıkken sembol arar', () => {
    const problems = checkPassword('Parola12', { ...policy, requireSymbol: true });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('sembol');
  });
});

describe('describePolicy', () => {
  it('açık olan koşulları tek cümlede toplar', () => {
    const text = describePolicy({
      minLength: 10,
      requireNumber: true,
      requireUppercase: true,
      requireSymbol: true,
    });

    expect(text).toContain('10 karakter');
    expect(text).toContain('rakam');
    expect(text).toContain('sembol');
  });

  it('kapalı koşulları yazmaz', () => {
    const text = describePolicy({
      minLength: 6,
      requireNumber: false,
      requireUppercase: false,
      requireSymbol: false,
    });

    expect(text).not.toContain('rakam');
  });
});
