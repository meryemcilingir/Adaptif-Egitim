import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { AppCardComponent } from '../../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppProgressBarComponent } from '../../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AppStatusBadgeComponent } from '../../../../../shared/components/app-status-badge/app-status-badge.component';
import { statusPresentation } from '../../../../../shared/utils/status-tone';
import {
  toBarCategories,
  toBarSeries,
  toDistributionCategories,
  toDistributionSeries,
  toHeatmapSeries,
  toMultiCategories,
  toMultiSeries,
} from '../../../../../shared/utils/chart-adapters';
import { DashboardCommonComponent } from '../../../components/dashboard/dashboard-common.component';
import { KpiGridComponent } from '../../../components/dashboard/kpi-grid.component';
import { ProgressGroupComponent } from '../../../components/dashboard/progress-group.component';
import { QuickActionsComponent } from '../../../components/dashboard/quick-actions.component';
import { UpcomingExamsComponent } from '../../../components/dashboard/upcoming-exams.component';
import { ProgramManagerDashboard, UpcomingExamCard } from '../../../models/dashboard.model';
import { Notification } from '../../../models/notification.model';

/**
 * Program yöneticisi paneli.
 * Odak: ders sağlığı, yayın hattı ve cohort karşılaştırması.
 */
@Component({
  selector: 'app-program-manager-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppChartCardComponent,
    AppProgressBarComponent,
    AppStatusBadgeComponent,
    DashboardCommonComponent,
    KpiGridComponent,
    ProgressGroupComponent,
    QuickActionsComponent,
    UpcomingExamsComponent,
  ],
  templateUrl: './program-manager-dashboard.component.html',
  styleUrl: './program-manager-dashboard.component.scss',
})
export class ProgramManagerDashboardComponent {
  private readonly router = inject(Router);

  readonly data = input.required<ProgramManagerDashboard>();
  readonly notificationRead = output<Notification>();

  readonly cohortSeries = computed(() =>
    toBarSeries('Ortalama ustalık', this.data().cohortComparison),
  );
  readonly cohortCategories = computed(() => toBarCategories(this.data().cohortComparison));

  readonly pipelineSeries = computed(() =>
    toDistributionSeries('Ders sayısı', this.data().publishPipeline),
  );
  readonly pipelineCategories = computed(() =>
    toDistributionCategories(this.data().publishPipeline),
  );

  readonly programDistributionSeries = computed(() =>
    toBarSeries('Ders sayısı', this.data().programDistribution),
  );
  readonly programDistributionCategories = computed(() =>
    toBarCategories(this.data().programDistribution),
  );

  readonly outcomeStatisticsSeries = computed(() =>
    toDistributionSeries('Kazanım sayısı', this.data().outcomeStatistics),
  );
  readonly outcomeStatisticsCategories = computed(() =>
    toDistributionCategories(this.data().outcomeStatistics),
  );

  readonly trendSeries = computed(() => toMultiSeries(this.data().programTrend));
  readonly trendCategories = computed(() => toMultiCategories(this.data().programTrend));

  readonly matrixSeries = computed(() => toHeatmapSeries(this.data().cohortMasteryMatrix));

  statusFor(state: string) {
    return statusPresentation(state);
  }

  openCourses(): void {
    void this.router.navigate(['/courses']);
  }

  /*
   * Program Yöneticisi'nin sınav YÖNETİM ekranına (`/exams`) erişimi yoktur
   * (RolesPermissions.md) — bu widget'taki tıklama tek bir sınavın salt-okunur
   * detayını açar, listeye değil.
   */
  openExam(exam: UpcomingExamCard): void {
    void this.router.navigate(['/exams', exam.id]);
  }
}
