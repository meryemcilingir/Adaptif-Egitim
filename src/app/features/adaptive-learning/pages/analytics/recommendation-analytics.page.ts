import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { ApiError } from '../../../../core/api/api-error';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import {
  toBarCategories,
  toBarSeries,
  toDonutSeries,
  toTimeCategories,
  toTimeSeries,
} from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import { RECOMMENDATION_RULE_LABELS } from '../../models/recommendation.model';
import { RecommendationAnalytics } from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Öneri motoru analitiği (§9).
 *
 * Kabul oranı, motorun kendi hakkında verdiği bir not DEĞİLDİR: öneri sonrası
 * içeriğin açılıp açılmadığından ölçülür. Ekran bunu açıkça yazar, çünkü
 * "kabul" kelimesi kolayca bir onay kutusu gibi anlaşılabilir.
 */
@Component({
  selector: 'app-recommendation-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppCardComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppProgressBarComponent,
    ReportHeaderComponent,
  ],
  templateUrl: './recommendation-analytics.page.html',
  styleUrl: './recommendation-analytics.page.scss',
})
export class RecommendationAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);

  private readonly data = signal<RecommendationAnalytics | null>(null);
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

  readonly isEmpty = computed(() => (this.data()?.total ?? 0) === 0);

  readonly stateSeries = computed(() => toDonutSeries(this.data()?.byState ?? []));
  readonly stateLabels = computed(() => (this.data()?.byState ?? []).map((item) => item.label));

  /** Kural kodları okunabilir etiketlere çevrilir. */
  readonly reasonValues = computed(() =>
    (this.data()?.byReason ?? []).map((item) => ({
      label: RECOMMENDATION_RULE_LABELS[item.label as keyof typeof RECOMMENDATION_RULE_LABELS]
        ?? item.label,
      value: item.value,
    })),
  );

  readonly reasonSeries = computed(() => toBarSeries('Öneri sayısı', this.reasonValues()));
  readonly reasonCategories = computed(() => toBarCategories(this.reasonValues()));

  readonly trendSeries = computed(() =>
    toTimeSeries('Üretilen öneri', this.data()?.trend ?? []),
  );
  readonly trendCategories = computed(() => toTimeCategories(this.data()?.trend ?? []));

  readonly exportTable = computed<ExportTable | null>(() => {
    const report = this.data();
    if (!report) return null;

    return {
      fileName: 'oneri-analizi',
      columns: ['İçerik', 'Öneri sayısı', 'Açılma durumu'],
      rows: report.mostRecommended.map((entry) => [entry.label, entry.value, entry.sublabel]),
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.facade.load(this.facade.reports.recommendations(this.facade.query()), {
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

  /** En çok işe yarayan kural — açılma oranı en yüksek gerekçe. */
  readonly topReason = computed(() => this.reasonValues()[0]?.label ?? '—');
}
