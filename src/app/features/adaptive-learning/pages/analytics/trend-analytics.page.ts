import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { ApiError } from '../../../../core/api/api-error';
import { AppChartCardComponent } from '../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { toTimeCategories, toTimeSeries } from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import { TimeSeriesPoint, TrendBundle } from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Trend analizleri (§8).
 *
 * Beş eğilim tek ekranda: çalışma süresi, sınav puanı, tamamlama, öneri ve
 * ustalık. Zaman aralığı ortak filtre çubuğundan gelir (7 / 30 / 90 gün).
 *
 * Her grafik AYNI zaman eksenini kullanır; farklı pencerelerde çizilen eğriler
 * yan yana konduğunda yanıltıcı olurdu.
 */
@Component({
  selector: 'app-trend-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    ReportHeaderComponent,
  ],
  templateUrl: './trend-analytics.page.html',
  styleUrl: './trend-analytics.page.scss',
})
export class TrendAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);

  private readonly data = signal<TrendBundle | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly report = this.data.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly isRefreshing = computed(() => this.status() === 'loading' && this.data() !== null);
  readonly hasError = computed(() => this.status() === 'error');

  readonly filterDefinitions = computed(() =>
    this.facade.definitionsFor(['programId', 'courseId', 'cohortId']),
  );

  readonly isEmpty = computed(() => (this.data()?.meta.sampleSize ?? 0) === 0);

  /** Tüm grafikler aynı kategori eksenini paylaşır. */
  readonly categories = computed(() => toTimeCategories(this.data()?.studyTime ?? []));

  readonly studySeries = computed(() =>
    toTimeSeries('Çalışma süresi (dk)', this.data()?.studyTime ?? []),
  );
  readonly scoreSeries = computed(() =>
    toTimeSeries('Ortalama puan (%)', this.data()?.examScore ?? []),
  );
  readonly completionSeries = computed(() =>
    toTimeSeries('Tamamlanan içerik', this.data()?.completion ?? []),
  );
  readonly recommendationSeries = computed(() =>
    toTimeSeries('Üretilen öneri', this.data()?.recommendations ?? []),
  );
  readonly masterySeries = computed(() =>
    toTimeSeries('Ortalama ustalık (%)', this.data()?.mastery ?? []),
  );

  readonly exportTable = computed<ExportTable | null>(() => {
    const report = this.data();
    if (!report) return null;

    const at = (points: readonly TimeSeriesPoint[], index: number) => points[index]?.value ?? '';

    return {
      fileName: 'trend-analizi',
      columns: ['Tarih', 'Çalışma (dk)', 'Sınav %', 'Tamamlanan', 'Öneri', 'Ustalık %'],
      rows: report.studyTime.map((point, index) => [
        point.date,
        point.value,
        at(report.examScore, index),
        at(report.completion, index),
        at(report.recommendations, index),
        at(report.mastery, index),
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.facade.load(this.facade.reports.trends(this.facade.query()), {
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
}
