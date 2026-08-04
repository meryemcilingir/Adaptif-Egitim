import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiError } from '../../../core/api/api-error';
import { FilterValue } from '../../../core/api/page-request';
import { EntityStore } from '../../../core/state/entity-store';
import { AUDIT_ACTION_LABELS, AuditEvent, auditModuleOf } from '../../../core/observability/audit.model';
import { AuditRow } from '../models/admin.model';
import { AdminRepository } from './admin.repository';
import { LoadState } from './user-admin.facade';

/** Zaman çizelgesindeki bir gün. */
export interface TimelineDay {
  readonly date: string;
  readonly events: readonly AuditEvent[];
}

/**
 * Denetim kaydı orkestrasyonu (Sprint 9 §10, §11).
 *
 * Liste ve zaman çizelgesi AYNI veriyi iki farklı biçimde gösterir; ikisi ayrı
 * uçlardan gelir çünkü liste sayfalanır, çizelge ise gün bazında gruplanır —
 * sayfalanmış bir çıktıyı güne bölmek, bir günün olaylarını iki sayfaya
 * dağıtırdı.
 */
@Injectable({ providedIn: 'root' })
export class AuditFacade {
  private readonly repository = inject(AdminRepository);

  private readonly store = new EntityStore<AuditEvent>({
    initialQuery: { sort: { field: 'createdAt', direction: 'desc' } },
  });

  private readonly timelineState = signal<readonly TimelineDay[]>([]);
  private readonly timelineStatusState = signal<LoadState>('idle');
  private readonly timelineErrorState = signal<ApiError | null>(null);

  readonly total = this.store.total;
  readonly status = this.store.status;
  readonly error = this.store.error;
  readonly query = this.store.query;
  readonly isFiltered = this.store.isFiltered;

  readonly timeline = this.timelineState.asReadonly();
  readonly timelineStatus = this.timelineStatusState.asReadonly();
  readonly timelineError = this.timelineErrorState.asReadonly();

  /**
   * Tabloya verilen satırlar.
   *
   * Modül ve eylem etiketi kayıtta SAKLANMAZ, eylem adından türetilir; ikinci
   * bir alan tutulsaydı yeni bir eylem eklendiğinde doldurulması unutulurdu.
   */
  readonly rows = computed<readonly AuditRow[]>(() =>
    this.store.items().map((event) => ({
      id: event.id,
      action: event.action,
      actionLabel: AUDIT_ACTION_LABELS[event.action] ?? event.action,
      module: auditModuleOf(event.action),
      actorName: event.actorName,
      actorRole: event.actorRole,
      targetLabel: event.targetLabel,
      reason: event.reason,
      changeCount: event.changes.length,
      ipAddress: event.ipAddress,
      success: event.success,
      createdAt: event.createdAt,
    })),
  );

  load(): void {
    this.store.setLoading();

    this.repository.auditEvents(this.store.query()).subscribe({
      next: (page) => this.store.setPage(page),
      error: (error: ApiError) => this.store.setError(error),
    });
  }

  loadTimeline(module?: string): void {
    this.timelineStatusState.set('loading');
    this.timelineErrorState.set(null);

    this.repository.auditTimeline(60, module).subscribe({
      next: (result) => {
        this.timelineState.set(result.days);
        this.timelineStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.timelineErrorState.set(error);
        this.timelineStatusState.set('error');
      },
    });
  }

  search(term: string): void {
    this.store.patchQuery({ search: term });
    this.load();
  }

  setFilter(key: string, value: FilterValue): void {
    this.store.setFilter(key, value);
    this.load();
  }

  clearFilters(): void {
    this.store.clearFilters();
    this.load();
  }

  sort(field: string): void {
    this.store.toggleSort(field);
    this.load();
  }

  goToPage(page: number): void {
    this.store.goToPage(page);
    this.load();
  }

  setPageSize(size: number): void {
    this.store.patchQuery({ size });
    this.load();
  }

  /** Ham kayıt — satır genişletildiğinde eski/yeni değer farkı için. */
  eventById(id: string): AuditEvent | null {
    return this.store.items().find((event) => event.id === id) ?? null;
  }
}
