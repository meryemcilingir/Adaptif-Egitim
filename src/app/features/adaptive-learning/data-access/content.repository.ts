import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import { CrudEndpoints, CrudRepository } from '../../../core/api/crud.repository';
import {
  BulkActionResult,
  ContentBulkAction,
  ContentCreateRequest,
  ContentDetail,
  ContentItem,
  ContentProgress,
  ContentProgressRequest,
} from '../models/content-item.model';
import { LearningPathOverview } from '../models/learning-path.model';
import { Recommendation } from '../models/recommendation.model';

/**
 * İçerik repository'si.
 *
 * Liste/detay/yazma/geçiş `CrudRepository`'den gelir; buraya içeriğe özgü
 * detay, ilerleme ve toplu işlem uç noktaları eklenir.
 */
@Injectable({ providedIn: 'root' })
export class ContentRepository extends CrudRepository<ContentItem, ContentCreateRequest> {
  protected readonly endpoints: CrudEndpoints = {
    list: API.contents.list,
    byId: API.contents.byId,
    transition: API.contents.transition,
  };

  detail(id: string): Observable<ContentDetail> {
    return this.api.get<ContentDetail>(API.contents.detail(id));
  }

  saveProgress(id: string, payload: ContentProgressRequest): Observable<ContentProgress> {
    return this.api.put<ContentProgress>(API.contents.progress(id), payload, { skipRetry: true });
  }

  bulk(ids: readonly string[], action: ContentBulkAction): Observable<BulkActionResult> {
    return this.api.post<BulkActionResult>(API.contents.bulk, { ids, action }, { skipRetry: true });
  }
}

/** Öğrenme yolu ve öneriler — türetilmiş, salt okunur veriler. */
@Injectable({ providedIn: 'root' })
export class LearningRepository {
  private readonly api = inject(ApiClient);

  path(params: { courseId?: string; studentId?: string } = {}): Observable<LearningPathOverview> {
    return this.api.get<LearningPathOverview>(API.learning.path, toQuery(params));
  }

  recommendations(
    params: { studentId?: string; limit?: number } = {},
  ): Observable<readonly Recommendation[]> {
    return this.api.get<readonly Recommendation[]>(API.learning.recommendations, toQuery(params));
  }
}

/** Tanımsız alanları sorgudan düşürür — boş parametre gönderilmez. */
function toQuery(params: Record<string, string | number | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  );
}
