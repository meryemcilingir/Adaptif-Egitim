import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { BadgeTone } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import {
  CONTENT_PROGRESS_LABELS,
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  ContentProgressState,
} from '../../models/content-item.model';
import { LearningPath, LearningPathStep } from '../../models/learning-path.model';

/**
 * Öğrenme yolu zaman çizelgesi (stepper).
 *
 * Kazanım blokları hâlinde çizilir; her adım durumunu (tamamlandı / devam ediyor /
 * sıradaki / başlanmadı / kilitli) ve o durumun GEREKÇESİNİ gösterir (BR-16).
 * Kilitli adımlar tıklanamaz — hangi kazanımın eksik olduğu yazılır (BR-20).
 */
@Component({
  selector: 'app-learning-path-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppProgressBarComponent, AppStatusBadgeComponent],
  templateUrl: './learning-path-timeline.component.html',
  styleUrl: './learning-path-timeline.component.scss',
})
export class LearningPathTimelineComponent {
  readonly path = input.required<LearningPath>();
  /** Yalnızca devam edilebilir bölümleri göster (dashboard'da yer kazanmak için). */
  readonly compact = input(false);
  readonly stepSelect = output<LearningPathStep>();

  /**
   * Görüntülenecek bölümler.
   *
   * Kompakt modda öğrencinin BULUNDUĞU bölümden başlanır ve iki bölüm gösterilir.
   * Kilitli bölümleri baştan listelemek "şu an neredeyim" sorusunu yanıtlamaz;
   * bu yüzden geçerli adımın bölümü daima ilk sıradadır.
   */
  readonly sections = computed(() => {
    const path = this.path();
    if (!this.compact()) return path.sections;

    const currentId = path.currentStep?.contentId;
    const startIndex = currentId
      ? path.sections.findIndex((section) =>
          section.steps.some((step) => step.contentId === currentId),
        )
      : path.sections.findIndex((section) => section.state !== 'completed');

    if (startIndex < 0) return path.sections.slice(-1);
    return path.sections.slice(startIndex, startIndex + 2);
  });

  stateLabel(state: ContentProgressState): string {
    return CONTENT_PROGRESS_LABELS[state];
  }

  stateTone(state: ContentProgressState): BadgeTone {
    switch (state) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'primary';
      case 'recommended':
        return 'info';
      case 'locked':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  stepIcon(step: LearningPathStep): AppIconName {
    if (step.state === 'completed') return 'circle-check-big';
    if (step.state === 'locked') return 'lock';
    return CONTENT_TYPE_ICONS[step.type] as AppIconName;
  }

  typeLabel(step: LearningPathStep): string {
    return CONTENT_TYPE_LABELS[step.type];
  }

  onSelect(step: LearningPathStep): void {
    if (step.state === 'locked') return;
    this.stepSelect.emit(step);
  }
}
