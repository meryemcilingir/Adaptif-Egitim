import { Injectable, computed, signal } from '@angular/core';

import { ApiError } from '../../../core/api/api-error';
import { LoadStatus } from '../../../core/state/entity-store';
import { DashboardSnapshot } from '../models/dashboard.model';

/**
 * Dashboard durumu.
 *
 * Payload rol bazlı bir birleşim (union) olduğu için store içinde role özgü
 * türetim YAPILMAZ — aksi hâlde her yeni rol bu dosyayı büyütürdü. Ortak
 * bloklar burada, role özgü görünüm dönüşümleri ilgili rol bileşeninde çözülür.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly snapshotState = signal<DashboardSnapshot | null>(null);
  private readonly statusState = signal<LoadStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly snapshot = this.snapshotState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** İlk yüklemede iskelet, tazelemede mevcut veri korunur. */
  readonly isLoading = computed(
    () => this.statusState() === 'loading' && this.snapshotState() === null,
  );
  readonly isRefreshing = computed(() => this.statusState() === 'refreshing');
  readonly hasError = computed(() => this.statusState() === 'error');

  /* ── Tüm rollerde ortak bloklar ──────────────────────────────────────── */
  readonly role = computed(() => this.snapshotState()?.role ?? null);
  readonly headline = computed(() => this.snapshotState()?.headline ?? '');
  readonly subline = computed(() => this.snapshotState()?.subline ?? '');
  readonly kpis = computed(() => this.snapshotState()?.kpis ?? []);
  readonly quickActions = computed(() => this.snapshotState()?.quickActions ?? []);
  readonly notifications = computed(() => this.snapshotState()?.notifications ?? []);
  readonly recentActivity = computed(() => this.snapshotState()?.recentActivity ?? []);
  readonly statistics = computed(() => this.snapshotState()?.statistics ?? []);
  readonly generatedAt = computed(() => this.snapshotState()?.generatedAt ?? null);

  setLoading(): void {
    this.statusState.set(this.snapshotState() === null ? 'loading' : 'refreshing');
    this.errorState.set(null);
  }

  setSnapshot(snapshot: DashboardSnapshot): void {
    this.snapshotState.set(snapshot);
    this.statusState.set('success');
    this.errorState.set(null);
  }

  setError(error: ApiError): void {
    this.errorState.set(error);
    this.statusState.set('error');
  }

  reset(): void {
    this.snapshotState.set(null);
    this.statusState.set('idle');
    this.errorState.set(null);
  }
}
