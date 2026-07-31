import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import { Notification, NotificationFeed } from '../models/notification.model';

/** Bildirim uç noktalarının tek sahibi. */
@Injectable({ providedIn: 'root' })
export class NotificationRepository {
  private readonly api = inject(ApiClient);

  feed(): Observable<NotificationFeed> {
    // Arka plan tazelemesi global yükleme göstergesini tetiklememeli.
    return this.api.get<NotificationFeed>(API.notifications.feed, undefined, {
      skipLoading: true,
    });
  }

  markRead(id: string): Observable<Notification> {
    return this.api.post<Notification>(API.notifications.read(id), {}, { skipLoading: true });
  }

  markAllRead(): Observable<{ unreadCount: number }> {
    return this.api.post<{ unreadCount: number }>(API.notifications.readAll, {});
  }
}
