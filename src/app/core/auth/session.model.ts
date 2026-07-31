import { DataScope, Permission, Role } from './permission.model';

export interface AuthUser {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly roles: readonly Role[];
  /** Eğitmenin sorumlu olduğu dersler (veri kapsamı için). */
  readonly courseIds: readonly string[];
  /** Gözlemcinin yetkili olduğu cohort'lar. */
  readonly cohortIds: readonly string[];
  readonly programId: string | null;
  readonly title: string;
}

export interface Session {
  readonly token: string;
  readonly user: AuthUser;
  /** Birden fazla rolü olan kullanıcının o an aktif rolü. */
  readonly activeRole: Role;
  readonly permissions: readonly Permission[];
  readonly scope: DataScope;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /**
   * Sunucu ile istemci saati arasındaki fark (ms).
   * Sınav sayacı bu değeri kullanır — istemci saati değişse bile süre kaymaz. (BR-07)
   */
  readonly serverTimeOffsetMs: number;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface LoginResponse {
  readonly session: Session;
}

export function isSessionExpired(session: Session, nowMs: number): boolean {
  return new Date(session.expiresAt).getTime() <= nowMs;
}
