import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { PageRequest } from '../../../core/api/page-request';
import { ToastStore } from '../../../core/observability/toast.store';
import { EntityStore } from '../../../core/state/entity-store';
import {
  Attempt,
  AttemptDetail,
  GradeAttemptRequest,
  GradingQueueItem,
  RegradeRequest,
  ResolveConflictRequest,
} from '../models/attempt.model';
import { GradingRepository } from './grading.repository';

/**
 * Değerlendirme orkestrasyonu.
 *
 * İki ayrı liste barındırır — bekleyen işler kuyruğu ve tüm denemeler — çünkü
 * ikisi farklı sorulara cevap verir: kuyruk "ne yapmam gerekiyor", deneme
 * listesi "ne oldu". Aynı `EntityStore` sınıfı ikisi için de kullanılır.
 */
@Injectable({ providedIn: 'root' })
export class GradingFacade {
  private readonly repository = inject(GradingRepository);
  private readonly toast = inject(ToastStore);

  private readonly queueStore = new EntityStore<GradingQueueItem>({
    initialQuery: { sort: { field: 'waitingHours', direction: 'desc' } },
  });

  private readonly attemptStore = new EntityStore<Attempt>({
    initialQuery: { sort: { field: 'submittedAt', direction: 'desc' } },
  });

  /*
   * Çakışma listesi kuyruktan AYRI bir store'da tutulur.
   *
   * Aynı satır tipini (`GradingQueueItem`) paylaşsalar da farklı kullanıcılar
   * tarafından, farklı yetkiyle ve farklı filtrelerle gezilirler; tek store'a
   * sıkıştırmak birinin filtresini diğerine sızdırırdı.
   */
  private readonly conflictStore = new EntityStore<GradingQueueItem>({
    // `state` sıralaması = karar verilebilenler önce (bkz. grading.handlers `compare`).
    initialQuery: { sort: { field: 'state', direction: 'desc' } },
  });

  private readonly detailState = signal<AttemptDetail | null>(null);
  private readonly detailStatusState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly detailErrorState = signal<ApiError | null>(null);
  private readonly savingState = signal(false);

  /* ── Kuyruk ────────────────────────────────────────────────────────────── */

  readonly queue = this.queueStore.items;
  readonly queueTotal = this.queueStore.total;
  readonly queueStatus = this.queueStore.status;
  readonly queueError = this.queueStore.error;
  readonly queueQuery = this.queueStore.query;
  readonly queueFiltered = this.queueStore.isFiltered;

  loadQueue(): void {
    this.queueStore.setLoading();

    this.repository.queue(this.queueStore.query()).subscribe({
      next: (page) => this.queueStore.setPage(page),
      error: (error: ApiError) => this.queueStore.setError(error),
    });
  }

  setQueueSearch(search: string): void {
    this.queueStore.patchQuery({ search });
    this.loadQueue();
  }

  setQueueFilter(key: string, value: PageRequest['filters'][string]): void {
    this.queueStore.setFilter(key, value);
    this.loadQueue();
  }

  clearQueueFilters(): void {
    this.queueStore.clearFilters();
    this.loadQueue();
  }

  toggleQueueSort(field: string): void {
    this.queueStore.toggleSort(field);
    this.loadQueue();
  }

  goToQueuePage(page: number): void {
    this.queueStore.goToPage(page);
    this.loadQueue();
  }

  setQueuePageSize(size: number): void {
    this.queueStore.patchQuery({ size });
    this.loadQueue();
  }

  /* ── Çakışmalar (hakemlik) ─────────────────────────────────────────────── */

  readonly conflicts = this.conflictStore.items;
  readonly conflictsTotal = this.conflictStore.total;
  readonly conflictsStatus = this.conflictStore.status;
  readonly conflictsError = this.conflictStore.error;
  readonly conflictsQuery = this.conflictStore.query;
  readonly conflictsFiltered = this.conflictStore.isFiltered;

  loadConflicts(): void {
    this.conflictStore.setLoading();

    this.repository.conflicts(this.conflictStore.query()).subscribe({
      next: (page) => this.conflictStore.setPage(page),
      error: (error: ApiError) => this.conflictStore.setError(error),
    });
  }

  setConflictsSearch(search: string): void {
    this.conflictStore.patchQuery({ search });
    this.loadConflicts();
  }

  toggleConflictsSort(field: string): void {
    this.conflictStore.toggleSort(field);
    this.loadConflicts();
  }

  goToConflictsPage(page: number): void {
    this.conflictStore.goToPage(page);
    this.loadConflicts();
  }

  setConflictsPageSize(size: number): void {
    this.conflictStore.patchQuery({ size });
    this.loadConflicts();
  }

  /* ── Deneme listesi ────────────────────────────────────────────────────── */

  readonly attempts = this.attemptStore.items;
  readonly attemptsTotal = this.attemptStore.total;
  readonly attemptsStatus = this.attemptStore.status;
  readonly attemptsError = this.attemptStore.error;
  readonly attemptsQuery = this.attemptStore.query;
  readonly attemptsFiltered = this.attemptStore.isFiltered;

  loadAttempts(): void {
    this.attemptStore.setLoading();

    this.repository.attempts(this.attemptStore.query()).subscribe({
      next: (page) => this.attemptStore.setPage(page),
      error: (error: ApiError) => this.attemptStore.setError(error),
    });
  }

  setAttemptSearch(search: string): void {
    this.attemptStore.patchQuery({ search });
    this.loadAttempts();
  }

  setAttemptFilter(key: string, value: PageRequest['filters'][string]): void {
    this.attemptStore.setFilter(key, value);
    this.loadAttempts();
  }

  clearAttemptFilters(): void {
    this.attemptStore.clearFilters();
    this.loadAttempts();
  }

  toggleAttemptSort(field: string): void {
    this.attemptStore.toggleSort(field);
    this.loadAttempts();
  }

  goToAttemptPage(page: number): void {
    this.attemptStore.goToPage(page);
    this.loadAttempts();
  }

  setAttemptPageSize(size: number): void {
    this.attemptStore.patchQuery({ size });
    this.loadAttempts();
  }

  /* ── Detay ─────────────────────────────────────────────────────────────── */

  readonly detail = this.detailState.asReadonly();
  readonly detailError = this.detailErrorState.asReadonly();
  readonly isDetailLoading = computed(() => this.detailStatusState() === 'loading');
  readonly hasDetailError = computed(() => this.detailStatusState() === 'error');
  readonly isSaving = this.savingState.asReadonly();

  loadDetail(attemptId: string): void {
    this.detailStatusState.set('loading');
    this.detailErrorState.set(null);

    this.repository.detail(attemptId).subscribe({
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

  clearDetail(): void {
    this.detailState.set(null);
    this.detailStatusState.set('idle');
  }

  /* ── Yazma ─────────────────────────────────────────────────────────────── */

  grade(attemptId: string, request: GradeAttemptRequest): Observable<Attempt> {
    return this.write(attemptId, this.repository.grade(attemptId, request), 'Değerlendirme kaydedildi.');
  }

  regrade(attemptId: string, request: RegradeRequest): Observable<Attempt> {
    return this.write(
      attemptId,
      this.repository.regrade(attemptId, request),
      'İtiraz kaydedildi; deneme incelemeye alındı.',
    );
  }

  resolveConflict(attemptId: string, request: ResolveConflictRequest): Observable<Attempt> {
    return this.write(
      attemptId,
      this.repository.resolveConflict(attemptId, request),
      'Çakışma sonuçlandırıldı.',
    );
  }

  release(attemptId: string): Observable<Attempt> {
    return this.write(attemptId, this.repository.release(attemptId), 'Sonuç öğrenciye açıldı.');
  }

  /**
   * Ortak yazma yolu.
   *
   * Başarıda detay YENİDEN YÜKLENİR: puan değişimi toplamı, durumu, çakışmaları
   * ve geçmişi birlikte etkiler. Yanıttaki `Attempt`'i yerel duruma yamamak,
   * türetilen alanların bayat kalmasına yol açardı.
   */
  private write(
    attemptId: string,
    request: Observable<Attempt>,
    successMessage: string,
  ): Observable<Attempt> {
    this.savingState.set(true);

    return request.pipe(
      tap({
        next: () => {
          this.savingState.set(false);
          this.toast.success(successMessage);
          this.loadDetail(attemptId);
        },
        error: (error: ApiError) => {
          this.savingState.set(false);
          this.toast.error(error.message);
        },
      }),
    );
  }
}
