import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';

import { ApiError } from '../../../../core/api/api-error';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AppBreadcrumbComponent } from '../../../../shared/components/app-breadcrumb/app-breadcrumb.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import {
  toBarCategories,
  toBarSeries,
  toTimeCategories,
  toTimeSeries,
} from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import {
  OUTCOME_STATUS_LABELS,
  OutcomeStatus,
  StudentAnalytics,
} from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Öğrenci analitiği (§2).
 *
 * On dört metrik tek ekranda. Aynı ekranı hem öğrencinin kendisi hem eğitmeni
 * kullanır; hangi verinin görüneceğine sunucu karar verir (§20), ekran ayrı bir
 * yol izlemez.
 */
@Component({
  selector: 'app-student-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppBreadcrumbComponent,
    AppCardComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppProgressBarComponent,
    AppStatusBadgeComponent,
    ReportHeaderComponent,
  ],
  templateUrl: './student-analytics.page.html',
  styleUrl: './student-analytics.page.scss',
})
export class StudentAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly data = signal<StudentAnalytics | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly report = this.data.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly isRefreshing = computed(() => this.status() === 'loading' && this.data() !== null);
  readonly hasError = computed(() => this.status() === 'error');

  readonly statusLabels = OUTCOME_STATUS_LABELS;

  /** `:me` yer tutucusu menüden gelir; oturumdaki kullanıcıya çevrilir. */
  readonly studentId = computed(() => {
    const raw = this.id();
    return raw === ':me' || raw === 'me' ? (this.auth.user()?.id ?? '') : raw;
  });

  readonly isSelf = computed(() => this.studentId() === this.auth.user()?.id);

  readonly breadcrumbs = computed(() =>
    this.isSelf()
      ? [{ label: 'Gelişimim' }]
      : [{ label: 'Analitik', link: '/analytics' }, { label: this.data()?.studentName ?? 'Öğrenci' }],
  );

  readonly filterDefinitions = computed(() => this.facade.definitionsFor(['courseId']));

  readonly isEmpty = computed(() => (this.data()?.meta.sampleSize ?? 0) === 0);

  /* ── Grafik serileri ───────────────────────────────────────────────────── */

  readonly weeklySeries = computed(() =>
    toTimeSeries('Haftalık çalışma (dk)', this.data()?.weeklyStudyMinutes ?? []),
  );
  readonly weeklyCategories = computed(() =>
    toTimeCategories(this.data()?.weeklyStudyMinutes ?? []),
  );

  readonly dailySeries = computed(() =>
    toTimeSeries('Günlük çalışma (dk)', this.data()?.dailyStudyMinutes ?? []),
  );
  readonly dailyCategories = computed(() =>
    toTimeCategories(this.data()?.dailyStudyMinutes ?? []),
  );

  readonly timeSeries = computed(() =>
    toBarSeries('Süre (dk)', this.data()?.timePerCourse ?? []),
  );
  readonly timeCategories = computed(() => toBarCategories(this.data()?.timePerCourse ?? []));

  readonly exportTable = computed<ExportTable | null>(() => {
    const report = this.data();
    if (!report) return null;

    return {
      fileName: `ogrenci-analizi-${report.studentId}`,
      columns: ['Kazanım', 'Başlık', 'Ders', 'Ustalık %', 'Cevap sayısı', 'Durum'],
      rows: report.outcomeProgress.map((row) => [
        row.outcomeCode,
        row.outcomeTitle,
        row.courseCode,
        row.masteryPercent,
        row.attemptCount,
        OUTCOME_STATUS_LABELS[row.status],
      ]),
    };
  });

  constructor() {
    // Rota parametresi değişince (başka öğrenciye geçiş) rapor tazelenir.
    effect(() => {
      const studentId = this.studentId();
      if (studentId) untracked(() => this.load());
    });
  }

  ngOnInit(): void {
    this.facade.loadReferences();
  }

  load(): void {
    const studentId = this.studentId();
    if (!studentId) return;

    this.facade.load(this.facade.reports.student(studentId, this.facade.query()), {
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

  /* ── Gösterim ──────────────────────────────────────────────────────────── */

  toneOf(status: OutcomeStatus): 'success' | 'warning' | 'danger' {
    switch (status) {
      case 'strong':
        return 'success';
      case 'average':
        return 'warning';
      default:
        return 'danger';
    }
  }

  /** Saat ve dakika — 480 dakika yerine "8 sa 0 dk". */
  formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours > 0 ? `${hours} sa ${rest} dk` : `${rest} dk`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  iconOf(name: string): AppIconName {
    return name as AppIconName;
  }

  openOutcome(outcomeId: string): void {
    void this.router.navigate(['/outcomes', outcomeId]);
  }

  openAttempt(): void {
    void this.router.navigate(['/attempts'], {
      queryParams: { studentId: this.studentId() },
    });
  }
}
