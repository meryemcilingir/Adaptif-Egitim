import { Permission, Role } from '../../../core/auth/permission.model';
import { AppIconName } from '../../../shared/icons/app-icons';
import { NotificationAudience } from '../../adaptive-learning/domain/notification-targeting';
import { TimeSeriesPoint } from '../../adaptive-learning/models/analytics.model';

/**
 * Yönetim paneli sözleşmeleri (Sprint 9).
 *
 * Tüm yönetim ekranları bu dosyadan beslenir. Rol tanımı burada DEĞİL
 * `core/auth/role-definition.ts` içindedir: izin sistemi çekirdeğe aittir ve
 * guard'lar da onu okur; yönetim özelliği kaldırılsa bile orada durmalıdır.
 */

/* ── Yönetim panosu (§1, §14) ────────────────────────────────────────────── */

export interface AdminMetric {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Sayısal olmayan gösterimler için ("Sağlıklı", "%78"). */
  readonly display: string | null;
  readonly caption: string;
  readonly icon: AppIconName;
  readonly link: string | null;
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
}

export const HEALTH_STATES = ['healthy', 'degraded', 'down'] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export const HEALTH_STATE_LABELS: Readonly<Record<HealthState, string>> = {
  healthy: 'Sağlıklı',
  degraded: 'Yavaş',
  down: 'Kapalı',
};

/**
 * Sistem sağlığı bileşeni.
 *
 * Bu proje tarayıcıda çalışan bir mock üzerine kuruludur; gerçek bir sunucu,
 * veritabanı veya depolama YOKTUR. Değerler ölçüm değil örnektir ve ekran bunu
 * açıkça yazar — aksi hâlde yönetici gerçek bir izleme panosuna baktığını sanır.
 */
export interface HealthComponent {
  readonly key: string;
  readonly label: string;
  readonly state: HealthState;
  readonly detail: string;
  readonly icon: AppIconName;
  /** Yüzdelik gösterge (depolama gibi) — yoksa `null`. */
  readonly usagePercent: number | null;
}

export interface SystemHealth {
  readonly overall: HealthState;
  readonly components: readonly HealthComponent[];
  readonly activeSessions: number;
  readonly checkedAt: string;
  /** Verinin örnek olduğunu ekranda söyleyen not. */
  readonly sampleNote: string;
}

export interface AdminOverview {
  readonly metrics: readonly AdminMetric[];
  readonly health: SystemHealth;
  readonly userGrowth: readonly TimeSeriesPoint[];
  readonly loginActivity: readonly TimeSeriesPoint[];
  readonly examActivity: readonly TimeSeriesPoint[];
  readonly courseActivity: readonly TimeSeriesPoint[];
  readonly questionGrowth: readonly TimeSeriesPoint[];
  readonly generatedAt: string;
}

/* ── Kullanıcı yönetimi (§2, §3) ─────────────────────────────────────────── */

/** Kullanıcı oluşturma/güncelleme gövdesi. */
export interface UserDraft {
  readonly fullName: string;
  readonly email: string;
  readonly username: string;
  readonly department: string;
  readonly title: string;
  readonly roles: readonly Role[];
  readonly primaryRole: Role;
  readonly programId: string | null;
  readonly courseIds: readonly string[];
  readonly cohortIds: readonly string[];
}

export const USER_LIMITS = {
  fullName: { min: 3, max: 80 },
  username: { min: 3, max: 40 },
  email: { max: 120 },
  department: { max: 80 },
  title: { max: 80 },
} as const;

/** Giriş denemesi kaydı (§3 Login History). */
export interface LoginEvent {
  readonly id: string;
  readonly userId: string;
  readonly at: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly success: boolean;
}

/** Kullanıcının sistemdeki izi — detay ekranındaki özet (§3). */
export interface UserActivitySummary {
  readonly examAttempts: number;
  readonly completedContents: number;
  readonly studyMinutes: number;
  readonly averageScorePercent: number | null;
  readonly lastActivityAt: string | null;
}

export interface UserAssignments {
  readonly programName: string | null;
  readonly courses: readonly { id: string; label: string }[];
  readonly cohorts: readonly { id: string; label: string }[];
}

export interface UserDetail {
  readonly user: import('../../adaptive-learning/models/user.model').User;
  readonly assignments: UserAssignments;
  readonly activity: UserActivitySummary;
  readonly logins: readonly LoginEvent[];
  readonly notifications: readonly {
    id: string;
    title: string;
    createdAt: string;
    read: boolean;
  }[];
  readonly audit: readonly import('../../../core/observability/audit.model').AuditEvent[];
  readonly locked: boolean;
}

/* ── Rol yönetimi (§4) ───────────────────────────────────────────────────── */

/** Rol satırı — tanım + o rolü taşıyan kullanıcı sayısı. */
export interface RoleRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
  readonly system: boolean;
  readonly archivedAt: string | null;
  readonly userCount: number;
  readonly updatedAt: string;
  readonly version: number;
}

export interface RoleDraft {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
}

/* ── Sistem ayarları (§6) ────────────────────────────────────────────────── */

export interface SystemSettings {
  readonly platformName: string;
  readonly logoInitials: string;
  readonly timeZone: string;
  readonly language: string;

  readonly examDurationMinutes: number;
  readonly autosaveSeconds: number;
  readonly regradeEnabled: boolean;

  readonly emailEnabled: boolean;
  readonly systemNotificationsEnabled: boolean;

  readonly sessionTimeoutMinutes: number;
  readonly passwordMinLength: number;
  readonly passwordRequireNumber: boolean;
  readonly passwordRequireUppercase: boolean;
  readonly passwordRequireSymbol: boolean;
  readonly loginAttempts: number;

  readonly dataRetentionMonths: number;
  readonly exportRowLimit: number;

  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
}

/* ── Bildirim merkezi (§7, §8) ───────────────────────────────────────────── */

export const CAMPAIGN_KINDS = [
  'system',
  'course',
  'exam',
  'announcement',
  'warning',
  'success',
] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

export const CAMPAIGN_KIND_LABELS: Readonly<Record<CampaignKind, string>> = {
  system: 'Sistem bildirimi',
  course: 'Ders bildirimi',
  exam: 'Sınav bildirimi',
  announcement: 'Duyuru',
  warning: 'Uyarı',
  success: 'Bilgilendirme',
};

export const CAMPAIGN_STATES = ['DRAFT', 'SCHEDULED', 'SENT'] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];

export const CAMPAIGN_STATE_LABELS: Readonly<Record<CampaignState, string>> = {
  DRAFT: 'Taslak',
  SCHEDULED: 'Zamanlanmış',
  SENT: 'Gönderildi',
};

export interface NotificationCampaign {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly kind: CampaignKind;
  readonly audience: NotificationAudience;
  readonly audienceValue: string | null;
  /** Ekranda gösterilen çözülmüş hedef adı ("2026-A Grubu"). */
  readonly audienceLabel: string;
  readonly state: CampaignState;
  /** Gönderim anında çözülen alıcı sayısı; taslakta `null`. */
  readonly recipientCount: number | null;
  readonly scheduledFor: string | null;
  readonly sentAt: string | null;
  readonly createdBy: string;
  readonly createdByName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  /** Teslim durumu örnektir; gerçek bir e-posta/push kanalı yoktur. */
  readonly deliveryNote: string;
}

export interface CampaignDraft {
  readonly title: string;
  readonly body: string;
  readonly kind: CampaignKind;
  readonly audience: NotificationAudience;
  readonly audienceValue: string | null;
  readonly scheduledFor: string | null;
}

/** Hedef seçilince gösterilen "kaç kişiye gidecek?" önizlemesi. */
export interface AudiencePreview {
  readonly recipientCount: number;
  readonly label: string;
}

/* ── Global arama (§13) ──────────────────────────────────────────────────── */

export const SEARCH_CATEGORIES = [
  'user',
  'program',
  'course',
  'cohort',
  'exam',
  'question',
] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export const SEARCH_CATEGORY_LABELS: Readonly<Record<SearchCategory, string>> = {
  user: 'Kullanıcılar',
  program: 'Programlar',
  course: 'Dersler',
  cohort: 'Gruplar',
  exam: 'Sınavlar',
  question: 'Sorular',
};

export const SEARCH_CATEGORY_ICONS: Readonly<Record<SearchCategory, AppIconName>> = {
  user: 'user-round',
  program: 'library',
  course: 'book-open',
  cohort: 'users',
  exam: 'file-check',
  question: 'circle-help',
};

export interface SearchHit {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly link: string;
}

export interface SearchGroup {
  readonly category: SearchCategory;
  readonly hits: readonly SearchHit[];
  /** Kaç sonuç bulundu — gösterilen `hits` kırpılmış olabilir. */
  readonly total: number;
}

export interface GlobalSearchResult {
  readonly term: string;
  readonly groups: readonly SearchGroup[];
  readonly totalHits: number;
}

/* ── Denetim kaydı (§10, §11) ────────────────────────────────────────────── */

/** Denetim satırı — kayıt + ekranda gereken türetilmiş alanlar. */
export interface AuditRow {
  readonly id: string;
  readonly action: string;
  readonly actionLabel: string;
  readonly module: string;
  readonly actorName: string;
  readonly actorRole: string;
  readonly targetLabel: string;
  readonly reason: string | null;
  readonly changeCount: number;
  readonly ipAddress: string;
  readonly success: boolean;
  readonly createdAt: string;
}
