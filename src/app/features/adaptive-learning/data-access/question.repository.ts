import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API } from '../../../core/api/api-endpoints';
import { CrudEndpoints, CrudRepository } from '../../../core/api/crud.repository';
import { BulkActionResult } from '../models/content-item.model';
import {
  Question,
  QuestionBulkAction,
  QuestionComment,
  QuestionCreateRequest,
  QuestionDetail,
  QuestionImportPreview,
  QuestionVersion,
} from '../models/question.model';

/** İki versiyonun ham hâli — karşılaştırma saf domain fonksiyonuyla yapılır. */
export interface VersionPair {
  readonly from: QuestionVersion;
  readonly to: QuestionVersion;
}

/**
 * Soru bankası repository'si.
 *
 * Liste/detay/yazma/geçiş `CrudRepository`'den gelir; buraya soruya özgü
 * versiyonlama, favori, kopyalama, yumuşak silme ve toplu işlem uçları eklenir.
 */
@Injectable({ providedIn: 'root' })
export class QuestionRepository extends CrudRepository<Question, QuestionCreateRequest> {
  protected readonly endpoints: CrudEndpoints = {
    list: API.questions.list,
    byId: API.questions.byId,
    transition: API.questions.transition,
  };

  detail(id: string): Observable<QuestionDetail> {
    return this.api.get<QuestionDetail>(API.questions.detail(id));
  }

  versions(id: string): Observable<readonly QuestionVersion[]> {
    return this.api.get<readonly QuestionVersion[]>(API.questions.versions(id));
  }

  compareVersions(id: string, from: number, to: number): Observable<VersionPair> {
    return this.api.get<VersionPair>(API.questions.compareVersions(id), { from, to });
  }

  /** Yayındaki soruyu yeniden düzenlenebilir kılar (BR-02). */
  createVersion(id: string, changeNote: string): Observable<Question> {
    return this.api.post<Question>(API.questions.versions(id), { changeNote }, { skipRetry: true });
  }

  duplicate(id: string): Observable<Question> {
    return this.api.post<Question>(API.questions.duplicate(id), {}, { skipRetry: true });
  }

  setFavorite(id: string, favorite: boolean): Observable<Question> {
    return this.api.put<Question>(
      API.questions.favorite(id),
      { favorite },
      { skipLoading: true, skipRetry: true },
    );
  }

  softDelete(id: string): Observable<Question> {
    return this.api.post<Question>(API.questions.softDelete(id), {}, { skipRetry: true });
  }

  restore(id: string): Observable<Question> {
    return this.api.post<Question>(API.questions.restore(id), {}, { skipRetry: true });
  }

  bulk(ids: readonly string[], action: QuestionBulkAction): Observable<BulkActionResult> {
    return this.api.post<BulkActionResult>(
      API.questions.bulk,
      { ids, action },
      { skipRetry: true },
    );
  }

  export(ids: readonly string[]): Observable<{ count: number; questions: readonly unknown[] }> {
    return this.api.post<{ count: number; questions: readonly unknown[] }>(
      API.questions.export,
      { ids },
      { skipRetry: true },
    );
  }

  importPreview(rows: readonly unknown[]): Observable<QuestionImportPreview> {
    return this.api.post<QuestionImportPreview>(
      API.questions.importPreview,
      { rows },
      { skipRetry: true },
    );
  }

  /* ── İnceleme akışı ────────────────────────────────────────────────────── */

  submitForReview(id: string, message: string): Observable<Question> {
    return this.api.post<Question>(API.questions.submitReview(id), { message }, { skipRetry: true });
  }

  resubmitForReview(id: string, message: string): Observable<Question> {
    return this.api.post<Question>(
      API.questions.resubmitReview(id),
      { message },
      { skipRetry: true },
    );
  }

  approve(id: string, message: string): Observable<Question> {
    return this.api.post<Question>(API.questions.approve(id), { message }, { skipRetry: true });
  }

  requestRevision(id: string, message: string): Observable<Question> {
    return this.api.post<Question>(
      API.questions.requestRevision(id),
      { message },
      { skipRetry: true },
    );
  }

  reject(id: string, message: string): Observable<Question> {
    return this.api.post<Question>(API.questions.reject(id), { message }, { skipRetry: true });
  }

  addComment(id: string, message: string): Observable<QuestionComment> {
    return this.api.post<QuestionComment>(
      API.questions.comments(id),
      { message },
      { skipRetry: true },
    );
  }
}
