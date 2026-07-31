import { Params } from '@angular/router';

import {
  DEFAULT_PAGE_SIZE,
  FilterValue,
  PageRequest,
  SortDirection,
  createPageRequest,
  isActiveFilterValue,
} from '../../core/api/page-request';

/**
 * Liste sorgusu ↔ URL query parametresi dönüşümü.
 *
 * Şartname: "filtre state'i URL query parametreleriyle paylaşılabilir olmalıdır."
 * Böylece kullanıcı filtreli bir raporun bağlantısını meslektaşına gönderebilir.
 */

const RESERVED = new Set(['page', 'size', 'search', 'sort']);

export function pageRequestToParams(request: PageRequest): Params {
  const params: Params = {};

  if (request.page > 1) params['page'] = request.page;
  if (request.size !== DEFAULT_PAGE_SIZE) params['size'] = request.size;
  if (request.search.trim()) params['search'] = request.search.trim();
  if (request.sort) params['sort'] = `${request.sort.field},${request.sort.direction}`;

  for (const [key, value] of Object.entries(request.filters)) {
    if (!isActiveFilterValue(value)) continue;
    params[key] = Array.isArray(value) ? value.join(',') : String(value);
  }

  return params;
}

export function paramsToPageRequest(
  params: Params,
  filterKeys: readonly string[],
  defaults: Partial<PageRequest> = {},
): PageRequest {
  const filters: Record<string, FilterValue> = {};

  for (const key of filterKeys) {
    const raw = params[key];
    if (raw === undefined || raw === null || raw === '') continue;
    filters[key] = String(raw).includes(',') ? String(raw).split(',') : String(raw);
  }

  const [field, direction] = String(params['sort'] ?? '').split(',');

  return createPageRequest({
    ...defaults,
    page: toPositiveInt(params['page'], 1),
    size: toPositiveInt(params['size'], defaults.size ?? DEFAULT_PAGE_SIZE),
    search: String(params['search'] ?? ''),
    sort: field ? { field, direction: (direction as SortDirection) ?? 'asc' } : null,
    filters,
  });
}

/** URL'de tanınmayan parametreleri korur (derin bağlantılar bozulmasın). */
export function mergeUnknownParams(
  current: Params,
  next: Params,
  filterKeys: readonly string[],
): Params {
  const known = new Set([...RESERVED, ...filterKeys]);
  const preserved = Object.fromEntries(Object.entries(current).filter(([key]) => !known.has(key)));
  return { ...preserved, ...next };
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
