import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import { PageRequest, PageResponse } from '../../../core/api/page-request';
import {
  Attempt,
  AttemptDetail,
  GradeAttemptRequest,
  GradingQueueItem,
  RegradeRequest,
  ResolveConflictRequest,
} from '../models/attempt.model';

/**
 * Değerlendirme repository'si.
 *
 * Kuyruk ve deneme detayı türetilmiş görünümlerdir; bu yüzden `CrudRepository`
 * yerine ince bir okuma/yazma yüzeyi yeterlidir.
 */
@Injectable({ providedIn: 'root' })
export class GradingRepository {
  private readonly api = inject(ApiClient);

  queue(request: PageRequest): Observable<PageResponse<GradingQueueItem>> {
    return this.api.getPage<GradingQueueItem>(API.grading.queue, request);
  }

  /** Hakemlik bekleyen denemeler — kuyrukla aynı satır şekli, farklı yetki. */
  conflicts(request: PageRequest): Observable<PageResponse<GradingQueueItem>> {
    return this.api.getPage<GradingQueueItem>(API.grading.conflicts, request);
  }

  attempts(request: PageRequest): Observable<PageResponse<Attempt>> {
    return this.api.getPage<Attempt>(API.attempts.list, request);
  }

  detail(attemptId: string): Observable<AttemptDetail> {
    return this.api.get<AttemptDetail>(API.attempts.detail(attemptId));
  }

  grade(attemptId: string, request: GradeAttemptRequest): Observable<Attempt> {
    return this.api.put<Attempt>(API.attempts.grade(attemptId), request);
  }

  regrade(attemptId: string, request: RegradeRequest): Observable<Attempt> {
    return this.api.post<Attempt>(API.attempts.regrade(attemptId), request);
  }

  resolveConflict(attemptId: string, request: ResolveConflictRequest): Observable<Attempt> {
    return this.api.post<Attempt>(API.attempts.resolveConflict(attemptId), request);
  }

  release(attemptId: string): Observable<Attempt> {
    return this.api.post<Attempt>(API.attempts.release(attemptId), {});
  }
}
