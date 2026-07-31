import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { AppButtonComponent } from '../../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppProgressBarComponent } from '../../../../../shared/components/app-progress-bar/app-progress-bar.component';
import {
  toDonutSeries,
  toHeatmapSeries,
  toTimeCategories,
  toTimeSeries,
} from '../../../../../shared/utils/chart-adapters';
import { DashboardCommonComponent } from '../../../components/dashboard/dashboard-common.component';
import { KpiGridComponent } from '../../../components/dashboard/kpi-grid.component';
import { OutcomeHighlightListComponent } from '../../../components/dashboard/outcome-highlight-list.component';
import { ProgressGroupComponent } from '../../../components/dashboard/progress-group.component';
import { QuickActionsComponent } from '../../../components/dashboard/quick-actions.component';
import { RecentContentComponent } from '../../../components/dashboard/recent-content.component';
import { UpcomingExamsComponent } from '../../../components/dashboard/upcoming-exams.component';
import { AchievementGridComponent } from '../../../components/gamification/achievement-grid.component';
import { ContinueLearningCardComponent } from '../../../components/gamification/continue-learning-card.component';
import { DailyGoalCardComponent } from '../../../components/gamification/daily-goal-card.component';
import { StreakCardComponent } from '../../../components/gamification/streak-card.component';
import { XpProgressComponent } from '../../../components/gamification/xp-progress.component';
import { LearningPathTimelineComponent } from '../../../components/learning-path/learning-path-timeline.component';
import { RecommendationReasonCardComponent } from '../../../components/recommendation-reason-card/recommendation-reason-card.component';
import {
  DailyGoalTask,
  OutcomeHighlight,
  RecentContentEntry,
  StudentDashboard,
} from '../../../models/dashboard.model';
import { LearningPathStep } from '../../../models/learning-path.model';
import { Notification } from '../../../models/notification.model';
import { Recommendation } from '../../../models/recommendation.model';

/**
 * Öğrenci öğrenme paneli (Sprint 4).
 *
 * Sıralama bilinçlidir: önce "şimdi ne yapmalıyım" (hero + devam + günlük hedef),
 * sonra "nerede duruyorum" (yol, öneriler, haftalık ilerleme), en sonda
 * geçmiş ve motivasyon blokları.
 *
 * Tüm bloklar sunucudan hazır gelir; burada hesaplama YOKTUR — yalnızca grafik
 * adaptasyonu ve gezinme.
 */
@Component({
  selector: 'app-student-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AchievementGridComponent,
    AppButtonComponent,
    AppCardComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppProgressBarComponent,
    ContinueLearningCardComponent,
    DailyGoalCardComponent,
    DashboardCommonComponent,
    KpiGridComponent,
    LearningPathTimelineComponent,
    OutcomeHighlightListComponent,
    ProgressGroupComponent,
    QuickActionsComponent,
    RecentContentComponent,
    RecommendationReasonCardComponent,
    StreakCardComponent,
    UpcomingExamsComponent,
    XpProgressComponent,
  ],
  templateUrl: './student-dashboard.component.html',
  styleUrl: './student-dashboard.component.scss',
})
export class StudentDashboardComponent {
  private readonly router = inject(Router);

  readonly data = input.required<StudentDashboard>();
  readonly recommendationStart = output<Recommendation>();
  readonly notificationRead = output<Notification>();

  readonly masterySeries = computed(() =>
    toTimeSeries('Ortalama başarı', this.data().masteryTrend),
  );
  readonly masteryCategories = computed(() => toTimeCategories(this.data().masteryTrend));

  readonly distributionSeries = computed(() => toDonutSeries(this.data().outcomeDistribution));
  readonly distributionLabels = computed(() =>
    this.data().outcomeDistribution.map((entry) => entry.label),
  );

  readonly heatmapSeries = computed(() => toHeatmapSeries(this.data().masteryHeatmap));

  /** Haftalık çalışma: dakika (kolon) + tamamlanan içerik (çizgi) aynı grafikte. */
  readonly weeklySeries = computed(() => [
    {
      name: 'Çalışma süresi (dk)',
      data: this.data().weeklyProgress.days.map((day) => day.minutes),
    },
    {
      name: 'Tamamlanan içerik',
      data: this.data().weeklyProgress.days.map((day) => day.completedCount),
    },
  ]);

  readonly weeklyCategories = computed(() =>
    this.data().weeklyProgress.days.map((day) => day.label),
  );

  /* ── Gezinme ─────────────────────────────────────────────────────────── */

  openContent(contentId: string): void {
    void this.router.navigate(['/contents', contentId]);
  }

  openStep(step: LearningPathStep): void {
    this.openContent(step.contentId);
  }

  openTask(task: DailyGoalTask): void {
    this.openContent(task.contentId);
  }

  openRecentContent(entry: RecentContentEntry): void {
    this.openContent(entry.id);
  }

  openHighlight(entry: OutcomeHighlight): void {
    if (entry.targetContentId) this.openContent(entry.targetContentId);
  }

  openPath(): void {
    void this.router.navigate(['/learning/path']);
  }

  openExams(): void {
    void this.router.navigate(['/exams']);
  }

  openContents(): void {
    void this.router.navigate(['/contents']);
  }
}
