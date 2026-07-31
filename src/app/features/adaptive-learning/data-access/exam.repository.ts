import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API } from '../../../core/api/api-endpoints';
import { CrudEndpoints, CrudRepository } from '../../../core/api/crud.repository';
import {
  BlueprintCreateRequest,
  BlueprintDetail,
  ExamBlueprint,
} from '../models/blueprint.model';
import {
  ConstraintSnapshot,
  Exam,
  ExamCreateRequest,
  ExamDetail,
  ExamQuestionView,
} from '../models/exam.model';
import { SelectionShortfall } from '../domain/question-selector';

/** Soru listesini değiştiren uçların ortak yanıtı. */
export interface ExamQuestionsResponse {
  readonly exam: Exam;
  readonly questions: readonly ExamQuestionView[];
  readonly constraints: ConstraintSnapshot;
  readonly shortfalls?: readonly SelectionShortfall[];
  readonly addedCount?: number;
}

@Injectable({ providedIn: 'root' })
export class BlueprintRepository extends CrudRepository<ExamBlueprint, BlueprintCreateRequest> {
  protected readonly endpoints: CrudEndpoints = {
    list: API.blueprints.list,
    byId: API.blueprints.byId,
    transition: API.blueprints.transition,
  };

  detail(id: string): Observable<BlueprintDetail> {
    return this.api.get<BlueprintDetail>(API.blueprints.detail(id));
  }
}

/**
 * Sınav repository'si.
 *
 * Liste/detay/yazma/geçiş `CrudRepository`'den gelir; buraya sınava özgü
 * doğrulama, otomatik seçim, soru düzenleme ve kopyalama uçları eklenir.
 */
@Injectable({ providedIn: 'root' })
export class ExamRepository extends CrudRepository<Exam, ExamCreateRequest> {
  protected readonly endpoints: CrudEndpoints = {
    list: API.exams.list,
    byId: API.exams.byId,
    transition: API.exams.transition,
  };

  detail(id: string): Observable<ExamDetail> {
    return this.api.get<ExamDetail>(API.exams.detail(id));
  }

  /** Kaydedilmiş hâlin doğrulaması — sayfa yenilendiğinde tutarlılık için. */
  validate(id: string): Observable<ConstraintSnapshot> {
    return this.api.get<ConstraintSnapshot>(API.exams.validate(id), undefined, {
      skipLoading: true,
    });
  }

  /** Blueprint'e göre otomatik soru seçimi (BR-05). */
  autoSelect(id: string, replace: boolean): Observable<ExamQuestionsResponse> {
    return this.api.post<ExamQuestionsResponse>(
      API.exams.autoSelect(id),
      { replace },
      { skipRetry: true },
    );
  }

  /** Soru listesini elle günceller (ekleme, çıkarma, sıralama). */
  saveQuestions(id: string, questionIds: readonly string[]): Observable<ExamQuestionsResponse> {
    return this.api.put<ExamQuestionsResponse>(
      API.exams.questions(id),
      { questionIds },
      { skipRetry: true },
    );
  }

  /** `clone` sorularıyla, `duplicate` yalnızca iskeletle kopyalar. */
  duplicate(
    id: string,
    mode: 'clone' | 'duplicate',
    cohortIds?: readonly string[],
  ): Observable<Exam> {
    return this.api.post<Exam>(
      API.exams.duplicate(id),
      { mode, cohortIds },
      { skipRetry: true },
    );
  }
}
