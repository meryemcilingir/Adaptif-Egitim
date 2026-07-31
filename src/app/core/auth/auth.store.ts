import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiError } from '../api/api-error';
import { CLOCK } from '../platform/platform.tokens';
import { Permission, ROLE_LABELS, Role, widestScope } from './permission.model';
import { SessionTokenStore } from './session-token.store';
import { Session, isSessionExpired } from './session.model';

export type AuthStatus = 'unknown' | 'authenticating' | 'authenticated' | 'anonymous';

/**
 * Oturum durumu — yalnızca state tutar, I/O yapmaz (SRP).
 * HTTP çağrıları `AuthFacade` üzerinden `AuthRepository`'ye aittir.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly tokenStore = inject(SessionTokenStore);
  private readonly clock = inject(CLOCK);

  private readonly statusState = signal<AuthStatus>('unknown');
  private readonly errorState = signal<ApiError | null>(null);

  readonly session = this.tokenStore.session;
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.statusState() === 'authenticated');
  readonly isAuthenticating = computed(() => this.statusState() === 'authenticating');

  readonly activeRole = computed<Role | null>(() => this.session()?.activeRole ?? null);
  readonly activeRoleLabel = computed(() => {
    const role = this.activeRole();
    return role ? ROLE_LABELS[role] : '';
  });

  readonly permissions = computed<readonly Permission[]>(() => this.session()?.permissions ?? []);
  readonly scope = computed(() => this.session()?.scope ?? widestScope([]));

  /** Birden fazla rolü olan kullanıcı için rol değiştirici gösterilir. */
  readonly availableRoles = computed<readonly Role[]>(() => this.session()?.user.roles ?? []);
  readonly canSwitchRole = computed(() => this.availableRoles().length > 1);

  /**
   * Sunucu ile istemci saati farkı.
   * Sınav sayacı `Date.now() + offset` kullanır; kullanıcı cihaz saatini değiştirse
   * bile kalan süre kaymaz (BR-07).
   */
  readonly serverTimeOffsetMs = computed(() => this.session()?.serverTimeOffsetMs ?? 0);

  serverNow(): number {
    return this.clock.now() + this.serverTimeOffsetMs();
  }

  startAuthenticating(): void {
    this.statusState.set('authenticating');
    this.errorState.set(null);
  }

  setSession(session: Session): void {
    this.tokenStore.persist(session);
    this.statusState.set('authenticated');
    this.errorState.set(null);
  }

  setAnonymous(error: ApiError | null = null): void {
    this.tokenStore.clear();
    this.statusState.set('anonymous');
    this.errorState.set(error);
  }

  setError(error: ApiError): void {
    this.errorState.set(error);
    this.statusState.set('anonymous');
  }

  /** Uygulama açılışında depodaki oturumun hâlâ geçerli olup olmadığını belirler. */
  hasValidStoredSession(): boolean {
    const session = this.session();
    return session !== null && !isSessionExpired(session, this.clock.now());
  }
}
