import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { ContinueLearningCard } from '../../models/dashboard.model';

/** "Kaldığın yerden devam et" kartı — öğrencinin tek tıkla döneceği nokta. */
@Component({
  selector: 'app-continue-learning-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent, AppProgressBarComponent, RelativeTimePipe],
  template: `
    @let data = card();

    <div class="continue">
      <div class="continue__icon">
        <app-icon [name]="data.icon" [size]="20" />
      </div>

      <div class="continue__body">
        <span class="text-overline text-muted">
          {{ data.courseCode }} · {{ data.outcomeCode }}
        </span>
        <p class="text-body-strong clamp-2">{{ data.title }}</p>
        <p class="text-xs text-subtle">
          {{ data.type }} · {{ data.estimatedDurationMinutes }} dk
          @if (data.lastAccessedAt) {
            · son erişim {{ data.lastAccessedAt | appRelativeTime }}
          }
        </p>
      </div>
    </div>

    <app-progress-bar
      [value]="data.progressPercent"
      tone="primary"
      label="İçerik ilerlemesi"
      [showFraction]="true"
    />

    <app-button
      variant="primary"
      icon="circle-play"
      [fullWidth]="true"
      (pressed)="continueStudy.emit(data.contentId)"
    >
      {{ data.progressPercent > 0 ? 'Kaldığın yerden devam et' : 'Çalışmaya başla' }}
    </app-button>
  `,
  styleUrl: './continue-learning-card.component.scss',
})
export class ContinueLearningCardComponent {
  readonly card = input.required<ContinueLearningCard>();
  readonly continueStudy = output<string>();
}
