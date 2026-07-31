import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { ToastStore } from '../../../core/observability/toast.store';
import {
  CONTENT_BULK_ACTION_LABELS,
  ContentBulkAction,
  ContentCreateRequest,
  ContentDetail,
  ContentItem,
  ContentProgress,
  ContentProgressRequest,
} from '../models/content-item.model';
import { CatalogFacade } from './catalog.facade';
import { ContentRepository } from './content.repository';

export type ContentViewMode = 'grid' | 'list';

/**
 * İçerik orkestrasyonu.
 *
 * Ortak CRUD `CatalogFacade`'ten gelir; buraya içeriğe özgü olan zengin detay,
 * ilerleme kaydı, toplu işlem ve görünüm tercihi eklenir.
 */
@Injectable({ providedIn: 'root' })
export class ContentFacade extends CatalogFacade<ContentItem, ContentCreateRequest> {
  private readonly repository = inject(ContentRepository);
  private readonly toastStore = inject(ToastStore);

  private readonly viewModeState = signal<ContentViewMode>('grid');
  private readonly selectionState = signal<ReadonlySet<string>>(new Set());
  private readonly bulkBusyState = signal(false);

  private readonly richDetailState = signal<ContentDetail | null>(null);
  private readonly richDetailStatusState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly richDetailErrorState = signal<ApiError | null>(null);

  constructor() {
    super({
      repository: inject(ContentRepository),
      toast: inject(ToastStore),
      labels: { entity: 'İçerik', nameOf: (item) => (item as ContentItem).title },
      initialQuery: { sort: { field: 'updatedAt', direction: 'desc' } },
    });
  }

  /* ── Görünüm tercihi ─────────────────────────────────────────────────── */
  readonly viewMode = this.viewModeState.asReadonly();

  setViewMode(mode: ContentViewMode): void {
    this.viewModeState.set(mode);
  }

  /* ── Toplu seçim ─────────────────────────────────────────────────────── */
  readonly selectedIds = computed(() => [...this.selectionState()]);
  readonly selectedCount = computed(() => this.selectionState().size);
  readonly hasSelection = computed(() => this.selectionState().size > 0);
  readonly isBulkBusy = this.bulkBusyState.asReadonly();

  /** Görünen sayfanın tamamı seçili mi (başlıktaki üç durumlu kutu için). */
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

  /**
   * Toplu işlem. Kısmi başarı normaldir: başarısız kayıtlar gerekçesiyle
   * bildirilir, sessizce yutulmaz (PROJECT_RULES.md §7).
   */
  runBulk(action: ContentBulkAction): Observable<unknown> {
    const ids = this.selectedIds();
    this.bulkBusyState.set(true);

    return this.repository.bulk(ids, action).pipe(
      tap({
        next: (result) => {
          this.bulkBusyState.set(false);
          this.clearSelection();
          this.load();

          const label = CONTENT_BULK_ACTION_LABELS[action];
          if (result.failed.length === 0) {
            this.toastStore.success(
              `${label} tamamlandı`,
              `${result.succeeded.length} içerik güncellendi.`,
            );
          } else {
            this.toastStore.warning(
              `${label}: ${result.failed.length} içerik atlandı`,
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

  /* ── Zengin detay ────────────────────────────────────────────────────── */
  readonly richDetail = this.richDetailState.asReadonly();
  readonly richDetailError = this.richDetailErrorState.asReadonly();
  readonly isRichDetailLoading = computed(() => this.richDetailStatusState() === 'loading');
  readonly hasRichDetailError = computed(() => this.richDetailStatusState() === 'error');

  loadRichDetail(id: string): void {
    this.richDetailStatusState.set('loading');
    this.richDetailErrorState.set(null);

    this.repository.detail(id).subscribe({
      next: (detail) => {
        this.richDetailState.set(detail);
        this.richDetailStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.richDetailErrorState.set(error);
        this.richDetailStatusState.set('error');
      },
    });
  }

  clearRichDetail(): void {
    this.richDetailState.set(null);
    this.richDetailStatusState.set('idle');
  }

  /* ── İlerleme ────────────────────────────────────────────────────────── */

  /** Öğrencinin içerik ilerlemesini kaydeder ve detay görünümünü tazeler. */
  saveProgress(contentId: string, payload: ContentProgressRequest): Observable<ContentProgress> {
    return this.repository.saveProgress(contentId, payload).pipe(
      tap({
        next: (progress) => {
          const detail = this.richDetailState();
          if (detail && detail.content.id === contentId) {
            this.richDetailState.set({ ...detail, progress });
          }

          if (progress.state === 'completed') {
            this.toastStore.success('İçerik tamamlandı', 'İlerlemen kaydedildi.');
          }
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'İlerleme kaydedilemedi'),
      }),
    );
  }
}
