import { inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PublishState } from '../../features/adaptive-learning/models/common.model';
import { ApiClient } from './api-client';
import { PageRequest, PageResponse } from './page-request';

export interface CrudEndpoints {
  readonly list: string;
  readonly byId: (id: string) => string;
  readonly transition: (id: string) => string;
}

/**
 * Durum alanı taşıyan varlıklar için ortak HTTP sözleşmesi.
 *
 * Program, ders ve kazanım repository'leri yalnızca `endpoints` tanımlar; liste,
 * detay, oluşturma, güncelleme, silme ve durum geçişi çağrıları burada bir kez
 * yazılır (DRY). Endpoint bilgisi bu katmanda biter — facade URL bilmez.
 */
export abstract class CrudRepository<TEntity, TWrite> {
  protected readonly api = inject(ApiClient);
  protected abstract readonly endpoints: CrudEndpoints;

  list(request: PageRequest): Observable<PageResponse<TEntity>> {
    return this.api.getPage<TEntity>(this.endpoints.list, request);
  }

  get(id: string): Observable<TEntity> {
    return this.api.get<TEntity>(this.endpoints.byId(id));
  }

  create(payload: TWrite): Observable<TEntity> {
    return this.api.post<TEntity>(this.endpoints.list, payload, { skipRetry: true });
  }

  /**
   * `expectedVersion` iyimser kilitleme içindir: sunucudaki sürüm farklıysa
   * 409 döner ve kullanıcının değişikliği sessizce ezilmez.
   */
  update(id: string, payload: TWrite, expectedVersion: number): Observable<TEntity> {
    return this.api.put<TEntity>(
      this.endpoints.byId(id),
      { ...payload, expectedVersion },
      { skipRetry: true },
    );
  }

  remove(id: string): Observable<void> {
    return this.api.delete<void>(this.endpoints.byId(id), { skipRetry: true });
  }

  transition(id: string, state: PublishState, reason?: string): Observable<TEntity> {
    return this.api.post<TEntity>(
      this.endpoints.transition(id),
      { state, reason: reason ?? null },
      { skipRetry: true },
    );
  }
}
