import { Injectable } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';

import { ApiError } from '../api/api-error';

/**
 * Uygulama içi olay akışı.
 * Modüller birbirini doğrudan çağırmak yerine olay yayınlar (gevşek bağ).
 * Örnek: soru yayınlandı → audit servisi kayıt düşer, analitik önbelleği tazelenir.
 */

export interface AppEventMap {
  'auth:logged-in': { userId: string };
  'auth:logged-out': { reason: 'user' | 'expired' | 'unauthorized' };
  'auth:role-switched': { role: string };
  'entity:changed': { entity: string; id: string; action: 'created' | 'updated' | 'deleted' };
  'exam:published': { examId: string };
  'question:versioned': { questionId: string; version: number };
  'session:answer-synced': { sessionToken: string; questionId: string };
  'session:conflict': { sessionToken: string; questionId: string; serverVersion: number };
  'network:offline': Record<string, never>;
  'network:online': Record<string, never>;
  'api:error': { error: ApiError };
}

export type AppEventType = keyof AppEventMap;

export interface AppEvent<T extends AppEventType = AppEventType> {
  readonly type: T;
  readonly payload: AppEventMap[T];
  readonly at: number;
}

@Injectable({ providedIn: 'root' })
export class EventBus {
  private readonly events$ = new Subject<AppEvent>();

  /** Tüm olaylar (audit/telemetry gibi çapraz kesen ilgiler için). */
  readonly all$: Observable<AppEvent> = this.events$.asObservable();

  emit<T extends AppEventType>(type: T, payload: AppEventMap[T]): void {
    this.events$.next({ type, payload, at: Date.now() });
  }

  on<T extends AppEventType>(type: T): Observable<AppEventMap[T]> {
    return this.events$.pipe(
      filter((event): event is AppEvent<T> => event.type === type),
      map((event) => event.payload),
    );
  }
}
