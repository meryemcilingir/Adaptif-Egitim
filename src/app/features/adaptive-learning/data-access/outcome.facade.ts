import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { ToastStore } from '../../../core/observability/toast.store';
import {
  LearningOutcome,
  OutcomeCreateRequest,
  OutcomeGraph,
} from '../models/learning-outcome.model';
import { CatalogFacade } from './catalog.facade';
import { CycleCheckResult, OutcomeRepository, PrerequisiteView } from './catalog.repository';

/**
 * Kazanım orkestrasyonu.
 *
 * Ortak CRUD davranışı `CatalogFacade`'ten gelir; buraya kazanıma ÖZGÜ olan
 * önkoşul yönetimi, döngü kontrolü ve grafik durumu eklenir.
 */
@Injectable({ providedIn: 'root' })
export class OutcomeFacade extends CatalogFacade<LearningOutcome, OutcomeCreateRequest> {
  private readonly repository = inject(OutcomeRepository);
  private readonly toastStore = inject(ToastStore);

  private readonly graphState = signal<OutcomeGraph | null>(null);
  private readonly graphStatusState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly graphErrorState = signal<ApiError | null>(null);
  private readonly prerequisiteState = signal<PrerequisiteView | null>(null);

  constructor() {
    super({
      repository: inject(OutcomeRepository),
      toast: inject(ToastStore),
      labels: { entity: 'Kazanım', nameOf: (item) => (item as LearningOutcome).title },
      initialQuery: { sort: { field: 'code', direction: 'asc' } },
    });
  }

  /* ── Grafik ──────────────────────────────────────────────────────────── */
  readonly graph = this.graphState.asReadonly();
  readonly graphError = this.graphErrorState.asReadonly();
  readonly isGraphLoading = computed(() => this.graphStatusState() === 'loading');
  readonly hasGraphError = computed(() => this.graphStatusState() === 'error');
  readonly isGraphEmpty = computed(
    () => this.graphStatusState() === 'success' && (this.graphState()?.nodes.length ?? 0) === 0,
  );
  readonly cycles = computed(() => this.graphState()?.cycles ?? []);
  readonly hasCycles = computed(() => this.cycles().length > 0);

  loadGraph(courseId: string | null): void {
    this.graphStatusState.set('loading');
    this.graphErrorState.set(null);

    this.repository.graph(courseId).subscribe({
      next: (graph) => {
        this.graphState.set(graph);
        this.graphStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.graphErrorState.set(error);
        this.graphStatusState.set('error');
      },
    });
  }

  /* ── Önkoşullar ──────────────────────────────────────────────────────── */
  readonly prerequisiteView = this.prerequisiteState.asReadonly();
  readonly prerequisites = computed(() => this.prerequisiteState()?.prerequisites ?? []);
  readonly dependents = computed(() => this.prerequisiteState()?.dependents ?? []);

  loadPrerequisites(outcomeId: string): void {
    this.prerequisiteState.set(null);
    this.repository.prerequisites(outcomeId).subscribe({
      next: (view) => this.prerequisiteState.set(view),
      error: (error: ApiError) => this.toastStore.fromApiError(error, 'Önkoşullar yüklenemedi'),
    });
  }

  /**
   * Önkoşulları kaydeder. Döngü tespit edilirse sunucu 422 döner ve mesaj
   * doğrudan kullanıcıya gösterilir (BR-01).
   */
  savePrerequisites(
    outcome: LearningOutcome,
    prerequisiteIds: readonly string[],
  ): Observable<LearningOutcome> {
    return this.repository.savePrerequisites(outcome.id, prerequisiteIds).pipe(
      tap({
        next: (updated) => {
          this.engine.loadDetail(updated.id);
          this.loadPrerequisites(updated.id);
          this.load();
          this.toastStore.success(
            'Önkoşullar güncellendi',
            `"${updated.title}" için ${prerequisiteIds.length} önkoşul tanımlı.`,
          );
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'Önkoşullar kaydedilemedi'),
      }),
    );
  }

  /** Kaydetmeden önce döngü kontrolü — form anında uyarı gösterebilsin diye. */
  checkCycle(outcomeId: string, prerequisiteIds: readonly string[]): Observable<CycleCheckResult> {
    return this.repository.checkCycle(outcomeId, prerequisiteIds);
  }
}
