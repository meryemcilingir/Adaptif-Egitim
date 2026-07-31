import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, of, tap, throwError } from 'rxjs';

import { ApiError } from '../api/api-error';
import { ToastStore } from '../observability/toast.store';
import { CLOCK } from '../platform/platform.tokens';
import { EventBus } from '../state/event-bus';
import { AuthRepository } from './auth.repository';
import { AuthStore } from './auth.store';
import { ROLE_LABELS, Role } from './permission.model';
import { LoginRequest, Session } from './session.model';

/**
 * Oturum akışlarının orkestrasyonu: store + repository + yönlendirme + bildirim.
 * Hesaplama yapmaz, HTTP detayı bilmez (SRP).
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly store = inject(AuthStore);
  private readonly repository = inject(AuthRepository);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastStore);
  private readonly events = inject(EventBus);
  private readonly clock = inject(CLOCK);

  readonly session = this.store.session;
  readonly user = this.store.user;
  readonly status = this.store.status;
  readonly error = this.store.error;
  readonly isAuthenticated = this.store.isAuthenticated;
  readonly isAuthenticating = this.store.isAuthenticating;
  readonly activeRole = this.store.activeRole;
  readonly activeRoleLabel = this.store.activeRoleLabel;
  readonly availableRoles = this.store.availableRoles;
  readonly canSwitchRole = this.store.canSwitchRole;

  login(request: LoginRequest, redirectTo = '/learning/dashboard'): Observable<Session> {
    this.store.startAuthenticating();

    return this.repository.login(request).pipe(
      tap((session) => {
        this.store.setSession(this.withClockSkew(session));
        this.events.emit('auth:logged-in', { userId: session.user.id });
        void this.router.navigateByUrl(redirectTo);
      }),
      catchError((error: ApiError) => {
        this.store.setError(error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Uygulama açılışında çağrılır (APP_INITIALIZER).
   * Depodaki oturum geçersizse sessizce anonim duruma düşer — hata gösterilmez.
   */
  restoreSession(): Observable<Session | null> {
    if (!this.store.hasValidStoredSession()) {
      this.store.setAnonymous();
      return of(null);
    }

    return this.repository.currentSession().pipe(
      tap((session) => this.store.setSession(this.withClockSkew(session))),
      catchError(() => {
        this.store.setAnonymous();
        return of(null);
      }),
    );
  }

  switchRole(role: Role): void {
    this.repository.switchRole(role).subscribe({
      next: (session) => {
        this.store.setSession(this.withClockSkew(session));
        this.events.emit('auth:role-switched', { role });
        this.toast.info('Rol değiştirildi', `Artık ${ROLE_LABELS[role]} olarak görüntülüyorsunuz.`);
        void this.router.navigateByUrl('/learning/dashboard');
      },
      error: (error: ApiError) => this.toast.fromApiError(error, 'Rol değiştirilemedi'),
    });
  }

  logout(reason: 'user' | 'expired' | 'unauthorized' = 'user'): void {
    const finish = (): void => {
      this.store.setAnonymous();
      this.events.emit('auth:logged-out', { reason });
      void this.router.navigate(['/auth/login']);
    };

    if (reason === 'user') {
      this.repository.logout().subscribe({ next: finish, error: finish });
      return;
    }

    finish();
    if (reason === 'expired') {
      this.toast.warning('Oturum sona erdi', 'Lütfen tekrar giriş yapın.');
    }
  }

  /**
   * Sunucu zamanı ile istemci saati arasındaki sapmayı hesaplar.
   * Sınav sayacı bu farkı kullandığı için oturum kurulurken bir kez ölçülür.
   */
  private withClockSkew(session: Session): Session {
    const offset = Date.parse(session.issuedAt) - this.clock.now();
    return { ...session, serverTimeOffsetMs: Number.isFinite(offset) ? offset : 0 };
  }
}
