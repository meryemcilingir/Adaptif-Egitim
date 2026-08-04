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
import { toTimeCategories, toTimeSeries } from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import { VelocityAnalytics, VelocityRow } from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Öğrenme hızı (§10).
 *
 * "Hız" burada BİRİM ZAMANDA TAMAMLANAN İÇERİKTİR, harcanan süre değil. Çok
 * zaman harcayan öğrenci hızlı değildir; az sürede çok kazanım tamamlayan
 * hızlıdır. Bu ayrım önemli çünkü "çok çalışan" ile "hızlı ilerleyen" farklı
 * müdahaleler gerektirir.
 */
@Component({
  selector: 'app-velocity-analytics-page',
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
  templateUrl: './velocity-analytics.page.html',
  styleUrl: './velocity-analytics.page.scss',
})
export class VelocityAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);

  private readonly data = signal<VelocityAnalytics | null>(null);
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

  readonly weeklySeries = computed(() =>
    toTimeSeries('Tamamlanan içerik', this.data()?.weeklyProgress ?? []),
  );
  readonly weeklyCategories = computed(() =>
    toTimeCategories(this.data()?.weeklyProgress ?? []),
  );

  readonly monthlySeries = computed(() =>
    toTimeSeries('Tamamlanan içerik', this.data()?.monthlyProgress ?? []),
  );
  readonly monthlyCategories = computed(() =>
    toTimeCategories(this.data()?.monthlyProgress ?? []),
  );

  readonly exportTable = computed<ExportTable | null>(() => {
    const report = this.data();
    if (!report) return null;

    return {
      fileName: 'ogrenme-hizi',
      columns: [
        'Öğrenci',
        'Haftalık içerik',
        'İçerik başına dakika',
        'Tamamlama %',
        'Ustalık %',
      ],
      rows: report.entries.map((row) => [
        row.studentName,
        row.itemsPerWeek,
        row.averageMinutesPerItem,
        row.completionRate,
        row.masteryPercent,
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.facade.load(this.facade.reports.velocity(this.facade.query()), {
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

  openStudent(row: VelocityRow): void {
    void this.router.navigate(['/student', row.studentId, 'analytics']);
  }
}
