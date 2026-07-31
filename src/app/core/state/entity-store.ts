import { Signal, computed, signal } from '@angular/core';

import { ApiError } from '../api/api-error';
import {
  EMPTY_PAGE_REQUEST,
  PageRequest,
  PageResponse,
  SortSpec,
  countActiveFilters,
  cycleSort,
} from '../api/page-request';

export type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export interface EntitySnapshot<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface EntityStoreOptions {
  readonly initialQuery?: Partial<PageRequest>;
}

/**
 * Liste ekranlarının ortak durumunu tek yerde toplayan generic store.
 *
 * Neden kalıtım değil composition? Feature store'ları bu sınıfı MİRAS ALMAZ, İÇERİR.
 * Böylece her feature yalnızca ihtiyaç duyduğu davranışı dışa açar ve
 * `EntityStore` sözleşmesi ileride değişse bile alt sınıf kırılganlığı oluşmaz.
 * (PROJECT_RULES.md §2 — L ve I maddeleri, ADR-003)
 */
export class EntityStore<T extends { readonly id: string }> {
  private readonly itemsState = signal<readonly T[]>([]);
  private readonly totalState = signal(0);
  private readonly statusState = signal<LoadStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly queryState = signal<PageRequest>(EMPTY_PAGE_REQUEST);
  private readonly selectedIdState = signal<string | null>(null);
  private readonly mutatingIdsState = signal<ReadonlySet<string>>(new Set());

  constructor(options: EntityStoreOptions = {}) {
    if (options.initialQuery) {
      this.queryState.set({ ...EMPTY_PAGE_REQUEST, ...options.initialQuery });
    }
  }

  // ── Okuma tarafı (readonly) ────────────────────────────────────────────
  readonly items: Signal<readonly T[]> = this.itemsState.asReadonly();
  readonly total: Signal<number> = this.totalState.asReadonly();
  readonly status: Signal<LoadStatus> = this.statusState.asReadonly();
  readonly error: Signal<ApiError | null> = this.errorState.asReadonly();
  readonly query: Signal<PageRequest> = this.queryState.asReadonly();
  readonly selectedId: Signal<string | null> = this.selectedIdState.asReadonly();

  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly isRefreshing = computed(() => this.statusState() === 'refreshing');
  readonly hasError = computed(() => this.statusState() === 'error');
  readonly isEmpty = computed(
    () => this.statusState() === 'success' && this.itemsState().length === 0,
  );

  readonly activeFilterCount = computed(() => countActiveFilters(this.queryState()));
  readonly isFiltered = computed(
    () => this.activeFilterCount() > 0 || this.queryState().search.trim().length > 0,
  );

  readonly pageCount = computed(() => {
    const { size } = this.queryState();
    return size > 0 ? Math.max(1, Math.ceil(this.totalState() / size)) : 1;
  });

  readonly selected = computed(() => {
    const id = this.selectedIdState();
    return id ? (this.itemsState().find((item) => item.id === id) ?? null) : null;
  });

  /** Satır bazlı spinner/disable için — hangi kayıtlar üzerinde işlem sürüyor. */
  isMutating(id: string): boolean {
    return this.mutatingIdsState().has(id);
  }

  readonly mutatingIds = this.mutatingIdsState.asReadonly();

  // ── Yükleme yaşam döngüsü ──────────────────────────────────────────────

  /** İlk yüklemede skeleton, tazelemede mevcut veriyi koruyan ince gösterge. */
  setLoading(): void {
    this.statusState.set(this.itemsState().length > 0 ? 'refreshing' : 'loading');
    this.errorState.set(null);
  }

  setPage(response: PageResponse<T>): void {
    this.itemsState.set(response.items);
    this.totalState.set(response.total);
    this.statusState.set('success');
    this.errorState.set(null);
  }

  setError(error: ApiError): void {
    this.errorState.set(error);
    this.statusState.set('error');
  }

  reset(): void {
    this.itemsState.set([]);
    this.totalState.set(0);
    this.statusState.set('idle');
    this.errorState.set(null);
    this.selectedIdState.set(null);
  }

  // ── Sorgu ──────────────────────────────────────────────────────────────

  /** Filtre/arama değişince sayfa 1'e döner; aksi hâlde boş sayfa görülebilir. */
  patchQuery(patch: Partial<PageRequest>): void {
    this.queryState.update((current) => {
      const next: PageRequest = { ...current, ...patch };
      const resetsPage = patch.page === undefined;
      return resetsPage ? { ...next, page: 1 } : next;
    });
  }

  setFilter(key: string, value: PageRequest['filters'][string]): void {
    this.patchQuery({ filters: { ...this.queryState().filters, [key]: value } });
  }

  clearFilters(): void {
    this.patchQuery({ filters: {}, search: '' });
  }

  toggleSort(field: string): void {
    this.patchQuery({ sort: cycleSort(this.queryState().sort, field) });
  }

  setSort(sort: SortSpec | null): void {
    this.patchQuery({ sort });
  }

  goToPage(page: number): void {
    this.patchQuery({ page: Math.min(Math.max(1, page), this.pageCount()) });
  }

  select(id: string | null): void {
    this.selectedIdState.set(id);
  }

  // ── Yerel mutasyonlar ──────────────────────────────────────────────────

  upsert(entity: T): void {
    this.itemsState.update((items) => {
      const index = items.findIndex((item) => item.id === entity.id);
      if (index === -1) {
        this.totalState.update((total) => total + 1);
        return [entity, ...items];
      }
      return items.map((item, i) => (i === index ? entity : item));
    });
  }

  removeById(id: string): void {
    this.itemsState.update((items) => items.filter((item) => item.id !== id));
    this.totalState.update((total) => Math.max(0, total - 1));
  }

  /** Optimistic güncelleme — sunucu yanıtı beklenmeden UI güncellenir. */
  applyOptimistic(id: string, patch: Partial<T>): void {
    this.markMutating(id, true);
    this.itemsState.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  /** Başarılı yanıt — sunucudan dönen gerçek kayıt yazılır. */
  commit(entity: T): void {
    this.markMutating(entity.id, false);
    this.upsert(entity);
  }

  markMutating(id: string, mutating: boolean): void {
    this.mutatingIdsState.update((ids) => {
      const next = new Set(ids);
      if (mutating) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // ── Geri alma ──────────────────────────────────────────────────────────

  snapshot(): EntitySnapshot<T> {
    return { items: this.itemsState(), total: this.totalState() };
  }

  /** Optimistic işlem başarısız olduğunda çağrılır (ARCHITECTURE.md §6). */
  restore(snapshot: EntitySnapshot<T>): void {
    this.itemsState.set(snapshot.items);
    this.totalState.set(snapshot.total);
    this.mutatingIdsState.set(new Set());
    this.statusState.set('success');
  }
}
