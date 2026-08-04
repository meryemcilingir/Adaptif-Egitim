import { Role } from '../../../core/auth/permission.model';

/**
 * Bildirim hedefleme (Sprint 9 §7).
 *
 * Bir kampanyanın kime gideceği SAKLANMAZ, hedef tanımından çözülür. Alıcı
 * listesi kaydedilseydi, taslak beklerken gruba katılan öğrenci bildirimi
 * alamaz; gruptan çıkan ise almaya devam ederdi. Çözümleme gönderim anında
 * yapılır.
 *
 * Saf fonksiyonlardır: hem kampanya ekranındaki "kaç kişiye gidecek?" önizlemesi
 * hem mock sunucunun gerçek gönderimi AYNI hesabı kullanır — önizlemenin
 * gönderimle uyuşmaması mümkün değildir.
 */

export const NOTIFICATION_AUDIENCES = [
  'all',
  'role',
  'program',
  'course',
  'cohort',
  'user',
] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_AUDIENCE_LABELS: Readonly<Record<NotificationAudience, string>> = {
  all: 'Tüm kullanıcılar',
  role: 'Role göre',
  program: 'Programa göre',
  course: 'Derse göre',
  cohort: 'Gruba göre',
  user: 'Tek kullanıcı',
};

export interface NotificationTarget {
  readonly audience: NotificationAudience;
  /** `all` dışındaki her hedef için gerekli — rol anahtarı, program/ders/grup/kullanıcı kimliği. */
  readonly value: string | null;
}

/** Hedeflemeye giren kullanıcı — yalnızca gereken alanlar. */
export interface TargetableUser {
  readonly id: string;
  readonly roles: readonly Role[];
  readonly programId: string | null;
  readonly courseIds: readonly string[];
  readonly cohortIds: readonly string[];
  readonly state: string;
}

/**
 * Hedefe uyan kullanıcılar.
 *
 * Arşivlenmiş kullanıcılar HİÇBİR hedefe girmez: hesabı kapatılmış kişiye
 * bildirim üretmek, okunmayacak kayıt biriktirmekten başka bir şey değildir.
 */
export function resolveRecipients(
  target: NotificationTarget,
  users: readonly TargetableUser[],
): readonly string[] {
  const active = users.filter((user) => user.state !== 'ARCHIVED');
  const value = target.value ?? '';

  switch (target.audience) {
    case 'all':
      return active.map((user) => user.id);
    case 'role':
      return active.filter((user) => user.roles.includes(value as Role)).map((user) => user.id);
    case 'program':
      return active.filter((user) => user.programId === value).map((user) => user.id);
    case 'course':
      return active.filter((user) => user.courseIds.includes(value)).map((user) => user.id);
    case 'cohort':
      return active.filter((user) => user.cohortIds.includes(value)).map((user) => user.id);
    case 'user':
      return active.filter((user) => user.id === value).map((user) => user.id);
    default:
      return [];
  }
}

export interface TargetViolation {
  readonly field: 'audience' | 'target' | 'title' | 'body';
  readonly message: string;
}

export const CAMPAIGN_LIMITS = {
  title: { min: 3, max: 100 },
  body: { max: 1000 },
} as const;

export function validateCampaign(input: {
  title: string;
  body: string;
  target: NotificationTarget;
  recipientCount: number;
}): readonly TargetViolation[] {
  const violations: TargetViolation[] = [];
  const title = input.title.trim();

  if (title.length < CAMPAIGN_LIMITS.title.min) {
    violations.push({
      field: 'title',
      message: `Başlık en az ${CAMPAIGN_LIMITS.title.min} karakter olmalıdır.`,
    });
  }
  if (title.length > CAMPAIGN_LIMITS.title.max) {
    violations.push({
      field: 'title',
      message: `Başlık en fazla ${CAMPAIGN_LIMITS.title.max} karakter olabilir.`,
    });
  }

  if (input.body.trim().length === 0) {
    violations.push({ field: 'body', message: 'Bildirim içeriği boş olamaz.' });
  }
  if (input.body.length > CAMPAIGN_LIMITS.body.max) {
    violations.push({
      field: 'body',
      message: `İçerik en fazla ${CAMPAIGN_LIMITS.body.max} karakter olabilir.`,
    });
  }

  if (input.target.audience !== 'all' && !input.target.value) {
    violations.push({ field: 'target', message: 'Hedef seçilmelidir.' });
  }

  /*
   * Alıcısı olmayan kampanya gönderilemez.
   *
   * "Gönderildi" deyip kimseye ulaşmamak, gönderim geçmişini yalancı yapar:
   * yönetici bildirimi ilettiğini sanır, kimse görmemiştir.
   */
  if (input.recipientCount === 0) {
    violations.push({
      field: 'target',
      message: 'Bu hedefe uyan aktif kullanıcı yok. Bildirim kimseye ulaşmaz.',
    });
  }

  return violations;
}
