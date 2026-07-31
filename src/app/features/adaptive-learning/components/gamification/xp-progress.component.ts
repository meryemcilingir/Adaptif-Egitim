import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { ExperienceCard } from '../../models/dashboard.model';

/**
 * Deneyim puanı göstergesi.
 *
 * Puan uydurulmaz: tamamlanan içerik, çalışma dakikası ve seri gününden
 * hesaplanır (`XP_RULES`). Kart sade tutulur; rozet/animasyon yoktur.
 */
@Component({
  selector: 'app-xp-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppProgressBarComponent],
  template: `
    @let data = experience();

    <div class="xp__head">
      <div class="xp__level">
        <app-icon name="zap" [size]="16" />
        <span class="text-body-strong">Seviye {{ data.level }}</span>
      </div>
      <span class="text-xs text-subtle tabular">{{ data.totalXp }} XP</span>
    </div>

    <app-progress-bar
      [value]="data.xpIntoLevel"
      [max]="data.xpForNextLevel"
      tone="primary"
      label="Seviye ilerlemesi"
    />

    <p class="text-xs text-subtle">
      Sonraki seviyeye {{ data.xpForNextLevel - data.xpIntoLevel }} XP kaldı.
    </p>
  `,
  styleUrl: './xp-progress.component.scss',
})
export class XpProgressComponent {
  readonly experience = input.required<ExperienceCard>();
}
