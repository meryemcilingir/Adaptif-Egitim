import { Signal, computed, signal } from '@angular/core';
import { Observable, ReplaySubject, finalize } from 'rxjs';

import { ApiError } from '../api/api-error';
import { CrudRepository } from '../api/crud.repository';
import { PageRequest } from '../api/page-request';
import { ToastStore } from '../observability/toast.store';
import { PublishState } from '../../features/adaptive-learning/models/common.model';
import { EntityStore } from './entity-store';

export interface StatefulRecord {
  readonly id: string;
  readonly state: PublishState;
  readonly version: number;
}

export interface CrudLabels {
  /** "Program", "Ders", "Kazanım" — bildirim metinlerinde kullanılır. */
  readonly entity: string;
  /** Kaydın kullanıcıya gösterilecek adı. */
  readonly nameOf: (item: StatefulRecord) => string;
}

export interface CrudEngineDeps<TEntity extends StatefulRecord, TWrite> {
  readonly repository: CrudRepository<TEntity, TWrite>;
  readonly toast: ToastStore;
  readonly labels: CrudLabels;
  /** Liste sorgusunun başlangıç değerleri (varsayılan sıralama, filtreler). */
  readonly initialQuery?: Partial<PageRequest>;
  /** Kayıt değişince tetiklenir — bağlı listeleri tazelemek için. */
  readonly onChanged?: () => void;
}

/**
 * Liste + detay + yazma akışlarının ortak motoru.
 *
 * Facade'ler bu sınıfı **composition** ile kullanır (kalıtım değil): her facade
 * yalnızca kendi ek davranışını yazar, CRUD yaşam döngüsü burada tek kez tanımlıdır.
 * Bildirimler, hata yönetimi ve iyimser güncelleme/rollback de buraya aittir
 * (ARCHITECTURE.md §6).
 */
export class CrudEngine<TEntity extends StatefulRecord, TWrite> {
  private readonly store: EntityStore<TEntity>;
  private readonly detailState = signal<TEntity | null>(null);
  private readonly detailStatusState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly detailErrorState = signal<ApiError | null>(null);
  private readonly savingState = signal(false);

  constructor(private readonly deps: CrudEngineDeps<TEntity, TWrite>) {
    this.store = new EntityStore<TEntity>({ initialQuery: deps.initialQuery });
  }

  /*
   * Liste tarafı `EntityStore`'a devredilir. Alan başlatıcısı yerine getter
   * kullanılır: `store` kurucuda atandığı için alan başlatıcıları henüz çalışamaz.
   */
  get items(): Signal<readonly TEntity[]> {
    return this.store.items;
  }
  get total() {
    return this.store.total;
  }
  get status() {
    return this.store.status;
  }
  get error() {
    return this.store.error;
  }
  get query() {
    return this.store.query;
  }
  get isEmpty() {
    return this.store.isEmpty;
  }
  get isFiltered() {
    return this.store.isFiltered;
  }
  get activeFilterCount() {
    return this.store.activeFilterCount;
  }
  get mutatingIds() {
    return this.store.mutatingIds;
  }

  /* ── Detay tarafı ────────────────────────────────────────────────────── */
  readonly detail = this.detailState.asReadonly();
  readonly detailStatus = this.detailStatusState.asReadonly();
  readonly detailError = this.detailErrorState.asReadonly();
  readonly isDetailLoading = computed(() => this.detailStatusState() === 'loading');
  readonly hasDetailError = computed(() => this.detailStatusState() === 'error');
  readonly isSaving = this.savingState.asReadonly();

  /* ── Sorgu değiştiricileri ───────────────────────────────────────────── */
  setQuery(patch: Partial<PageRequest>): void {
    this.store.patchQuery(patch);
    this.load();
  }

  setSearch(search: string): void {
    this.setQuery({ search });
  }

  setFilter(key: string, value: PageRequest['filters'][string]): void {
    this.store.setFilter(key, value);
    this.load();
  }

  clearFilters(): void {
    this.store.clearFilters();
    this.load();
  }

  toggleSort(field: string): void {
    this.store.toggleSort(field);
    this.load();
  }

  goToPage(page: number): void {
    this.store.goToPage(page);
    this.load();
  }

  setPageSize(size: number): void {
    this.setQuery({ size, page: 1 });
  }

  /* ── Okuma ───────────────────────────────────────────────────────────── */
  load(): void {
    this.store.setLoading();
    this.deps.repository.list(this.store.query()).subscribe({
      next: (page) => this.store.setPage(page),
      error: (error: ApiError) => this.store.setError(error),
    });
  }

  loadDetail(id: string): void {
    this.detailStatusState.set('loading');
    this.detailErrorState.set(null);

    this.deps.repository.get(id).subscribe({
      next: (item) => {
        this.detailState.set(item);
        this.detailStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.detailErrorState.set(error);
        this.detailStatusState.set('error');
      },
    });
  }

  clearDetail(): void {
    this.detailState.set(null);
    this.detailStatusState.set('idle');
    this.detailErrorState.set(null);
  }

  /* ── Yazma ───────────────────────────────────────────────────────────── */

  /** Başarıda oluşan kaydı döndürür; hata bildirimini kendisi gösterir. */
  create(payload: TWrite): Observable<TEntity> {
    return this.run(this.deps.repository.create(payload), (item) => {
      this.store.upsert(item);
      this.detailState.set(item);
      this.deps.toast.success(
        `${this.deps.labels.entity} oluşturuldu`,
        `"${this.deps.labels.nameOf(item)}" taslak olarak kaydedildi.`,
      );
    });
  }

  update(id: string, payload: TWrite, expectedVersion: number): Observable<TEntity> {
    return this.run(this.deps.repository.update(id, payload, expectedVersion), (item) => {
      this.store.commit(item);
      this.detailState.set(item);
      this.deps.toast.success(
        `${this.deps.labels.entity} güncellendi`,
        `"${this.deps.labels.nameOf(item)}" kaydedildi.`,
      );
    });
  }

  /**
   * İyimser silme: satır listeden hemen kalkar, hata hâlinde geri gelir ve
   * kullanıcı bilgilendirilir (ARCHITECTURE.md §6).
   */
  remove(item: TEntity): Observable<void> {
    const snapshot = this.store.snapshot();
    this.store.removeById(item.id);

    return this.run(
      this.deps.repository.remove(item.id),
      () =>
        this.deps.toast.success(
          `${this.deps.labels.entity} silindi`,
          `"${this.deps.labels.nameOf(item)}" kaldırıldı.`,
        ),
      () => this.store.restore(snapshot),
      'Silme işlemi geri alındı',
    );
  }

  transition(item: TEntity, state: PublishState, reason?: string): Observable<TEntity> {
    this.store.markMutating(item.id, true);

    return this.run(
      this.deps.repository.transition(item.id, state, reason),
      (updated) => {
        this.store.commit(updated);
        if (this.detailState()?.id === updated.id) this.detailState.set(updated);
        this.deps.toast.success(
          'Durum güncellendi',
          `"${this.deps.labels.nameOf(updated)}" artık ${STATE_LABELS[state]} durumunda.`,
        );
      },
      () => this.store.markMutating(item.id, false),
    );
  }

  /**
   * Ortak yazma sarmalayıcısı: kaydetme göstergesi, başarı bildirimi ve hata yönetimi.
   *
   * İstek BURADA bir kez tetiklenir; sonucu `ReplaySubject` üzerinden yayınlanır.
   * Böylece çağıran taraf (sayfa) ek bir HTTP isteği doğurmadan sonucu dinleyebilir —
   * soğuk observable'ı ikinci kez `subscribe` etmek isteği tekrarlardı.
   */
  private run<T>(
    request: Observable<T>,
    onSuccess: (value: T) => void,
    onError?: () => void,
    errorTitle = `${this.deps.labels.entity} işlemi tamamlanamadı`,
  ): Observable<T> {
    const result = new ReplaySubject<T>(1);
    this.savingState.set(true);

    request.pipe(finalize(() => this.savingState.set(false))).subscribe({
      next: (value) => {
        onSuccess(value);
        this.deps.onChanged?.();
        result.next(value);
        result.complete();
      },
      error: (error: ApiError) => {
        onError?.();
        // Alan hataları forma yansıtılır; genel mesaj toast ile duyurulur.
        this.deps.toast.fromApiError(error, errorTitle);
        result.error(error);
      },
    });

    return result.asObservable();
  }
}

const STATE_LABELS: Readonly<Record<PublishState, string>> = {
  DRAFT: 'taslak',
  REVIEW: 'incelemede',
  PUBLISHED: 'yayında',
  ARCHIVED: 'arşivlenmiş',
};
