import { HttpRequest } from '@angular/common/http';

import { Permission, Role } from '../../auth/permission.model';
import { PageRequest, SortDirection } from '../page-request';
import { FakeDb } from './db/fake-db';

/**
 * Mock endpoint sözleşmesi.
 *
 * Open/Closed: her modül kendi handler dizisini dışa açar ve registry'ye eklenir;
 * merkezî bir `switch` büyümez. (ADR-005)
 */

export type MockMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Handler'ın gördüğü, kimliği doğrulanmış çağıran bilgisi. */
export interface MockCaller {
  readonly userId: string;
  readonly role: Role;
  readonly permissions: readonly Permission[];
  readonly courseIds: readonly string[];
  readonly cohortIds: readonly string[];
  readonly programId: string | null;
  can(permission: Permission): boolean;
}

export interface MockContext {
  readonly db: FakeDb;
  readonly request: HttpRequest<unknown>;
  /** `/api/courses/:id` içindeki `:id` gibi yol parametreleri. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  /** Query param'lardan çözülmüş liste sorgusu. */
  readonly page: PageRequest;
  readonly body: unknown;
  /** Oturum yoksa `null` — handler kendi 401'ini üretir ya da anonim davranır. */
  readonly caller: MockCaller | null;
  readonly now: number;
}

export interface MockResponse {
  readonly status: number;
  readonly body: unknown;
}

export type MockHandlerFn = (context: MockContext) => MockResponse | Promise<MockResponse>;

export interface MockHandler {
  readonly method: MockMethod;
  /** `:param` yer tutucuları desteklenir. */
  readonly path: string;
  readonly handle: MockHandlerFn;
}

interface CompiledHandler extends MockHandler {
  readonly pattern: RegExp;
  readonly paramNames: readonly string[];
}

export interface MatchedHandler {
  readonly handler: MockHandler;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * Yol eşleştirici. Kayıt sırası önemlidir: daha özgül yollar
 * (`/api/questions/bulk`) genel olanlardan (`/api/questions/:id`) ÖNCE gelmelidir.
 */
export class MockRouter {
  private readonly handlers: CompiledHandler[] = [];

  register(handlers: readonly MockHandler[]): this {
    for (const handler of handlers) {
      this.handlers.push({ ...handler, ...compile(handler.path) });
    }
    return this;
  }

  match(method: string, path: string): MatchedHandler | null {
    for (const handler of this.handlers) {
      if (handler.method !== method) continue;

      const match = handler.pattern.exec(path);
      if (!match) continue;

      const params: Record<string, string> = {};
      handler.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1] ?? '');
      });
      return { handler, params };
    }
    return null;
  }
}

function compile(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const source = path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return escapeRegExp(segment);
      paramNames.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');

  return { pattern: new RegExp(`^${source}$`), paramNames };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

/** Query param'lardan `PageRequest` üretir — `toHttpParams` ile simetriktir. */
export function parsePageRequest(query: URLSearchParams): PageRequest {
  const filters: Record<string, string | readonly string[]> = {};

  for (const [key, value] of query.entries()) {
    if (!key.startsWith('filter.')) continue;
    const name = key.slice('filter.'.length);
    filters[name] = value.includes(',') ? value.split(',') : value;
  }

  const sortRaw = query.get('sort');
  const [field, direction] = sortRaw?.split(',') ?? [];

  return {
    page: Number(query.get('page') ?? 1),
    size: Number(query.get('size') ?? 20),
    search: query.get('search') ?? '',
    sort: field ? { field, direction: (direction as SortDirection) ?? 'asc' } : null,
    filters,
  };
}

export const ok = (body: unknown): MockResponse => ({ status: 200, body });
export const created = (body: unknown): MockResponse => ({ status: 201, body });
export const noContent = (): MockResponse => ({ status: 204, body: null });
