import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import { PageRequest, PageResponse } from '../../../core/api/page-request';
import {
  AnalyticsOverview,
  CohortAnalytics,
  ComparisonResult,
  DifficultyAnalytics,
  MatrixData,
  OutcomeAnalytics,
  RecommendationAnalytics,
  SavedReport,
  StudentAnalytics,
  TrendBundle,
  VelocityAnalytics,
} from '../models/analytics.model';
import { ItemAnalysis } from '../models/item-analysis.model';
import { RangeSelection, resolveRange } from '../domain/analytics-range';
import { PerformerRow } from '../models/analytics.model';

/** Rapor isteklerinin ortak sorgu parametreleri (§14). */
export interface AnalyticsQuery {
  readonly range: RangeSelection;
  readonly selections: Readonly<Record<string, string>>;
}

/** Performans panosu yanıtı. */
export interface PerformerBoardResponse {
  readonly topPerformers: readonly PerformerRow[];
  readonly atRisk: readonly PerformerRow[];
  readonly atRiskCount: number;
  readonly measuredCount: number;
  readonly unmeasuredCount: number;
  readonly studentCount: number;
}

/**
 * Analitik repository'si.
 *
 * Tüm raporlar AYNI sorgu sözleşmesini kullanır (`AnalyticsQuery` → query
 * param'lar). Dönüşüm tek bir yerde yapılır; her ekranın kendi parametre adını
 * uydurması, sunucuyla ekran arasında sessiz uyumsuzluk yaratırdı.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsRepository {
  private readonly api = inject(ApiClient);

  overview(query: AnalyticsQuery): Observable<AnalyticsOverview> {
    return this.api.get<AnalyticsOverview>(API.analytics.overview, toParams(query));
  }

  student(studentId: string, query: AnalyticsQuery): Observable<StudentAnalytics> {
    return this.api.get<StudentAnalytics>(API.analytics.student(studentId), toParams(query));
  }

  cohort(cohortId: string, query: AnalyticsQuery): Observable<CohortAnalytics> {
    return this.api.get<CohortAnalytics>(API.analytics.cohortById(cohortId), toParams(query));
  }

  outcomes(query: AnalyticsQuery, page: PageRequest): Observable<PageResponse<OutcomeAnalytics>> {
    return this.api.getPage<OutcomeAnalytics>(API.analytics.outcomes, {
      ...page,
      filters: { ...page.filters, ...toParams(query) },
    });
  }

  masteryMatrix(query: AnalyticsQuery): Observable<MatrixData> {
    return this.api.get<MatrixData>(API.analytics.masteryMatrix, toParams(query));
  }

  difficulty(query: AnalyticsQuery): Observable<DifficultyAnalytics> {
    return this.api.get<DifficultyAnalytics>(API.analytics.difficulty, toParams(query));
  }

  trends(query: AnalyticsQuery): Observable<TrendBundle> {
    return this.api.get<TrendBundle>(API.analytics.trends, toParams(query));
  }

  recommendations(query: AnalyticsQuery): Observable<RecommendationAnalytics> {
    return this.api.get<RecommendationAnalytics>(
      API.analytics.recommendationPerformance,
      toParams(query),
    );
  }

  velocity(query: AnalyticsQuery): Observable<VelocityAnalytics> {
    return this.api.get<VelocityAnalytics>(API.analytics.velocity, toParams(query));
  }

  performers(query: AnalyticsQuery): Observable<PerformerBoardResponse> {
    return this.api.get<PerformerBoardResponse>(API.analytics.performers, toParams(query));
  }

  compare(
    kind: string,
    ids: readonly string[],
    query: AnalyticsQuery,
  ): Observable<ComparisonResult> {
    return this.api.get<ComparisonResult>(API.analytics.compare, {
      ...toParams(query),
      kind,
      ids: ids.join(','),
    });
  }

  items(page: PageRequest): Observable<PageResponse<ItemAnalysis>> {
    return this.api.getPage<ItemAnalysis>(API.analytics.itemAnalysis, page);
  }

  /* ── Kayıtlı raporlar ──────────────────────────────────────────────────── */

  savedReports(): Observable<readonly SavedReport[]> {
    return this.api.get<readonly SavedReport[]>(API.analytics.savedReports);
  }

  createReport(report: Partial<SavedReport>): Observable<SavedReport> {
    return this.api.post<SavedReport>(API.analytics.savedReports, report);
  }

  updateReport(id: string, report: Partial<SavedReport>): Observable<SavedReport> {
    return this.api.put<SavedReport>(API.analytics.savedReport(id), report);
  }

  deleteReport(id: string): Observable<void> {
    return this.api.delete<void>(API.analytics.savedReport(id));
  }
}

/**
 * Filtreleri query param'lara çevirir.
 *
 * Boş değerler ATLANIR: `courseId=` gibi boş bir parametre sunucuda "boş
 * kimlikli ders" araması gibi görünür ve sonucu sessizce boşaltırdı.
 */
export function toParams(query: AnalyticsQuery): Record<string, string> {
  const params: Record<string, string> = { preset: query.range.preset };

  if (query.range.preset === 'custom') {
    const resolved = resolveRange(query.range, Date.now());
    params['from'] = query.range.from ?? resolved.from.slice(0, 10);
    params['to'] = query.range.to ?? resolved.to.slice(0, 10);
  }

  for (const [key, value] of Object.entries(query.selections)) {
    if (value) params[key] = value;
  }

  return params;
}
