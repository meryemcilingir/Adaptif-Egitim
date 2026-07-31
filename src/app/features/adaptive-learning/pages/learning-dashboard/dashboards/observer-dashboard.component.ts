import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { AppCardComponent } from '../../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppIconComponent } from '../../../../../shared/components/app-icon/app-icon.component';
import {
  toBarCategories,
  toBarSeries,
  toTimeCategories,
  toTimeSeries,
} from '../../../../../shared/utils/chart-adapters';
import { DashboardCommonComponent } from '../../../components/dashboard/dashboard-common.component';
import { KpiGridComponent } from '../../../components/dashboard/kpi-grid.component';
import { QuickActionsComponent } from '../../../components/dashboard/quick-actions.component';
import { RankedListComponent } from '../../../components/dashboard/ranked-list.component';
import { UpcomingExamsComponent } from '../../../components/dashboard/upcoming-exams.component';
import { ObserverDashboard } from '../../../models/dashboard.model';
import { Notification } from '../../../models/notification.model';

/**
 * Gözlemci paneli — salt okunur.
 * Gizlilik eşiği nedeniyle gizlenen gruplar açıkça bildirilir (BR-17).
 */
@Component({
  selector: 'app-observer-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppChartCardComponent,
    AppIconComponent,
    DashboardCommonComponent,
    KpiGridComponent,
    QuickActionsComponent,
    RankedListComponent,
    UpcomingExamsComponent,
  ],
  templateUrl: './observer-dashboard.component.html',
  styleUrl: './observer-dashboard.component.scss',
})
export class ObserverDashboardComponent {
  private readonly router = inject(Router);

  readonly data = input.required<ObserverDashboard>();
  readonly notificationRead = output<Notification>();

  readonly cohortSeries = computed(() =>
    toBarSeries('Ortalama ustalık', this.data().cohortComparison),
  );
  readonly cohortCategories = computed(() => toBarCategories(this.data().cohortComparison));

  readonly completionSeries = computed(() =>
    toTimeSeries('Ortalama başarı', this.data().completionTrend),
  );
  readonly completionCategories = computed(() => toTimeCategories(this.data().completionTrend));

  openExams(): void {
    void this.router.navigate(['/exams']);
  }
}
