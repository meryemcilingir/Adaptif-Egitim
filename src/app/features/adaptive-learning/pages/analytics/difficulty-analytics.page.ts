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
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppChartCardComponent } from '../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import {
  toBarCategories,
  toBarSeries,
  toDonutSeries,
  toMultiCategories,
  toMultiSeries,
  toScatterSeries,
  toTimeCategories,
  toTimeSeries,
} from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import { DifficultyAnalytics } from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Soru zorluk analizi (§6).
 *
 * İki farklı "zorluk" birlikte gösterilir: soruyu yazanın BEYAN ETTİĞİ zorluk
 * ile öğrencilerin cevaplarından ÖLÇÜLEN zorluk. Aradaki fark, soru yazarına
 * doğrudan geri bildirimdir.
 *
 * Saçılım grafiği madde kalitesi haritasıdır: yatayda ölçülen zorluk, dikeyde
 * ayırt edicilik. Sol alt köşedeki maddeler gözden geçirilmelidir.
 */
@Component({
  selector: 'app-difficulty-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppButtonComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    ReportHeaderComponent,
  ],
  templateUrl: './difficulty-analytics.page.html',
  styleUrl: './difficulty-analytics.page.scss',
})
export class DifficultyAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);

  private readonly data = signal<DifficultyAnalytics | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly report = this.data.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly isRefreshing = computed(() => this.status() === 'loading' && this.data() !== null);
  readonly hasError = computed(() => this.status() === 'error');

  readonly filterDefinitions = computed(() =>
    this.facade.definitionsFor(['programId', 'courseId']),
  );

  readonly isEmpty = computed(() => (this.data()?.meta.sampleSize ?? 0) === 0);

  /* ── Grafik serileri ───────────────────────────────────────────────────── */

  readonly distributionSeries = computed(() =>
    toDonutSeries(this.data()?.distribution ?? []),
  );
  readonly distributionLabels = computed(() =>
    (this.data()?.distribution ?? []).map((item) => item.label),
  );

  readonly trendSeries = computed(() => {
    const trend = this.data()?.trend ?? [];
    return trend.length > 0 ? toTimeSeries(trend[0].name, trend[0].points) : [];
  });
  readonly trendCategories = computed(() => {
    const trend = this.data()?.trend ?? [];
    return trend.length > 0 ? toTimeCategories(trend[0].points) : [];
  });

  readonly courseSeries = computed(() => toMultiSeries(this.data()?.byCourse ?? []));
  readonly courseCategories = computed(() => toMultiCategories(this.data()?.byCourse ?? []));

  readonly outcomeSeries = computed(() =>
    toBarSeries('Doğru cevap oranı (%)', this.data()?.byOutcome ?? []),
  );
  readonly outcomeCategories = computed(() => toBarCategories(this.data()?.byOutcome ?? []));

  readonly scatterSeries = computed(() =>
    toScatterSeries('Maddeler', this.data()?.scatter ?? []),
  );

  readonly exportTable = computed<ExportTable | null>(() => {
    const report = this.data();
    if (!report) return null;

    return {
      fileName: 'zorluk-analizi',
      columns: ['Soru kodu', 'Ölçülen zorluk %', 'Ayırt edicilik %'],
      rows: report.scatter.map((point) => [point.label, point.x, point.y]),
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.facade.load(this.facade.reports.difficulty(this.facade.query()), {
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
    this.load();
  }

  /** Zorluk grafiğinden soru listesine iner (§15). */
  openItems(): void {
    void this.router.navigate(['/item-analysis']);
  }
}
