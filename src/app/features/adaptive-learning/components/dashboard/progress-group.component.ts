import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { ProgressCard } from '../../models/dashboard.model';

/** İlerleme kartları satırı — rol bağımsız. */
@Component({
  selector: 'app-progress-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppCardComponent, AppProgressBarComponent],
  template: `
    <div class="progress-grid">
      @for (item of cards(); track item.key) {
        <app-card padding="compact">
          <div class="progress-card">
            <div class="row-between gap-3">
              <span class="text-overline text-muted">{{ item.label }}</span>
              <span class="text-body-strong tabular">{{ item.value }} / {{ item.max }}</span>
            </div>
            <app-progress-bar
              [value]="item.value"
              [max]="item.max"
              [tone]="item.tone"
              [label]="item.label"
            />
            <p class="text-xs text-subtle">{{ item.caption }}</p>
          </div>
        </app-card>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    /*
     * Sabit üç sütun DEĞİL, sığdığı kadar sütun.
     *
     * Bileşen hem tam genişlikte (eğitmen/program yöneticisi panosu) hem de dar
     * bir yan sütunda (öğrenci panosundaki haftalık özet) kullanılıyor.
     * \`grid-3\` dar sütunda kartları 85 px'e sıkıştırıp içeriği taşırıyordu:
     * "209 / 300" satıra sığmıyor, başlık üç satıra bölünüyordu.
     */
    .progress-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: var(--space-3);
    }

    .progress-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class ProgressGroupComponent {
  readonly cards = input.required<readonly ProgressCard[]>();
}
