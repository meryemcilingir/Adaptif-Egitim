import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { COGNITIVE_LEVEL_LABELS, DIFFICULTY_LABELS } from '../../models/common.model';
import { QUESTION_TYPE_META, Question } from '../../models/question.model';

/**
 * Soru bilgi rozetleri: tür · zorluk · durum · Bloom · kazanım · versiyon.
 *
 * Liste ve detay ekranları aynı bileşeni kullanır; böylece rozet sırası ve
 * renkleri tek yerde tanımlıdır. Sade tutulur — okunabilirlik önceliklidir.
 */
@Component({
  selector: 'app-question-badges',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppStatusBadgeComponent],
  template: `
    <div class="badges">
      <span class="badge badge--type" [title]="typeLabel()">{{ typeShort() }}</span>
      <span class="badge" [class]="'badge--' + question().difficulty">{{ difficultyLabel() }}</span>

      <app-status-badge
        [label]="status().label"
        [tone]="status().tone"
        [icon]="status().icon"
        [subtle]="true"
      />

      @if (showDetails()) {
        <span class="badge">Bloom: {{ levelLabel() }}</span>
        @if (outcomeCode(); as code) {
          <span class="badge">Kazanım: {{ code }}</span>
        }
      }

      <span class="badge badge--version">v{{ question().versionNumber }}</span>
    </div>
  `,
  styleUrl: './question-badges.component.scss',
})
export class QuestionBadgesComponent {
  readonly question = input.required<Question>();
  /** Bağlı kazanımın kodu — liste bunu ayrıca çözer, detayda hazır gelir. */
  readonly outcomeCode = input<string | null>(null);
  /** Dar alanlarda (tablo hücresi) Bloom ve kazanım gizlenir. */
  readonly showDetails = input(true);

  readonly typeLabel = computed(() => QUESTION_TYPE_META[this.question().type].label);
  readonly typeShort = computed(() => QUESTION_TYPE_META[this.question().type].shortLabel);
  readonly difficultyLabel = computed(() => DIFFICULTY_LABELS[this.question().difficulty]);
  readonly levelLabel = computed(() => COGNITIVE_LEVEL_LABELS[this.question().level]);
  readonly status = computed(() => statusPresentation(this.question().state));
}
