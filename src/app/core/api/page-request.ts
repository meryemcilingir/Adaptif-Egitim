import { HttpParams } from '@angular/common/http';

/**
 * Server-side davranışı taklit eden liste sorgusu sözleşmesi.
 * Tüm tablo ekranları bu tipi kullanır; mock backend aynı sözleşmeyi uygular.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  readonly field: string;
  readonly direction: SortDirection;
}

/** Filtre değeri: tekil, çoklu (multi-select) veya aralık olabilir. */
export type FilterValue = string | number | boolean | readonly string[] | null;

export interface FilterRange {
  readonly from?: string | number | null;
  readonly to?: string | number | null;
}

export interface PageRequest {
  /** 1 tabanlı sayfa numarası. */
  readonly page: number;
  readonly size: number;
  readonly search: string;
  readonly sort: SortSpec | null;
  readonly filters: Readonly<Record<string, FilterValue>>;
}

export interface PageResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly size: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

export const EMPTY_PAGE_REQUEST: PageRequest = {
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  search: '',
  sort: null,
  filters: {},
};

export function createPageRequest(overrides: Partial<PageRequest> = {}): PageRequest {
  return { ...EMPTY_PAGE_REQUEST, ...overrides };
}

export function emptyPage<T>(request: PageRequest): PageResponse<T> {
  return { items: [], total: 0, page: request.page, size: request.size };
}

/** Bir filtrenin gerçekten uygulanmış sayılıp sayılmayacağı. */
export function isActiveFilterValue(value: FilterValue): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Aktif filtre sayısı — AppFilterBar rozetinde gösterilir. */
export function countActiveFilters(request: PageRequest): number {
  return Object.values(request.filters).filter(isActiveFilterValue).length;
}

export function toHttpParams(request: PageRequest): HttpParams {
  let params = new HttpParams().set('page', String(request.page)).set('size', String(request.size));

  if (request.search.trim()) {
    params = params.set('search', request.search.trim());
  }

  if (request.sort) {
    params = params.set('sort', `${request.sort.field},${request.sort.direction}`);
  }

  for (const [key, value] of Object.entries(request.filters)) {
    if (!isActiveFilterValue(value)) continue;
    params = params.set(`filter.${key}`, Array.isArray(value) ? value.join(',') : String(value));
  }

  return params;
}

/** Sıralama başlığına tıklandığında: yok → asc → desc → yok. */
export function cycleSort(current: SortSpec | null, field: string): SortSpec | null {
  if (current?.field !== field) return { field, direction: 'asc' };
  if (current.direction === 'asc') return { field, direction: 'desc' };
  return null;
}
