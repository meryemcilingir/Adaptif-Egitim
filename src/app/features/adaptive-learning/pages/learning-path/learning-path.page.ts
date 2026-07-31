import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import {
  AppTabsComponent,
  TabItem,
} from '../../../../shared/components/app-tabs/app-tabs.component';
import { LearningPathTimelineComponent } from '../../components/learning-path/learning-path-timeline.component';
import { RecommendationReasonCardComponent } from '../../components/recommendation-reason-card/recommendation-reason-card.component';
import { LearningPathStep } from '../../models/learning-path.model';
import { Recommendation } from '../../models/recommendation.model';
import { LearningPathFacade } from '../../data-access/learning-path.facade';

/**
 * Öğrenme yolu ekranı.
 *
 * Yol ve öneriler sunucuda TÜRETİLİR (`learning-context`); bu sayfa yalnızca
 * gösterir ve gezinmeyi yönetir. Ders sekmeleri arasında geçiş yeni istek
 * gerektirmez — tüm yollar tek çağrıda gelir.
 */
@Component({
  selector: 'app-learning-path-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    AppProgressBarComponent,
    AppTabsComponent,
    LearningPathTimelineComponent,
    RecommendationReasonCardComponent,
  ],
  templateUrl: './learning-path.page.html',
  styleUrl: './learning-path.page.scss',
})
export class LearningPathPage implements OnInit {
  protected readonly facade = inject(LearningPathFacade);
  private readonly router = inject(Router);

  readonly tabs = computed<readonly TabItem[]>(() =>
    this.facade.courseOptions().map((option) => ({
      id: option.id,
      label: option.code,
      count: option.completionPercent,
    })),
  );

  readonly activeTabId = computed(() => this.facade.activePath()?.courseId ?? '');

  readonly summary = computed(() => {
    const paths = this.facade.paths();
    const totalSteps = paths.reduce(
      (sum, path) => sum + path.sections.reduce((count, section) => count + section.totalSteps, 0),
      0,
    );
    const completedSteps = paths.reduce(
      (sum, path) =>
        sum + path.sections.reduce((count, section) => count + section.completedSteps, 0),
      0,
    );
    const totalMinutes = paths.reduce((sum, path) => sum + path.totalMinutes, 0);
    const completedMinutes = paths.reduce((sum, path) => sum + path.completedMinutes, 0);

    return {
      courseCount: paths.length,
      totalSteps,
      completedSteps,
      totalMinutes,
      completedMinutes,
      completionPercent: totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0,
    };
  });

  ngOnInit(): void {
    this.facade.load();
    this.facade.loadRecommendations();
  }

  reload(): void {
    this.facade.load();
    this.facade.loadRecommendations();
  }

  onTabChange(courseId: string): void {
    this.facade.selectCourse(courseId);
  }

  openStep(step: LearningPathStep): void {
    void this.router.navigate(['/contents', step.contentId]);
  }

  /** Öneri kartındaki "Çalışmaya başla" — içerik önerisi içeriğe, kazanım önerisi listeye gider. */
  startRecommendation(recommendation: Recommendation): void {
    if (recommendation.kind === 'content') {
      void this.router.navigate(['/contents', recommendation.targetId]);
      return;
    }
    void this.router.navigate(['/contents'], {
      queryParams: { 'filter.outcomeId': recommendation.outcomeId },
    });
  }

  continueCurrent(): void {
    const step = this.facade.activePath()?.currentStep;
    if (step) this.openStep(step);
  }
}
