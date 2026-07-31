import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { AppCardComponent } from '../../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppProgressBarComponent } from '../../../../../shared/components/app-progress-bar/app-progress-bar.component';
import {
  toDistributionCategories,
  toDistributionSeries,
  toMultiCategories,
  toMultiSeries,
} from '../../../../../shared/utils/chart-adapters';
import { DashboardCommonComponent } from '../../../components/dashboard/dashboard-common.component';
import { GradingQueueComponent } from '../../../components/dashboard/grading-queue.component';
import { KpiGridComponent } from '../../../components/dashboard/kpi-grid.component';
import { ProgressGroupComponent } from '../../../components/dashboard/progress-group.component';
import { QuickActionsComponent } from '../../../components/dashboard/quick-actions.component';
import { RankedListComponent } from '../../../components/dashboard/ranked-list.component';
import { UpcomingExamsComponent } from '../../../components/dashboard/upcoming-exams.component';
import { GradingQueueEntry, InstructorDashboard } from '../../../models/dashboard.model';
import { Notification } from '../../../models/notification.model';

/**
 * Eğitmen paneli.
 * Odak: değerlendirme kuyruğu, ders bazlı ilerleme ve risk altındaki öğrenciler.
 */
@Component({
  selector: 'app-instructor-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppChartCardComponent,
    AppProgressBarComponent,
    DashboardCommonComponent,
    GradingQueueComponent,
    KpiGridComponent,
    ProgressGroupComponent,
    QuickActionsComponent,
    RankedListComponent,
    UpcomingExamsComponent,
  ],
  templateUrl: './instructor-dashboard.component.html',
  styleUrl: './instructor-dashboard.component.scss',
})
export class InstructorDashboardComponent {
  private readonly router = inject(Router);

  readonly data = input.required<InstructorDashboard>();
  readonly notificationRead = output<Notification>();

  readonly performanceSeries = computed(() => toMultiSeries(this.data().classPerformance));
  readonly performanceCategories = computed(() => toMultiCategories(this.data().classPerformance));

  readonly questionStateSeries = computed(() =>
    toDistributionSeries('Soru sayısı', this.data().questionStates),
  );
  readonly questionStateCategories = computed(() =>
    toDistributionCategories(this.data().questionStates),
  );

  openGrading(entry?: GradingQueueEntry): void {
    void this.router.navigate(entry ? ['/grading', entry.attemptId] : ['/grading']);
  }

  openExams(): void {
    void this.router.navigate(['/exams']);
  }
}
