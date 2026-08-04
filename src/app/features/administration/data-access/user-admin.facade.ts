import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { FilterValue } from '../../../core/api/page-request';
import { ToastStore } from '../../../core/observability/toast.store';
import { EntityStore } from '../../../core/state/entity-store';
import { User } from '../../adaptive-learning/models/user.model';
import { UserDetail, UserDraft } from '../models/admin.model';
import { AdminRepository } from './admin.repository';

export type LoadState = 'idle' | 'loading' | 'success' | 'error';

/** Yaşam döngüsü işlemleri ve kullanıcıya gösterilecek başarı mesajları. */
const LIFECYCLE_MESSAGES = {
  disable: 'Kullanıcı askıya alındı.',
  enable: 'Kullanıcı yeniden etkinleştirildi.',
  archive: 'Kullanıcı arşivlendi.',
  restore: 'Kullanıcı arşivden çıkarıldı.',
  unlock: 'Hesap kilidi açıldı.',
} as const;

export type LifecycleAction = keyof typeof LIFECYCLE_MESSAGES;

/**
 * Kullanıcı yönetimi orkestrasyonu (Sprint 9 §2, §3).
 *
 * Liste durumu `EntityStore` ile tutulur — sayfalama, arama, filtre ve sıralama
 * mantığı her ekranda yeniden yazılmaz. Detay ayrı bir sinyalde durur: liste
 * satırı özet, detay ise etkinlik/giriş/denetim geçmişini de taşır.
 */
@Injectable({ providedIn: 'root' })
export class UserAdminFacade {
  private readonly repository = inject(AdminRepository);
  private readonly toast = inject(ToastStore);

  private readonly store = new EntityStore<User>({
    initialQuery: { sort: { field: 'fullName', direction: 'asc' } },
  });

  private readonly detailState = signal<UserDetail | null>(null);
  private readonly detailStatusState = signal<LoadState>('idle');
  private readonly detailErrorState = signal<ApiError | null>(null);
  private readonly savingState = signal(false);

  /* ── Liste ─────────────────────────────────────────────────────────────── */

  readonly items = this.store.items;
  readonly total = this.store.total;
  readonly status = this.store.status;
  readonly error = this.store.error;
  readonly query = this.store.query;
  readonly isFiltered = this.store.isFiltered;

  /* ── Detay ─────────────────────────────────────────────────────────────── */

  readonly detail = this.detailState.asReadonly();
  readonly detailStatus = this.detailStatusState.asReadonly();
  readonly detailError = this.detailErrorState.asReadonly();
  readonly saving = this.savingState.asReadonly();

  readonly isDetailLoading = computed(
    () => this.detailStatusState() === 'loading' && this.detailState() === null,
  );

  load(): void {
    this.store.setLoading();

    this.repository.users(this.store.query()).subscribe({
      next: (page) => this.store.setPage(page),
      error: (error: ApiError) => this.store.setError(error),
    });
  }

  loadDetail(id: string): void {
    this.detailStatusState.set('loading');
    this.detailErrorState.set(null);

    this.repository.userDetail(id).subscribe({
      next: (detail) => {
        this.detailState.set(detail);
        this.detailStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.detailErrorState.set(error);
        this.detailStatusState.set('error');
      },
    });
  }

  /* ── Sorgu ─────────────────────────────────────────────────────────────── */

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

  /* ── Yazma işlemleri ───────────────────────────────────────────────────── */

  /**
   * Facade hem abone olup durumu günceller hem observable'ı ekrana döndürür.
   *
   * `shareReplay` olmadan ekranın aboneliği İKİNCİ bir HTTP isteği tetiklerdi
   * (ADR-056); iki istek de aynı kaydı oluşturmaya çalışır ve ikincisi
   * "e-posta kullanımda" hatasıyla düşerdi.
   */
  create(draft: UserDraft): Observable<User> {
    this.savingState.set(true);

    const request = this.repository.createUser(draft).pipe(
      tap({
        next: () => {
          this.savingState.set(false);
          this.toast.success('Kullanıcı oluşturuldu. Davet durumunda başlar.');
          this.load();
        },
        error: () => this.savingState.set(false),
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    request.subscribe({ error: () => undefined });
    return request;
  }

  update(id: string, draft: UserDraft, expectedVersion: number): Observable<User> {
    this.savingState.set(true);

    const request = this.repository.updateUser(id, { ...draft, expectedVersion }).pipe(
      tap({
        next: () => {
          this.savingState.set(false);
          this.toast.success('Kullanıcı güncellendi.');
          this.load();
          this.loadDetail(id);
        },
        error: () => this.savingState.set(false),
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    request.subscribe({ error: () => undefined });
    return request;
  }

  lifecycle(id: string, action: LifecycleAction, reason?: string): void {
    this.repository.lifecycle(id, action, reason ? { reason } : {}).subscribe({
      next: () => {
        this.toast.success(LIFECYCLE_MESSAGES[action]);
        this.load();
        if (this.detailState()?.user.id === id) this.loadDetail(id);
      },
      error: (error: ApiError) => this.toast.error(error.message),
    });
  }

  /**
   * Parola sıfırlama.
   *
   * Geçici parola çağırana DÖNER: bu projede e-posta gönderimi yoktur, parola
   * ekranda gösterilmezse kullanıcı hesabına giremezdi.
   */
  resetPassword(id: string): Observable<{ temporaryPassword: string; note: string }> {
    const request = this.repository.resetPassword(id).pipe(
      tap({
        next: () => {
          this.toast.success('Parola sıfırlandı.');
          if (this.detailState()?.user.id === id) this.loadDetail(id);
        },
        error: (error: ApiError) => this.toast.error(error.message),
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    request.subscribe({ error: () => undefined });
    return request;
  }
}
