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
import { Permission } from '../../../../core/auth/permission.model';
import { PermissionService } from '../../../../core/auth/permission.service';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { toTimeCategories, toTimeSeries } from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { InsightListComponent } from '../../components/analytics/insight-list.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import { AnalyticsInsight, AnalyticsOverview, PerformerRow } from '../../models/analytics.model';
import { drilldownLink } from '../../domain/drilldown-access';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Analitik genel bakış (§1).
 *
 * Kurumsal BI panellerinin düzenini izler: üstte filtre ve künye, sonra KPI
 * ızgarası, sonra kural tabanlı bulgular, en altta trendler ve performans
 * panoları. Sıra bilinçli — önce "ne durumdayız", sonra "neye bakmalıyım",
 * en sonda "kim".
 *
 * Her KPI tıklanabilir (§15): rakamın arkasındaki ekrana götürür.
 */
@Component({
  selector: 'app-analytics-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppCardComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    InsightListComponent,
    ReportHeaderComponent,
  ],
  templateUrl: './analytics-overview.page.html',
  styleUrl: './analytics-overview.page.scss',
})
export class AnalyticsOverviewPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);

  /*
   * Bireysel öğrenci kırılımları (performans panoları, eğilim grafikleri) yalnızca
   * cohort düzeyinde analitik iznine sahip rollere gösterilir. Öğrenci kendi
   * kapsamında (`own`) zaten yalnız kendi kaydını görür, ama panonun "kim
   * zorlanıyor" görünümü öğrenciye ANLAMSIZ ve kafa karıştırıcıdır — bu yüzden
   * doğrudan gizlenir.
   */
  readonly canSeeCohortDetail = computed(() => this.permissions.can('analytics:cohort'));

  private readonly data = signal<AnalyticsOverview | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  /*
   * Rapor sunucuda çağırandan bağımsız üretilir; içindeki "detaya git"
   * bağlantıları her rol için geçerli değildir. Yetkisi olmayan kullanıcıya
   * tıklanabilir bir ok göstermek onu /403'e düşürdüğü için, açılamayan
   * bağlantılar burada `null`'a çevrilir — şablon zaten `null` bağlantıyı
   * tıklanamaz çiziyor.
   */
  readonly report = computed<AnalyticsOverview | null>(() => {
    const report = this.data();
    if (!report) return null;

    const access = { can: (permission: Permission) => this.permissions.can(permission), role: this.permissions.role() };

    return {
      ...report,
      metrics: report.metrics.map((metric) => ({
        ...metric,
        link: drilldownLink(metric.link, access),
      })),
      insights: report.insights.map((insight) => ({
        ...insight,
        link: drilldownLink(insight.link, access),
      })),
    };
  });
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly isRefreshing = computed(() => this.status() === 'loading' && this.data() !== null);
  readonly hasError = computed(() => this.status() === 'error');

  readonly filterDefinitions = computed(() =>
    this.facade.definitionsFor(['programId', 'courseId', 'cohortId']),
  );

  /** Örneklem sıfırsa grafikler yerine anlamlı boş durum gösterilir (§24). */
  readonly isEmpty = computed(() => (this.data()?.meta.sampleSize ?? 0) === 0);

  readonly scoreSeries = computed(() =>
    toTimeSeries('Ortalama puan', this.data()?.scoreTrend ?? []),
  );
  readonly scoreCategories = computed(() => toTimeCategories(this.data()?.scoreTrend ?? []));

  readonly masterySeries = computed(() =>
    toTimeSeries('Ortalama ustalık', this.data()?.masteryTrend ?? []),
  );
  readonly masteryCategories = computed(() => toTimeCategories(this.data()?.masteryTrend ?? []));

  /** KPI kartlarını CSV'ye aktarılabilir tabloya çevirir (§16). */
  readonly exportTable = computed<ExportTable | null>(() => {
    const report = this.data();
    if (!report) return null;

    return {
      fileName: 'analitik-genel-bakis',
      columns: ['Gösterge', 'Değer', 'Birim', 'Önceki dönem', 'Değişim %'],
      rows: report.metrics.map((metric) => [
        metric.label,
        metric.value,
        metric.unit,
        metric.delta?.previous ?? '',
        metric.delta?.changePercent ?? '',
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.facade.load(this.facade.reports.overview(this.facade.query()), {
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

  /* ── Gezinme (drill-down) ──────────────────────────────────────────────── */

  openMetric(link: string | null): void {
    if (link) void this.router.navigate([link]);
  }

  openInsight(insight: AnalyticsInsight): void {
    if (insight.link) void this.router.navigate([insight.link]);
  }

  openStudent(row: PerformerRow): void {
    void this.router.navigate(['/student', row.studentId, 'analytics']);
  }

  /* ── Gösterim yardımcıları ─────────────────────────────────────────────── */

  iconOf(name: string): AppIconName {
    return name as AppIconName;
  }

  /**
   * Değişim yönü `direction` alanından okunur.
   *
   * `changePercent` MUTLAK değerdir; işaretine bakarak yön çıkarmak, her düşüşü
   * artış gibi göstermeye yol açar.
   */
  deltaIcon(direction: 'up' | 'down' | 'flat'): AppIconName {
    if (direction === 'up') return 'trending-up';
    if (direction === 'down') return 'trending-down';
    return 'arrow-right';
  }

  deltaPrefix(direction: 'up' | 'down' | 'flat'): string {
    if (direction === 'up') return '+';
    if (direction === 'down') return '−';
    return '';
  }
}
