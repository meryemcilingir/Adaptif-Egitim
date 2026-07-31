import { Signal, computed } from '@angular/core';
import { Observable } from 'rxjs';

import { FilterValue, PageRequest } from '../../../core/api/page-request';
import { CrudEngine, CrudEngineDeps, StatefulRecord } from '../../../core/state/crud-engine';
import { PublishState } from '../models/common.model';
import { availableActions } from '../domain/publish-workflow';

/**
 * Katalog varlıkları (program, ders, kazanım) için ortak facade davranışı.
 *
 * Üç facade de aynı yüzeyi sunar: liste sorgusu, detay, yazma ve yayın iş akışı.
 * Bu ince temel sınıf yalnızca `CrudEngine`'i dışa açar — iş kuralı içermez,
 * bu yüzden alt sınıflar için kırılganlık yaratmaz (LSP korunur).
 * Varlığa özgü davranışlar alt sınıfta tanımlanır.
 */
export abstract class CatalogFacade<TEntity extends StatefulRecord, TWrite> {
  protected readonly engine: CrudEngine<TEntity, TWrite>;

  protected constructor(deps: CrudEngineDeps<TEntity, TWrite>) {
    this.engine = new CrudEngine<TEntity, TWrite>(deps);
  }

  /* ── Liste ───────────────────────────────────────────────────────────── */
  get items(): Signal<readonly TEntity[]> {
    return this.engine.items;
  }
  get total(): Signal<number> {
    return this.engine.total;
  }
  get status() {
    return this.engine.status;
  }
  get error() {
    return this.engine.error;
  }
  get query(): Signal<PageRequest> {
    return this.engine.query;
  }
  get isEmpty() {
    return this.engine.isEmpty;
  }
  get isFiltered() {
    return this.engine.isFiltered;
  }
  get activeFilterCount() {
    return this.engine.activeFilterCount;
  }
  get mutatingIds() {
    return this.engine.mutatingIds;
  }

  /* ── Detay ───────────────────────────────────────────────────────────── */
  get detail(): Signal<TEntity | null> {
    return this.engine.detail;
  }
  get detailStatus() {
    return this.engine.detailStatus;
  }
  get detailError() {
    return this.engine.detailError;
  }
  get isDetailLoading() {
    return this.engine.isDetailLoading;
  }
  get hasDetailError() {
    return this.engine.hasDetailError;
  }
  get isSaving() {
    return this.engine.isSaving;
  }

  /** Detaydaki kaydın durumundan çıkan yayın eylemleri (buton listesi). */
  readonly workflowActions = computed(() => {
    const item = this.engine.detail();
    return item ? availableActions(item.state) : [];
  });

  /* ── Sorgu ───────────────────────────────────────────────────────────── */
  load(): void {
    this.engine.load();
  }
  setSearch(search: string): void {
    this.engine.setSearch(search);
  }
  setFilter(key: string, value: FilterValue): void {
    this.engine.setFilter(key, value);
  }
  clearFilters(): void {
    this.engine.clearFilters();
  }
  toggleSort(field: string): void {
    this.engine.toggleSort(field);
  }
  goToPage(page: number): void {
    this.engine.goToPage(page);
  }
  setPageSize(size: number): void {
    this.engine.setPageSize(size);
  }
  setQuery(patch: Partial<PageRequest>): void {
    this.engine.setQuery(patch);
  }

  /* ── Detay ve yazma ──────────────────────────────────────────────────── */
  loadDetail(id: string): void {
    this.engine.loadDetail(id);
  }
  clearDetail(): void {
    this.engine.clearDetail();
  }
  create(payload: TWrite): Observable<TEntity> {
    return this.engine.create(payload);
  }
  update(item: TEntity, payload: TWrite): Observable<TEntity> {
    return this.engine.update(item.id, payload, item.version);
  }
  remove(item: TEntity): Observable<void> {
    return this.engine.remove(item);
  }
  transition(item: TEntity, state: PublishState, reason?: string): Observable<TEntity> {
    return this.engine.transition(item, state, reason);
  }
}
