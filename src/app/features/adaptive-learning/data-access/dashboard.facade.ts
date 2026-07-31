import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ApiError } from '../../../core/api/api-error';
import { EventBus } from '../../../core/state/event-bus';
import { DashboardStore } from '../state/dashboard.store';
import { DashboardRepository } from './dashboard.repository';

/**
 * Dashboard orkestrasyonu.
 *
 * Rol değişince veri otomatik tazelenir — kullanıcı sayfayı yenilemek zorunda kalmaz.
 * Sayfa bileşeni yalnızca bu facade'in signal'larına bağlanır.
 */
@Injectable({ providedIn: 'root' })
export class DashboardFacade {
  private readonly store = inject(DashboardStore);
  private readonly repository = inject(DashboardRepository);

  readonly snapshot = this.store.snapshot;
  readonly role = this.store.role;
  readonly status = this.store.status;
  readonly error = this.store.error;
  readonly isLoading = this.store.isLoading;
  readonly isRefreshing = this.store.isRefreshing;
  readonly hasError = this.store.hasError;

  readonly headline = this.store.headline;
  readonly subline = this.store.subline;
  readonly kpis = this.store.kpis;
  readonly quickActions = this.store.quickActions;
  readonly notifications = this.store.notifications;
  readonly recentActivity = this.store.recentActivity;
  readonly statistics = this.store.statistics;
  readonly generatedAt = this.store.generatedAt;

  constructor() {
    inject(EventBus)
      .on('auth:role-switched')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.store.reset();
        this.load();
      });
  }

  load(): void {
    this.store.setLoading();
    this.repository.load().subscribe({
      next: (snapshot) => this.store.setSnapshot(snapshot),
      error: (error: ApiError) => this.store.setError(error),
    });
  }
}
