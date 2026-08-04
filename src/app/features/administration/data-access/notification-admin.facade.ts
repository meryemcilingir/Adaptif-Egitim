import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { FilterValue } from '../../../core/api/page-request';
import { ToastStore } from '../../../core/observability/toast.store';
import { EntityStore } from '../../../core/state/entity-store';
import { NotificationTarget } from '../../adaptive-learning/domain/notification-targeting';
import { AudiencePreview, CampaignDraft, NotificationCampaign } from '../models/admin.model';
import { AdminRepository } from './admin.repository';

/**
 * Bildirim merkezi orkestrasyonu (Sprint 9 §7, §8).
 *
 * Hedef önizlemesi ("kaç kişiye gidecek?") ayrı bir sinyalde tutulur ve hedef
 * her değiştiğinde tazelenir. Gönderim anındaki alıcı sayısıyla AYNI sunucu
 * fonksiyonundan gelir; önizlemenin gönderimle uyuşmaması mümkün değildir.
 */
@Injectable({ providedIn: 'root' })
export class NotificationAdminFacade {
  private readonly repository = inject(AdminRepository);
  private readonly toast = inject(ToastStore);

  private readonly store = new EntityStore<NotificationCampaign>({
    initialQuery: { sort: { field: 'createdAt', direction: 'desc' } },
  });

  private readonly previewState = signal<AudiencePreview | null>(null);
  private readonly savingState = signal(false);

  readonly items = this.store.items;
  readonly total = this.store.total;
  readonly status = this.store.status;
  readonly error = this.store.error;
  readonly query = this.store.query;
  readonly isFiltered = this.store.isFiltered;

  readonly preview = this.previewState.asReadonly();
  readonly saving = this.savingState.asReadonly();

  /** Gönderilmiş kampanya sayısı — geçmiş ekranındaki özet. */
  readonly sentCount = computed(
    () => this.store.items().filter((campaign) => campaign.state === 'SENT').length,
  );

  load(): void {
    this.store.setLoading();

    this.repository.campaigns(this.store.query()).subscribe({
      next: (page) => this.store.setPage(page),
      error: (error: ApiError) => this.store.setError(error),
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

  /* ── Hedef önizlemesi ──────────────────────────────────────────────────── */

  previewAudience(target: NotificationTarget): void {
    // Hedef eksikse sunucuya gitmeye gerek yok; panel "hedef seçin" der.
    if (target.audience !== 'all' && !target.value) {
      this.previewState.set(null);
      return;
    }

    this.repository.previewAudience(target).subscribe({
      next: (preview) => this.previewState.set(preview),
      error: () => this.previewState.set(null),
    });
  }

  clearPreview(): void {
    this.previewState.set(null);
  }

  /* ── Yazma işlemleri ───────────────────────────────────────────────────── */

  create(draft: CampaignDraft): Observable<NotificationCampaign> {
    return this.write(this.repository.createCampaign(draft), 'Bildirim taslağı kaydedildi.');
  }

  update(
    id: string,
    draft: CampaignDraft,
    expectedVersion: number,
  ): Observable<NotificationCampaign> {
    return this.write(
      this.repository.updateCampaign(id, { ...draft, expectedVersion }),
      'Bildirim güncellendi.',
    );
  }

  send(id: string): void {
    this.repository.sendCampaign(id).subscribe({
      next: (campaign) => {
        this.toast.success(`Bildirim ${campaign.recipientCount} kullanıcıya iletildi.`);
        this.load();
      },
      error: (error: ApiError) => this.toast.error(error.message),
    });
  }

  remove(id: string): void {
    this.repository.deleteCampaign(id).subscribe({
      next: () => {
        this.toast.success('Bildirim silindi.');
        this.load();
      },
      error: (error: ApiError) => this.toast.error(error.message),
    });
  }

  private write(
    request: Observable<NotificationCampaign>,
    message: string,
  ): Observable<NotificationCampaign> {
    this.savingState.set(true);

    const shared = request.pipe(
      tap({
        next: () => {
          this.savingState.set(false);
          this.toast.success(message);
          this.load();
        },
        error: () => this.savingState.set(false),
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    shared.subscribe({ error: () => undefined });
    return shared;
  }
}
