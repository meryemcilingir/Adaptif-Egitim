import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../api/api-client';
import { API } from '../api/api-endpoints';
import { Role } from './permission.model';
import { LoginRequest, LoginResponse, Session } from './session.model';

/**
 * Auth uç noktalarının TEK sahibi.
 * Facade HTTP bilmez; yalnızca bu sınıfın döndürdüğü `Session` ile çalışır.
 */
@Injectable({ providedIn: 'root' })
export class AuthRepository {
  private readonly api = inject(ApiClient);

  login(request: LoginRequest): Observable<Session> {
    // Login isteği 401 alırsa otomatik logout tetiklenmemeli — kullanıcı zaten girişte.
    return this.api
      .post<LoginResponse>(API.auth.login, request, { skipAuthRedirect: true, skipRetry: true })
      .pipe(map((response) => response.session));
  }

  currentSession(): Observable<Session> {
    return this.api
      .get<LoginResponse>(API.auth.session, undefined, { skipAuthRedirect: true })
      .pipe(map((response) => response.session));
  }

  switchRole(role: Role): Observable<Session> {
    return this.api
      .post<LoginResponse>(API.auth.switchRole, { role })
      .pipe(map((response) => response.session));
  }

  logout(): Observable<void> {
    return this.api.post<void>(API.auth.logout, {}, { skipRetry: true });
  }

  /** Sınav sayacının referans zamanı (BR-07). */
  serverTime(): Observable<string> {
    return this.api
      .get<{ serverTime: string }>(API.auth.serverTime, undefined, { skipLoading: true })
      .pipe(map((response) => response.serverTime));
  }
}
