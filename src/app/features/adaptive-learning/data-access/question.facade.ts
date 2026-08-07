import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { AuthFacade } from '../../../core/auth/auth.facade';
import { ToastStore } from '../../../core/observability/toast.store';
import { CatalogFacade } from './catalog.facade';
import { QuestionRepository } from './question.repository';
import { compareVersions } from '../domain/question.rules';
import {
  QUESTION_BULK_ACTION_LABELS,
  Question,
  QuestionBulkAction,
  QuestionCreateRequest,
  QuestionDetail,
  VersionComparison,
} from '../models/question.model';

/**
 * Soru bankası orkestrasyonu.
 *
 * Ortak CRUD `CatalogFacade`'ten gelir. Buraya soruya özgü olan zengin detay,
 * versiyon karşılaştırma, favori, kopyalama, yumuşak silme ve toplu işlem eklenir.
 * Versiyon farkı SUNUCUDA değil, saf domain fonksiyonuyla istemcide hesaplanır —
 * aynı fonksiyon testlerde de doğrudan çalıştırılır.
 */
@Injectable({ providedIn: 'root' })
export class QuestionFacade extends CatalogFacade<Question, QuestionCreateRequest> {
  private readonly repository = inject(QuestionRepository);
  private readonly toastStore = inject(ToastStore);
  private readonly auth = inject(AuthFacade);

  private readonly selectionState = signal<ReadonlySet<string>>(new Set());
  private readonly bulkBusyState = signal(false);

  private readonly detailState = signal<QuestionDetail | null>(null);
  private readonly detailStatusState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly detailErrorState = signal<ApiError | null>(null);

  private readonly comparisonState = signal<VersionComparison | null>(null);
  private readonly comparisonBusyState = signal(false);

  constructor() {
    super({
      repository: inject(QuestionRepository),
      toast: inject(ToastStore),
      labels: { entity: 'Soru', nameOf: (item) => (item as Question).title },
      initialQuery: { sort: { field: 'updatedAt', direction: 'desc' } },
    });
  }

  /* ── Zengin detay ────────────────────────────────────────────────────── */
  readonly questionDetail = this.detailState.asReadonly();
  readonly questionDetailError = this.detailErrorState.asReadonly();
  readonly isQuestionDetailLoading = computed(() => this.detailStatusState() === 'loading');
  readonly hasQuestionDetailError = computed(() => this.detailStatusState() === 'error');

  loadQuestionDetail(id: string): void {
    this.detailStatusState.set('loading');
    this.detailErrorState.set(null);

    this.repository.detail(id).subscribe({
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

  clearQuestionDetail(): void {
    this.detailState.set(null);
    this.detailStatusState.set('idle');
    this.comparisonState.set(null);
  }

  /* ── Versiyonlama ────────────────────────────────────────────────────── */
  readonly comparison = this.comparisonState.asReadonly();
  readonly isComparing = this.comparisonBusyState.asReadonly();

  /** Yayındaki soruyu yeni bir taslak versiyona alır (BR-02). */
  createVersion(question: Question, changeNote: string): Observable<Question> {
    return this.repository.createVersion(question.id, changeNote).pipe(
      tap({
        next: (updated) => {
          this.loadQuestionDetail(updated.id);
          this.load();
          this.toastStore.success(
            'Yeni versiyon oluşturuldu',
            `"${updated.title}" v${updated.versionNumber} taslak olarak düzenlenebilir.`,
          );
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'Versiyon oluşturulamadı'),
      }),
    );
  }

  compare(questionId: string, from: number, to: number): void {
    this.comparisonBusyState.set(true);

    this.repository.compareVersions(questionId, from, to).subscribe({
      next: (pair) => {
        this.comparisonState.set(compareVersions(pair.from, pair.to));
        this.comparisonBusyState.set(false);
      },
      error: (error: ApiError) => {
        this.comparisonBusyState.set(false);
        this.toastStore.fromApiError(error, 'Versiyonlar karşılaştırılamadı');
      },
    });
  }

  clearComparison(): void {
    this.comparisonState.set(null);
  }

  /* ── Favori, kopyalama, silme ────────────────────────────────────────── */

  /** Favori kullanıcıya özeldir; liste satırı bunu sormak zorundadır. */
  isFavoriteFor(question: Question): boolean {
    return question.favoritedBy.includes(this.auth.user()?.id ?? '');
  }

  toggleFavorite(question: Question, favorite: boolean): Observable<Question> {
    return this.repository.setFavorite(question.id, favorite).pipe(
      tap({
        next: () => {
          const detail = this.detailState();
          if (detail && detail.question.id === question.id) {
            this.detailState.set({ ...detail, isFavorite: favorite });
          }
          this.load();
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'Favori güncellenemedi'),
      }),
    );
  }

  duplicate(question: Question): Observable<Question> {
    return this.repository.duplicate(question.id).pipe(
      tap({
        next: (copy) => {
          this.load();
          this.toastStore.success('Soru kopyalandı', `"${copy.code}" taslak olarak oluşturuldu.`);
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'Soru kopyalanamadı'),
      }),
    );
  }

  softDelete(question: Question): Observable<Question> {
    return this.repository.softDelete(question.id).pipe(
      tap({
        next: () => {
          this.load();
          this.toastStore.success('Soru silindi', `"${question.code}" listeden kaldırıldı.`);
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'Soru silinemedi'),
      }),
    );
  }

  /* ── Toplu işlem ─────────────────────────────────────────────────────── */
  readonly selectedIds = computed(() => [...this.selectionState()]);
  readonly selectedCount = computed(() => this.selectionState().size);
  readonly hasSelection = computed(() => this.selectionState().size > 0);
  readonly isBulkBusy = this.bulkBusyState.asReadonly();

  readonly isPageSelected = computed(() => {
    const items = this.items();
    const selection = this.selectionState();
    return items.length > 0 && items.every((item) => selection.has(item.id));
  });

  isSelected(id: string): boolean {
    return this.selectionState().has(id);
  }

  toggleSelection(id: string): void {
    this.selectionState.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  togglePageSelection(): void {
    const items = this.items();
    const allSelected = this.isPageSelected();

    this.selectionState.update((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selectionState.set(new Set());
  }

  /** Kısmi başarı normaldir: atlanan kayıtlar gerekçesiyle bildirilir. */
  runBulk(action: QuestionBulkAction): Observable<unknown> {
    this.bulkBusyState.set(true);

    return this.repository.bulk(this.selectedIds(), action).pipe(
      tap({
        next: (result) => {
          this.bulkBusyState.set(false);
          this.clearSelection();
          this.load();

          const label = QUESTION_BULK_ACTION_LABELS[action];
          if (result.failed.length === 0) {
            this.toastStore.success(
              `${label} tamamlandı`,
              `${result.succeeded.length} soru güncellendi.`,
            );
          } else {
            this.toastStore.warning(
              `${label}: ${result.failed.length} soru atlandı`,
              result.failed
                .slice(0, 3)
                .map((item) => `${item.title}: ${item.reason}`)
                .join(' · '),
            );
          }
        },
        error: (error: ApiError) => {
          this.bulkBusyState.set(false);
          this.toastStore.fromApiError(error, 'Toplu işlem tamamlanamadı');
        },
      }),
    );
  }

  /* ── İnceleme akışı ──────────────────────────────────────────────────── */

  private reviewAction(
    request: Observable<Question>,
    successTitle: string,
    successMessage: (question: Question) => string,
    errorTitle: string,
  ): Observable<Question> {
    return request.pipe(
      tap({
        next: (updated) => {
          this.loadQuestionDetail(updated.id);
          this.load();
          this.toastStore.success(successTitle, successMessage(updated));
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, errorTitle),
      }),
    );
  }

  submitForReview(question: Question, message = ''): Observable<Question> {
    return this.reviewAction(
      this.repository.submitForReview(question.id, message),
      'İncelemeye gönderildi',
      (updated) => `"${updated.title}" ölçme uzmanının incelemesine sunuldu.`,
      'Soru incelemeye gönderilemedi',
    );
  }

  resubmitForReview(question: Question, message = ''): Observable<Question> {
    return this.reviewAction(
      this.repository.resubmitForReview(question.id, message),
      'Yeniden incelemeye gönderildi',
      (updated) => `"${updated.title}" düzeltmelerle birlikte tekrar incelemeye sunuldu.`,
      'Soru yeniden gönderilemedi',
    );
  }

  approve(question: Question, message = ''): Observable<Question> {
    return this.reviewAction(
      this.repository.approve(question.id, message),
      'Soru onaylandı',
      (updated) => `"${updated.title}" yayına hazır.`,
      'Soru onaylanamadı',
    );
  }

  requestRevision(question: Question, message: string): Observable<Question> {
    return this.reviewAction(
      this.repository.requestRevision(question.id, message),
      'Revizyon istendi',
      (updated) => `"${updated.title}" için eğitmenden düzeltme istendi.`,
      'Revizyon istenemedi',
    );
  }

  reject(question: Question, message: string): Observable<Question> {
    return this.reviewAction(
      this.repository.reject(question.id, message),
      'Soru reddedildi',
      (updated) => `"${updated.title}" reddedildi; eğitmen düzeltip yeniden gönderebilir.`,
      'Soru reddedilemedi',
    );
  }

  addComment(question: Question, message: string): Observable<unknown> {
    return this.repository.addComment(question.id, message).pipe(
      tap({
        next: () => this.loadQuestionDetail(question.id),
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'Yorum eklenemedi'),
      }),
    );
  }

  /** Seçili soruları JSON dosyası olarak indirir. */
  exportSelected(): void {
    const ids = this.selectedIds();

    this.repository.export(ids).subscribe({
      next: (result) => {
        downloadJson(
          result.questions,
          `soru-bankasi-${new Date().toISOString().slice(0, 10)}.json`,
        );
        this.toastStore.success('Dışa aktarıldı', `${result.count} soru indirildi.`);
      },
      error: (error: ApiError) => this.toastStore.fromApiError(error, 'Dışa aktarma başarısız'),
    });
  }
}

/** Tarayıcıda dosya indirme — tek kullanım yeri olduğu için facade'de tutulur. */
function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}
