import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

import { AppButtonComponent } from '../../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppStatusBadgeComponent } from '../../../../../shared/components/app-status-badge/app-status-badge.component';
import { statusPresentation } from '../../../../../shared/utils/status-tone';
import {
  toBarCategories,
  toBarSeries,
  toDistributionCategories,
  toDistributionSeries,
  toDonutSeries,
  toScatterSeries,
  toTimeCategories,
  toTimeSeries,
} from '../../../../../shared/utils/chart-adapters';
import { DashboardCommonComponent } from '../../../components/dashboard/dashboard-common.component';
import { KpiGridComponent } from '../../../components/dashboard/kpi-grid.component';
import { QuickActionsComponent } from '../../../components/dashboard/quick-actions.component';
import { RankedListComponent } from '../../../components/dashboard/ranked-list.component';
import { RankedEntry } from '../../../models/analytics.model';
import { MeasurementDashboard } from '../../../models/dashboard.model';
import { Notification } from '../../../models/notification.model';

/**
 * Ölçme uzmanı paneli.
 * Odak: madde kalitesi, zorluk/ayırt edicilik dağılımı ve blueprint kapsaması.
 */
@Component({
  selector: 'app-measurement-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppChartCardComponent,
    AppButtonComponent,
    AppEmptyStateComponent,
    AppStatusBadgeComponent,
    DashboardCommonComponent,
    KpiGridComponent,
    QuickActionsComponent,
    RankedListComponent,
  ],
  templateUrl: './measurement-dashboard.component.html',
  styleUrl: './measurement-dashboard.component.scss',
})
export class MeasurementDashboardComponent {
  private readonly router = inject(Router);

  readonly data = input.required<MeasurementDashboard>();
  readonly notificationRead = output<Notification>();

  readonly difficultySeries = computed(() =>
    toDistributionSeries('Madde sayısı', this.data().difficultyDistribution),
  );
  readonly difficultyCategories = computed(() =>
    toDistributionCategories(this.data().difficultyDistribution),
  );

  readonly discriminationSeries = computed(() =>
    toDistributionSeries('Madde sayısı', this.data().discriminationDistribution),
  );
  readonly discriminationCategories = computed(() =>
    toDistributionCategories(this.data().discriminationDistribution),
  );

  readonly scatterSeries = computed(() => toScatterSeries('Maddeler', this.data().itemScatter));

  /* ── Soru bankası grafikleri ─────────────────────────────────────────── */

  readonly typeSeries = computed(() => toDonutSeries(this.data().typeDistribution));
  readonly typeLabels = computed(() => this.data().typeDistribution.map((entry) => entry.label));

  readonly questionDifficultySeries = computed(() =>
    toBarSeries('Soru sayısı', this.data().questionDifficultyDistribution),
  );
  readonly questionDifficultyCategories = computed(() =>
    toBarCategories(this.data().questionDifficultyDistribution),
  );

  /** Panel kartlarındaki soru listeleri için ortak durum rozeti çözümü. */
  statusOf(state: string) {
    return statusPresentation(state);
  }

  openQuestionBank(): void {
    void this.router.navigate(['/question-bank']);
  }

  /**
   * Soru bankası sayaçları artık ilgili duruma FİLTRELENMİŞ görünüme götürür.
   * Hepsi aynı genel listeye gitmek yerine "Taslak" tıklanınca taslakları,
   * "Yayında" tıklanınca yayındakileri görmek işlevsel bir kart demektir.
   */
  openQuestionBankByState(state: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'): void {
    void this.router.navigate(['/question-bank'], { queryParams: { state } });
  }

  openQuestionBankFavorites(): void {
    void this.router.navigate(['/question-bank'], { queryParams: { favoriteOnly: 'true' } });
  }

  openNewQuestion(): void {
    void this.router.navigate(['/questions/new']);
  }

  openOutcome(entry: RankedEntry): void {
    void this.router.navigate(['/outcomes', entry.id]);
  }

  openBlueprint(entry: RankedEntry): void {
    void this.router.navigate(['/blueprints', entry.id]);
  }

  readonly qualitySeries = computed(() =>
    toTimeSeries('Ortalama ayırt edicilik', this.data().qualityTrend),
  );
  readonly qualityCategories = computed(() => toTimeCategories(this.data().qualityTrend));

  openItemAnalysis(): void {
    void this.router.navigate(['/item-analysis']);
  }

  openQuestion(questionId: string): void {
    void this.router.navigate(['/questions', questionId]);
  }
}
