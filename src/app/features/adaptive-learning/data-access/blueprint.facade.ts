import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiError } from '../../../core/api/api-error';
import { ToastStore } from '../../../core/observability/toast.store';
import { BlueprintCreateRequest, BlueprintDetail, ExamBlueprint } from '../models/blueprint.model';
import { CatalogFacade } from './catalog.facade';
import { BlueprintRepository } from './exam.repository';

/**
 * Blueprint orkestrasyonu.
 *
 * Ortak CRUD `CatalogFacade`'ten gelir; buraya blueprint'e özgü zengin detay
 * (ders/cohort adı, canlı özet, kazanım listesi) eklenir.
 */
@Injectable({ providedIn: 'root' })
export class BlueprintFacade extends CatalogFacade<ExamBlueprint, BlueprintCreateRequest> {
  private readonly repository = inject(BlueprintRepository);

  private readonly detailState = signal<BlueprintDetail | null>(null);
  private readonly statusState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  constructor() {
    super({
      repository: inject(BlueprintRepository),
      toast: inject(ToastStore),
      labels: { entity: 'Blueprint', nameOf: (item) => (item as ExamBlueprint).name },
      initialQuery: { sort: { field: 'updatedAt', direction: 'desc' } },
    });
  }

  readonly blueprintDetail = this.detailState.asReadonly();
  readonly blueprintDetailError = this.errorState.asReadonly();
  readonly isBlueprintDetailLoading = computed(() => this.statusState() === 'loading');
  readonly hasBlueprintDetailError = computed(() => this.statusState() === 'error');

  loadBlueprintDetail(id: string): void {
    this.statusState.set('loading');
    this.errorState.set(null);

    this.repository.detail(id).subscribe({
      next: (detail) => {
        this.detailState.set(detail);
        this.statusState.set('success');
      },
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.statusState.set('error');
      },
    });
  }

  clearBlueprintDetail(): void {
    this.detailState.set(null);
    this.statusState.set('idle');
  }
}
