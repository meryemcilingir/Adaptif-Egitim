import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { ApiError } from '../../../../core/api/api-error';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import {
  toDistributionCategories,
  toDistributionSeries,
  toTimeCategories,
  toTimeSeries,
} from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import { CohortAnalytics, PerformerRow } from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Grup analitiği (§3).
 *
 * Grup, filtre çubuğundan seçilir; ayrı bir rota parametresi yoktur. Böylece
 * kullanıcı gruplar arasında geçerken filtre bağlamını (dönem, program)
 * kaybetmez.
 *
 * Ortalamanın yanında medyan ve standart sapma da verilir: ortalaması 65 olan
 * bir grup, sapması 25 ise "orta seviye" değil İKİYE AYRILMIŞ bir gruptur ve
 * bambaşka bir müdahale gerektirir.
 */
@Component({
  selector: 'app-cohort-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppCardComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    ReportHeaderComponent,
  ],
  templateUrl: './cohort-analytics.page.html',
  styleUrl: './cohort-analytics.page.scss',
})
export class CohortAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);

  private readonly data = signal<CohortAnalytics | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly report = this.data.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly isRefreshing = computed(() => this.status() === 'loading' && this.data() !== null);
  readonly hasError = computed(() => this.status() === 'error');

  readonly filterDefinitions = computed(() =>
    this.facade.definitionsFor(['programId', 'cohortId', 'courseId']),
  );

  /** Grup seçilmeden rapor üretilemez; kullanıcı yönlendirilir. */
  readonly selectedCohortId = computed(() => this.facade.filters().selections['cohortId'] ?? '');
  readonly hasSelection = computed(() => this.selectedCohortId().length > 0);

  readonly isEmpty = computed(() => (this.data()?.meta.sampleSize ?? 0) === 0);

  /* ── Grafik serileri ───────────────────────────────────────────────────── */

  readonly scoreDistSeries = computed(() =>
    toDistributionSeries('Öğrenci sayısı', this.data()?.scoreDistribution ?? []),
  );
  readonly scoreDistCategories = computed(() =>
    toDistributionCategories(this.data()?.scoreDistribution ?? []),
  );

  readonly gradeDistSeries = computed(() =>
    toDistributionSeries('Öğrenci sayısı', this.data()?.gradeDistribution ?? []),
  );
  readonly gradeDistCategories = computed(() =>
    toDistributionCategories(this.data()?.gradeDistribution ?? []),
  );

  readonly masteryDistSeries = computed(() =>
    toDistributionSeries('Öğrenci sayısı', this.data()?.masteryDistribution ?? []),
  );
  readonly masteryDistCategories = computed(() =>
    toDistributionCategories(this.data()?.masteryDistribution ?? []),
  );

  readonly trendSeries = computed(() =>
    toTimeSeries('Haftalık ortalama', this.data()?.weeklyTrend ?? []),
  );
  readonly trendCategories = computed(() => toTimeCategories(this.data()?.weeklyTrend ?? []));

  readonly exportTable = computed<ExportTable | null>(() => {
    const report = this.data();
    if (!report) return null;

    return {
      fileName: `grup-analizi-${report.cohortId}`,
      columns: ['Öğrenci', 'Ustalık %', 'Sınav ortalaması %', 'Tamamlama %', 'Risk gerekçeleri'],
      rows: report.students.map((row) => [
        row.studentName,
        row.masteryPercent,
        row.examAveragePercent,
        row.completionRate,
        row.riskReasons.join(' / '),
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    if (this.hasSelection()) this.load();
  }

  load(): void {
    const cohortId = this.selectedCohortId();
    if (!cohortId) {
      this.data.set(null);
      this.status.set('idle');
      return;
    }

    this.facade.load(this.facade.reports.cohort(cohortId, this.facade.query()), {
      data: this.data,
      status: this.status,
      error: this.errorState,
    });
  }

  onFilterChange(value: AnalyticsFilterValue): void {
    this.facade.setFilters(value);
  }

  onApply(): void {
    this.load();
  }

  onReset(): void {
    this.facade.resetFilters();
    this.data.set(null);
    this.status.set('idle');
  }

  /** Öğrenci satırından bireysel analize iner (§15). */
  openStudent(row: PerformerRow): void {
    void this.router.navigate(['/student', row.studentId, 'analytics']);
  }

  /**
   * Dağılımın ne kadar dengeli olduğunu anlatan kısa yorum.
   *
   * Standart sapmayı tek başına göstermek çoğu okuyucuya bir şey söylemez;
   * sayının ne anlama geldiği yazılır.
   */
  spreadNote(standardDeviation: number): string {
    if (standardDeviation < 10) return 'Grup homojen; puanlar birbirine yakın.';
    if (standardDeviation < 20) return 'Orta düzeyde dağılım.';
    return 'Yüksek dağılım; grup içinde belirgin seviye farkı var.';
  }
}
