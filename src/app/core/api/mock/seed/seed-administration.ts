import { Role } from '../../../auth/permission.model';
import { RoleDefinition, systemRoleSeeds } from '../../../auth/role-definition';
import {
  CampaignKind,
  LoginEvent,
  NotificationCampaign,
} from '../../../../features/administration/models/admin.model';
import { NotificationAudience } from '../../../../features/adaptive-learning/domain/notification-targeting';
import { MockUser, StoredSettings } from '../db/db-schema';
import { SeedContext } from './seed-context';
import { mockIpAddress } from '../handlers/audit-writer';

/**
 * Yönetim tohum verisi (Sprint 9).
 *
 * Roller derleme zamanı matristen türetilir (`systemRoleSeeds`); burada elle
 * ikinci bir izin listesi YAZILMAZ. Yazılsaydı iki liste zamanla ayrışır ve
 * hangisinin doğru olduğu belirsizleşirdi.
 */

export interface AdministrationSeed {
  readonly roleDefinitions: RoleDefinition[];
  readonly systemSettings: StoredSettings[];
  readonly loginEvents: LoginEvent[];
  readonly notificationCampaigns: NotificationCampaign[];
}

export function seedAdministration(ctx: SeedContext, users: readonly MockUser[]): AdministrationSeed {
  return {
    roleDefinitions: buildRoles(ctx),
    systemSettings: [buildSettings(ctx, users)],
    loginEvents: buildLoginEvents(ctx, users),
    notificationCampaigns: buildCampaigns(ctx, users),
  };
}

function buildRoles(ctx: SeedContext): RoleDefinition[] {
  return systemRoleSeeds(ctx.date(-320)).map((seed, index) => ({
    ...seed,
    id: `rol_${String(index + 1).padStart(3, '0')}`,
  }));
}

function buildSettings(ctx: SeedContext, users: readonly MockUser[]): StoredSettings {
  const admin = users.find((user) => user.roles.includes('PLATFORM_ADMIN'));

  return {
    id: 'settings',
    platformName: 'Adaptif Eğitim',
    logoInitials: 'AE',
    timeZone: 'Europe/Istanbul',
    language: 'tr',

    examDurationMinutes: 60,
    autosaveSeconds: 15,
    regradeEnabled: true,

    emailEnabled: false,
    systemNotificationsEnabled: true,

    sessionTimeoutMinutes: 45,
    passwordMinLength: 8,
    passwordRequireNumber: true,
    passwordRequireUppercase: true,
    passwordRequireSymbol: false,
    loginAttempts: 5,

    dataRetentionMonths: 24,
    exportRowLimit: 5000,

    updatedAt: ctx.date(-30),
    updatedBy: admin?.id ?? '',
    version: 1,
  };
}

/**
 * Giriş geçmişi.
 *
 * Başarısız denemeler de üretilir: hepsi başarılı olsaydı denetim ekranındaki
 * "başarısız giriş" filtresi hiçbir zaman sonuç göstermez ve çalışıp
 * çalışmadığı anlaşılmazdı.
 */
function buildLoginEvents(ctx: SeedContext, users: readonly MockUser[]): LoginEvent[] {
  const agents = [
    'Chrome 141 · Windows 11',
    'Safari 18 · macOS',
    'Firefox 133 · Ubuntu',
    'Chrome 141 · Android',
  ];

  const events: LoginEvent[] = [];

  for (const user of users) {
    const count = ctx.rng.int(2, 8);

    for (let index = 0; index < count; index += 1) {
      const success = ctx.rng.int(1, 10) > 2;

      events.push({
        id: ctx.id('lgn'),
        userId: user.id,
        at: ctx.pastDate(0, 45),
        ipAddress: mockIpAddress(user.id),
        userAgent: agents[ctx.rng.int(0, agents.length - 1)] ?? agents[0]!,
        success,
      });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

interface CampaignSeed {
  readonly title: string;
  readonly body: string;
  readonly kind: CampaignKind;
  readonly audience: NotificationAudience;
  readonly audienceLabel: string;
  readonly state: NotificationCampaign['state'];
}

const CAMPAIGN_SEEDS: readonly CampaignSeed[] = [
  {
    title: 'Bahar dönemi sınav takvimi yayımlandı',
    body: 'Ara sınav tarihleri ders sayfalarınızda görünür durumda. Takvimi kontrol edip çakışma varsa bölüm sekreterliğine bildirin.',
    kind: 'announcement',
    audience: 'all',
    audienceLabel: 'Tüm kullanıcılar',
    state: 'SENT',
  },
  {
    title: 'Planlı bakım: cumartesi 02:00-04:00',
    body: 'Bakım penceresinde sınav oturumu başlatılamayacaktır. Devam eden oturumlar etkilenmez; cevaplarınız kaydedilir.',
    kind: 'warning',
    audience: 'all',
    audienceLabel: 'Tüm kullanıcılar',
    state: 'SENT',
  },
  {
    title: 'Değerlendirme bekleyen açık uçlu cevaplar',
    body: 'Sınavlarınızda elle puanlanmayı bekleyen cevaplar var. Değerlendirme kuyruğundan ilerleyebilirsiniz.',
    kind: 'exam',
    audience: 'role',
    audienceLabel: 'Eğitmen',
    state: 'SENT',
  },
  {
    title: 'Yeni öneri motoru raporu hazır',
    body: 'Öneri kabul oranları güncellendi. Analitik bölümünden inceleyebilirsiniz.',
    kind: 'system',
    audience: 'role',
    audienceLabel: 'Program Yöneticisi',
    state: 'DRAFT',
  },
  {
    title: 'Dönem sonu değerlendirme anketi',
    body: 'Anket bağlantısı dönem bitiminde gönderilecektir. Katılım gönüllüdür.',
    kind: 'announcement',
    audience: 'all',
    audienceLabel: 'Tüm kullanıcılar',
    state: 'SCHEDULED',
  },
];

function buildCampaigns(ctx: SeedContext, users: readonly MockUser[]): NotificationCampaign[] {
  const admin = users.find((user) => user.roles.includes('PLATFORM_ADMIN'));
  const activeUsers = users.filter((user) => user.state !== 'ARCHIVED');

  return CAMPAIGN_SEEDS.map((seed, index) => {
    const createdAt = ctx.date(-(30 - index * 5), 10, 0);

    const recipientCount =
      seed.state === 'SENT' ? recipientEstimate(seed, activeUsers) : null;

    return {
      id: `ntc_${String(index + 1).padStart(3, '0')}`,
      title: seed.title,
      body: seed.body,
      kind: seed.kind,
      audience: seed.audience,
      audienceValue: seed.audience === 'role' ? roleKeyOf(seed.audienceLabel) : null,
      audienceLabel: seed.audienceLabel,
      state: seed.state,
      recipientCount,
      scheduledFor: seed.state === 'SCHEDULED' ? ctx.date(20, 9, 0) : null,
      sentAt: seed.state === 'SENT' ? createdAt : null,
      createdBy: admin?.id ?? '',
      createdByName: admin?.fullName ?? 'Platform Yöneticisi',
      createdAt,
      updatedAt: createdAt,
      version: 1,
      deliveryNote:
        seed.state === 'SENT'
          ? 'Uygulama içi bildirim oluşturuldu. E-posta gönderimi bu projede yapılmaz.'
          : 'Henüz gönderilmedi.',
    };
  });
}

function recipientEstimate(seed: CampaignSeed, users: readonly MockUser[]): number {
  if (seed.audience === 'all') return users.length;

  const role = roleKeyOf(seed.audienceLabel);
  return role === null ? 0 : users.filter((user) => user.roles.includes(role)).length;
}

/** Etiketten rol anahtarına — tohum verisi okunabilir kalsın diye. */
function roleKeyOf(label: string): Role | null {
  const map: Readonly<Record<string, Role>> = {
    Eğitmen: 'INSTRUCTOR',
    Öğrenci: 'STUDENT',
    'Program Yöneticisi': 'PROGRAM_MANAGER',
    'Ölçme Uzmanı': 'ASSESSMENT_SPECIALIST',
    Gözlemci: 'OBSERVER',
    'Platform Yöneticisi': 'PLATFORM_ADMIN',
  };

  return map[label] ?? null;
}
