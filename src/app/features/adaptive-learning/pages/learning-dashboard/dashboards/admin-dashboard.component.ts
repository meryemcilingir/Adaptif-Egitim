import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { AppCardComponent } from '../../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppStatusBadgeComponent } from '../../../../../shared/components/app-status-badge/app-status-badge.component';
import {
  AppTimelineComponent,
  TimelineItem,
} from '../../../../../shared/components/app-timeline/app-timeline.component';
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
import { AdminDashboard, CardTone } from '../../../models/dashboard.model';
import { Notification } from '../../../models/notification.model';

/** Sistem sağlığı tonlarını rozet tonlarına eşler. */
const TONE_MAP: Readonly<
  Record<CardTone, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary'>
> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  primary: 'primary',
};

/**
 * Platform yöneticisi paneli.
 * Odak: kullanıcı dağılımı, denetim akışı, sistem sağlığı ve veri hacmi.
 */
@Component({
  selector: 'app-admin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppChartCardComponent,
    AppStatusBadgeComponent,
    AppTimelineComponent,
    DashboardCommonComponent,
    KpiGridComponent,
    QuickActionsComponent,
    RankedListComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent {
  private readonly router = inject(Router);

  readonly data = input.required<AdminDashboard>();
  readonly notificationRead = output<Notification>();

  readonly auditActionSeries = computed(() =>
    toBarSeries('İşlem sayısı', this.data().auditByAction),
  );
  readonly auditActionCategories = computed(() => toBarCategories(this.data().auditByAction));

  readonly auditTrendSeries = computed(() => toTimeSeries('Kayıt', this.data().auditTrend));
  readonly auditTrendCategories = computed(() => toTimeCategories(this.data().auditTrend));

  readonly auditTimeline = computed<TimelineItem[]>(() =>
    this.data().recentAudit.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      at: entry.at,
      icon: entry.icon,
      tone: entry.tone,
      actor: entry.actor,
    })),
  );

  badgeTone(tone: CardTone) {
    return TONE_MAP[tone];
  }

  openAuditLog(): void {
    void this.router.navigate(['/audit-log']);
  }
}
