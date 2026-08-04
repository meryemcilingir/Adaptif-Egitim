import { Role } from '../../../core/auth/permission.model';
import { BaseEntity } from './common.model';

/**
 * Platform kullanıcısı.
 *
 * `AuthUser` (core/auth) oturum açmış kişinin KİMLİK bilgisidir; burası ise
 * yönetim ekranlarının listelediği/filtrelediği DOMAIN kaydıdır. İkisi bilinçli
 * olarak ayrıdır: oturum sözleşmesi değişmeden kullanıcı yönetimi genişleyebilir.
 */

export const USER_STATES = ['ACTIVE', 'INVITED', 'SUSPENDED', 'ARCHIVED'] as const;
export type UserState = (typeof USER_STATES)[number];

export const USER_STATE_LABELS: Readonly<Record<UserState, string>> = {
  ACTIVE: 'Aktif',
  INVITED: 'Davet edildi',
  SUSPENDED: 'Askıya alındı',
  ARCHIVED: 'Arşiv',
};

export interface User extends BaseEntity {
  readonly fullName: string;
  readonly email: string;
  /** Giriş adı — e-postadan türetilir ama ayrı tutulur; e-posta değişebilir. */
  readonly username: string;
  /** Bağlı olduğu birim (bölüm/fakülte). */
  readonly department: string;
  readonly avatarUrl: string | null;
  readonly roles: readonly Role[];
  readonly primaryRole: Role;
  readonly title: string;
  readonly programId: string | null;
  readonly courseIds: readonly string[];
  readonly cohortIds: readonly string[];
  readonly state: UserState;
  readonly lastLoginAt: string | null;
  /**
   * Ard arda başarısız giriş sayısı.
   *
   * Kilit AYRI bir bayrakla tutulmaz: sayaç eşiği aştığında hesap kilitlidir
   * (`isLocked()`). İki alan tutulsaydı sayaç sıfırlanıp bayrak unutulabilir
   * ve kullanıcı sebepsiz kilitli kalırdı.
   */
  readonly failedLoginCount: number;
  readonly archivedAt: string | null;
}

/** Listelerde ve seçicilerde kullanılan hafif gösterim. */
export interface UserSummary {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly primaryRole: Role;
  readonly title: string;
}

/** Hesap kilidi, sayaçtan türetilir — ayrı bir bayrak tutulmaz. */
export function isAccountLocked(user: Pick<User, 'failedLoginCount'>, maxAttempts: number): boolean {
  return user.failedLoginCount >= maxAttempts;
}

export interface UserFilters {
  readonly role: readonly string[];
  readonly state: readonly string[];
  readonly programId: string | null;
}

/** Öğrenci listelerinde gösterilen özet performans. */
export interface StudentPerformance {
  readonly studentId: string;
  readonly fullName: string;
  readonly cohortId: string;
  readonly cohortName: string;
  readonly averageMastery: number;
  readonly averageScore: number;
  readonly completedContentCount: number;
  readonly attemptCount: number;
  readonly lastActivityAt: string | null;
  /** Ortalama ustalık kritik eşiğin altındaysa true. */
  readonly atRisk: boolean;
}

export function toUserSummary(user: User): UserSummary {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    primaryRole: user.primaryRole,
    title: user.title,
  };
}
