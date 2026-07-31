import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import { CrudEndpoints, CrudRepository } from '../../../core/api/crud.repository';
import { CohortSummary, Term } from '../models/common.model';
import { Course, CourseCreateRequest } from '../models/course.model';
import {
  LearningOutcome,
  OutcomeCreateRequest,
  OutcomeGraph,
} from '../models/learning-outcome.model';
import { Program, ProgramCreateRequest } from '../models/program.model';
import { UserSummary } from '../models/user.model';

/**
 * Katalog repository'leri.
 *
 * Üçü de `CrudRepository`'den yalnızca `endpoints` tanımlayarak türer; liste,
 * detay, yazma ve durum geçişi çağrıları tek yerde yazılmıştır (DRY).
 * Varlığa özgü ek uç noktalar (grafik, önkoşul) ilgili sınıfa eklenir.
 */

@Injectable({ providedIn: 'root' })
export class ProgramRepository extends CrudRepository<Program, ProgramCreateRequest> {
  protected readonly endpoints: CrudEndpoints = {
    list: API.programs.list,
    byId: API.programs.byId,
    transition: API.programs.transition,
  };
}

@Injectable({ providedIn: 'root' })
export class CourseRepository extends CrudRepository<Course, CourseCreateRequest> {
  protected readonly endpoints: CrudEndpoints = {
    list: API.courses.list,
    byId: API.courses.byId,
    transition: API.courses.transition,
  };
}

export interface PrerequisiteView {
  readonly prerequisites: readonly LearningOutcome[];
  readonly dependents: readonly LearningOutcome[];
}

export interface CycleCheckResult {
  readonly valid: boolean;
  readonly candidateId: string | null;
  /** Döngü yolu, kazanım KODLARIYLA (kullanıcıya doğrudan gösterilir). */
  readonly path: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class OutcomeRepository extends CrudRepository<LearningOutcome, OutcomeCreateRequest> {
  protected readonly endpoints: CrudEndpoints = {
    list: API.outcomes.list,
    byId: API.outcomes.byId,
    transition: API.outcomes.transition,
  };

  graph(courseId: string | null): Observable<OutcomeGraph> {
    return this.api.get<OutcomeGraph>(API.outcomes.graph, courseId ? { courseId } : undefined);
  }

  prerequisites(outcomeId: string): Observable<PrerequisiteView> {
    return this.api.get<PrerequisiteView>(API.outcomes.prerequisites(outcomeId));
  }

  savePrerequisites(
    outcomeId: string,
    prerequisiteIds: readonly string[],
  ): Observable<LearningOutcome> {
    return this.api.put<LearningOutcome>(
      API.outcomes.prerequisites(outcomeId),
      { prerequisiteIds },
      { skipRetry: true },
    );
  }

  /** Kaydetmeden önce döngü kontrolü — form anında geri bildirim verebilsin diye. */
  checkCycle(outcomeId: string, prerequisiteIds: readonly string[]): Observable<CycleCheckResult> {
    return this.api.post<CycleCheckResult>(
      API.outcomes.validateGraph,
      { outcomeId, prerequisiteIds },
      { skipLoading: true, skipRetry: true },
    );
  }
}

/** Form açılır listeleri için referans veriler. */
@Injectable({ providedIn: 'root' })
export class ReferenceRepository {
  private readonly api = inject(ApiClient);

  terms(): Observable<readonly Term[]> {
    return this.api.get<readonly Term[]>(API.reference.terms);
  }

  cohorts(programId?: string): Observable<readonly CohortSummary[]> {
    return this.api.get<readonly CohortSummary[]>(
      API.reference.cohorts,
      programId ? { programId } : undefined,
    );
  }

  staff(role?: string): Observable<readonly UserSummary[]> {
    return this.api.get<readonly UserSummary[]>(API.reference.staff, role ? { role } : undefined);
  }
}
