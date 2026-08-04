import { AuditChange } from '../../../../observability/audit.model';
import { SystemSettings } from '../../../../../features/administration/models/admin.model';
import { validateSettings } from '../../../../../features/adaptive-learning/domain/system-settings.rules';
import { StoredSettings } from '../../db/db-schema';
import { requirePermission } from '../../mock-auth';
import { conflict, notFound, validation } from '../../mock-errors';
import { MockContext, MockHandler, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';

/**
 * Sistem ayarları (Sprint 9 §6).
 *
 * Ayarlar TEK satırlık bir koleksiyondur (`id: 'settings'`). Anahtar-değer
 * çiftleri olarak saklanmadı: her ayarın kendi tipi var ve tipli bir kayıt,
 * "sessionTimeout değeri 'abc' olmuş" gibi durumları derleme zamanında keser.
 *
 * Bazı ayarlar gerçekten çalışır (oturum zaman aşımı, parola politikası, giriş
 * denemesi, autosave); e-posta gönderimi gibi olanlar örnektir ve ekran hangi
 * ayarın gerçekten etkili olduğunu açıkça yazar.
 */
export const SETTINGS_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/admin/settings',
    handle: (context) => {
      requirePermission(context, 'admin:manage');
      return ok(read(context));
    },
  },

  {
    method: 'PUT',
    path: '/api/admin/settings',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const current = read(context);
      const body = (context.body ?? {}) as Partial<SystemSettings> & { expectedVersion?: number };

      if (typeof body.expectedVersion === 'number' && body.expectedVersion !== current.version) {
        throw conflict('Ayarlar siz düzenlerken başkası tarafından değiştirildi.');
      }

      const next: StoredSettings = {
        ...current,
        platformName: (body.platformName ?? current.platformName).trim(),
        logoInitials: (body.logoInitials ?? current.logoInitials).trim().slice(0, 3).toUpperCase(),
        timeZone: body.timeZone ?? current.timeZone,
        language: body.language ?? current.language,

        examDurationMinutes: numberOr(body.examDurationMinutes, current.examDurationMinutes),
        autosaveSeconds: numberOr(body.autosaveSeconds, current.autosaveSeconds),
        regradeEnabled: body.regradeEnabled ?? current.regradeEnabled,

        emailEnabled: body.emailEnabled ?? current.emailEnabled,
        systemNotificationsEnabled:
          body.systemNotificationsEnabled ?? current.systemNotificationsEnabled,

        sessionTimeoutMinutes: numberOr(body.sessionTimeoutMinutes, current.sessionTimeoutMinutes),
        passwordMinLength: numberOr(body.passwordMinLength, current.passwordMinLength),
        passwordRequireNumber: body.passwordRequireNumber ?? current.passwordRequireNumber,
        passwordRequireUppercase: body.passwordRequireUppercase ?? current.passwordRequireUppercase,
        passwordRequireSymbol: body.passwordRequireSymbol ?? current.passwordRequireSymbol,
        loginAttempts: numberOr(body.loginAttempts, current.loginAttempts),

        dataRetentionMonths: numberOr(body.dataRetentionMonths, current.dataRetentionMonths),
        exportRowLimit: numberOr(body.exportRowLimit, current.exportRowLimit),

        updatedAt: new Date(context.now).toISOString(),
        updatedBy: caller.userId,
        version: current.version + 1,
      };

      const violations = validateSettings(next);

      if (violations.length > 0) {
        throw validation(
          'Sistem ayarları geçersiz.',
          violations.map((violation) => ({ field: violation.field, message: violation.message })),
        );
      }

      const saved = context.db.collection('systemSettings').update('settings', next)!;

      writeAudit(
        context,
        caller,
        'settings.updated',
        { type: 'SystemSettings', id: 'settings', label: saved.platformName },
        null,
        diff(current, saved),
      );

      return ok(saved);
    },
  },
];

function read(context: MockContext): StoredSettings {
  const settings = context.db.collection('systemSettings').findById('settings');
  if (!settings) throw notFound('Sistem ayarları');

  return settings;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Değişen ayarların dökümü.
 *
 * Denetim kaydına "ayarlar güncellendi" yazmak yetmez: hangi ayarın hangi
 * değerden hangi değere geçtiği, bir sorun çıktığında aranan tek bilgidir.
 */
function diff(before: StoredSettings, after: StoredSettings): readonly AuditChange[] {
  const labels: Readonly<Record<string, string>> = {
    platformName: 'Platform adı',
    logoInitials: 'Logo baş harfleri',
    timeZone: 'Saat dilimi',
    language: 'Dil',
    examDurationMinutes: 'Varsayılan sınav süresi',
    autosaveSeconds: 'Otomatik kayıt aralığı',
    regradeEnabled: 'Yeniden değerlendirme',
    emailEnabled: 'E-posta gönderimi',
    systemNotificationsEnabled: 'Sistem bildirimleri',
    sessionTimeoutMinutes: 'Oturum zaman aşımı',
    passwordMinLength: 'Parola uzunluğu',
    passwordRequireNumber: 'Rakam zorunluluğu',
    passwordRequireUppercase: 'Büyük harf zorunluluğu',
    passwordRequireSymbol: 'Sembol zorunluluğu',
    loginAttempts: 'Giriş denemesi sınırı',
    dataRetentionMonths: 'Veri saklama süresi',
    exportRowLimit: 'Dışa aktarım satır sınırı',
  };

  return Object.entries(labels)
    .filter(([field]) => before[field as keyof StoredSettings] !== after[field as keyof StoredSettings])
    .map(([field, label]) => ({
      field,
      label,
      oldValue: String(before[field as keyof StoredSettings]),
      newValue: String(after[field as keyof StoredSettings]),
    }));
}
