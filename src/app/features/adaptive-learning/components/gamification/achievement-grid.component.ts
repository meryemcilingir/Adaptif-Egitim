import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AchievementCard } from '../../models/dashboard.model';

/**
 * Başarım kartları.
 *
 * Kilitli başarımlar da gösterilir; kullanıcı neyi hedefleyeceğini görür ve
 * ilerlemesini takip eder. Abartılı kutlama yerine ölçülebilir kilometre taşları.
 */
@Component({
  selector: 'app-achievement-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppProgressBarComponent],
  template: `
    <div class="achievements">
      @for (item of achievements(); track item.id) {
        <article class="achievement" [class.is-unlocked]="item.unlocked">
          <div class="achievement__icon">
            <app-icon [name]="item.unlocked ? item.icon : 'lock'" [size]="18" />
          </div>

          <div class="achievement__body">
            <p class="text-sm text-body-strong">{{ item.title }}</p>
            <p class="text-xs text-subtle">{{ item.description }}</p>

            @if (!item.unlocked) {
              <app-progress-bar
                [value]="item.progressPercent"
                tone="primary"
                [label]="item.title + ' ilerlemesi'"
              />
            }
          </div>
        </article>
      }
    </div>
  `,
  styleUrl: './achievement-grid.component.scss',
})
export class AchievementGridComponent {
  readonly achievements = input.required<readonly AchievementCard[]>();
}
