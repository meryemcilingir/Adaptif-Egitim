import { Injectable, inject, signal } from '@angular/core';

import { STORAGE_ADAPTER, STORAGE_KEYS } from '../storage/storage.token';
import { Session } from './session.model';

/**
 * Yalnızca oturum jetonunu tutan minik store.
 *
 * Neden ayrı? `auth.interceptor` token'a ihtiyaç duyar; `AuthStore` ise `ApiClient`
 * kullanır. İkisi doğrudan birbirine bağlansaydı dairesel bağımlılık oluşurdu.
 * (Interface Segregation — interceptor'un ihtiyacı olan tek şey token'dır.)
 */
@Injectable({ providedIn: 'root' })
export class SessionTokenStore {
  private readonly storage = inject(STORAGE_ADAPTER);
  private readonly state = signal<Session | null>(this.storage.get<Session>(STORAGE_KEYS.session));

  readonly session = this.state.asReadonly();

  get token(): string | null {
    return this.state()?.token ?? null;
  }

  get serverTimeOffsetMs(): number {
    return this.state()?.serverTimeOffsetMs ?? 0;
  }

  persist(session: Session): void {
    this.state.set(session);
    this.storage.set(STORAGE_KEYS.session, session);
  }

  clear(): void {
    this.state.set(null);
    this.storage.remove(STORAGE_KEYS.session);
  }
}
