import { FilterValue, PageRequest, PageResponse } from '../../page-request';

/**
 * Server-side liste davranışını taklit eden sorgu motoru:
 * arama → filtre → sıralama → sayfalama.
 *
 * Her koleksiyon kendi alan eşlemesini verir; motorun kendisi domain bilmez (SRP).
 */

export type FilterPredicate<T> = (item: T, value: FilterValue) => boolean;
export type SortAccessor<T> = (item: T) => string | number | boolean | null;

export interface QueryConfig<T> {
  /** Serbest metin aramasının tarayacağı alanlar. */
  readonly searchable: (item: T) => readonly (string | null | undefined)[];
  /** `filters` anahtarı → yüklem. Tanımsız anahtarlar yok sayılır. */
  readonly filters: Readonly<Record<string, FilterPredicate<T>>>;
  /** Varsayılan dışında sıralanabilir alanlar. */
  readonly sorters?: Readonly<Record<string, SortAccessor<T>>>;
  readonly defaultSort?: { readonly field: string; readonly direction: 'asc' | 'desc' };
}

/** Aksan işaretleri (combining diacritical marks) — arama karşılaştırmasında yok sayılır. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Türkçe karakterleri de doğru karşılaştıran normalleştirme. */
export function normalize(value: string): string {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(COMBINING_MARKS, '').trim();
}

export function runQuery<T extends object>(
  source: readonly T[],
  request: PageRequest,
  config: QueryConfig<T>,
): PageResponse<T> {
  let items = [...source];

  items = applySearch(items, request.search, config);
  items = applyFilters(items, request, config);
  items = applySort(items, request, config);

  const total = items.length;
  const start = (request.page - 1) * request.size;

  return {
    items: items.slice(start, start + request.size),
    total,
    page: request.page,
    size: request.size,
  };
}

function applySearch<T>(items: T[], search: string, config: QueryConfig<T>): T[] {
  const term = normalize(search);
  if (!term) return items;

  return items.filter((item) =>
    config
      .searchable(item)
      .some((field) => field != null && normalize(String(field)).includes(term)),
  );
}

function applyFilters<T>(items: T[], request: PageRequest, config: QueryConfig<T>): T[] {
  return Object.entries(request.filters).reduce((result, [key, value]) => {
    const predicate = config.filters[key];
    if (!predicate || !isMeaningful(value)) return result;
    return result.filter((item) => predicate(item, value));
  }, items);
}

function applySort<T extends object>(
  items: T[],
  request: PageRequest,
  config: QueryConfig<T>,
): T[] {
  const sort = request.sort ?? config.defaultSort ?? null;
  if (!sort) return items;

  const accessor: SortAccessor<T> =
    config.sorters?.[sort.field] ?? ((item) => readPath(item, sort.field));
  const direction = sort.direction === 'desc' ? -1 : 1;

  return items.sort((a, b) => compare(accessor(a), accessor(b)) * direction);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return 1; // boş değerler her zaman sona
  if (b == null) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  return String(a).localeCompare(String(b), 'tr-TR', { numeric: true, sensitivity: 'base' });
}

function readPath(item: object, path: string): string | number | boolean | null {
  const value = path
    .split('.')
    .reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], item);

  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : null;
}

function isMeaningful(value: FilterValue): boolean {
  if (value === null || value === undefined || value === '') return false;
  return !Array.isArray(value) || value.length > 0;
}

/* ── Sık kullanılan yüklem üreticileri (tekrarı önler) ───────────────────── */

/** Çoklu seçim filtresi: değerlerden herhangi biri eşleşirse geçer. */
export function inList<T>(select: (item: T) => string | null): FilterPredicate<T> {
  return (item, value) => {
    const actual = select(item);
    if (actual === null) return false;
    return Array.isArray(value) ? value.includes(actual) : actual === String(value);
  };
}

export function equals<T>(select: (item: T) => string | null): FilterPredicate<T> {
  return (item, value) => select(item) === String(value);
}

export function includesId<T>(select: (item: T) => readonly string[]): FilterPredicate<T> {
  return (item, value) => {
    const ids = select(item);
    return Array.isArray(value) ? value.some((v) => ids.includes(v)) : ids.includes(String(value));
  };
}

export function booleanFlag<T>(select: (item: T) => boolean): FilterPredicate<T> {
  return (item, value) => select(item) === (value === true || value === 'true');
}

export function numberRange<T>(select: (item: T) => number): FilterPredicate<T> {
  return (item, value) => {
    const [min, max] = String(value).split(':');
    const actual = select(item);
    if (min && actual < Number(min)) return false;
    if (max && actual > Number(max)) return false;
    return true;
  };
}
