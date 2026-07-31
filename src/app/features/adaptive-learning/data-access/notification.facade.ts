import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ApiError } from '../../../core/api/api-error';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastStore } from '../../../core/observability/toast.store';
import { EventBus } from '../../../core/state/event-bus';
import { Notification } from '../models/notification.model';
import { NotificationRepository } from './notification.repository';

/**
 * Bildirim akışı yönetimi.
 *
 * Hem header'daki zil hem de dashboard bildirim kartı bu facade'i kullanır;
 * okundu işaretlemesi iki yerde de anında yansır (tek state kaynağı).
 */
@Injectable({ providedIn: 'root' })
export class NotificationFacade {
  private readonly repository = inject(NotificationRepository);
  private readonly auth = inject(AuthStore);
  private readonly toast = inject(ToastStore);

  private readonly itemsState = signal<readonly Notification[]>([]);
  private readonly unreadState = signal(0);
  private readonly loadingState = signal(false);

  readonly items = this.itemsState.asReadonly();
  readonly unreadCount = this.unreadState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly hasUnread = computed(() => this.unreadState() > 0);

  constructor() {
    // Oturum veya rol değişince akış yeniden yüklenir.
    const events = inject(EventBus);

    events
      .on('auth:logged-in')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load());

    events
      .on('auth:role-switched')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load());

    events
      .on('auth:logged-out')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.clear());
  }

  load(): void {
    if (!this.auth.isAuthenticated()) return;

    this.loadingState.set(true);
    this.repository.feed().subscribe({
      next: (feed) => {
        this.itemsState.set(feed.items);
        this.unreadState.set(feed.unreadCount);
        this.loadingState.set(false);
      },
      error: (error: ApiError) => {
        this.loadingState.set(false);
        // Bildirim akışı ikincil bir özelliktir; oturum hatasında sessiz kalır.
        if (error.code !== 'UNAUTHORIZED') {
          this.toast.fromApiError(error, 'Bildirimler yüklenemedi');
        }
      },
    });
  }

  /** Okundu işareti iyimser uygulanır; hata hâlinde önceki durum geri yüklenir. */
  markRead(notification: Notification): void {
    if (notification.read) return;

    const snapshot = this.itemsState();
    const previousUnread = this.unreadState();

    this.itemsState.set(
      snapshot.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );
    this.unreadState.set(Math.max(0, previousUnread - 1));

    this.repository.markRead(notification.id).subscribe({
      error: () => {
        this.itemsState.set(snapshot);
        this.unreadState.set(previousUnread);
      },
    });
  }

  markAllRead(): void {
    if (this.unreadState() === 0) return;

    const snapshot = this.itemsState();
    const previousUnread = this.unreadState();

    this.itemsState.set(snapshot.map((item) => ({ ...item, read: true })));
    this.unreadState.set(0);

    this.repository.markAllRead().subscribe({
      next: () => this.toast.success('Tüm bildirimler okundu olarak işaretlendi'),
      error: (error: ApiError) => {
        this.itemsState.set(snapshot);
        this.unreadState.set(previousUnread);
        this.toast.fromApiError(error, 'Bildirimler güncellenemedi');
      },
    });
  }

  clear(): void {
    this.itemsState.set([]);
    this.unreadState.set(0);
  }
}
