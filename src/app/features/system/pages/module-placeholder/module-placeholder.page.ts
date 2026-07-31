import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';

/**
 * Henüz geliştirilmemiş modüller için geçici ekran.
 *
 * Bilinçli bir tercih: menü ve yetkilendirme akışı baştan doğru kurulsun diye
 * rotalar tanımlı bırakılır, ancak ekranın hangi fazda geleceği kullanıcıya
 * AÇIKÇA yazılır. Yarım/aldatıcı bir arayüz gösterilmez (ROADMAP.md).
 */
@Component({
  selector: 'app-module-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppCardComponent, AppIconComponent, AppStatusBadgeComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="text-h1">{{ title() }}</h1>
          <p class="text-sm text-muted">{{ summary() }}</p>
        </div>
        <app-status-badge [label]="'Faz ' + phase()" tone="info" icon="clock" />
      </header>

      <app-card>
        <div class="placeholder">
          <span class="placeholder__icon"><app-icon name="workflow" [size]="22" /></span>
          <h2 class="text-h2">Bu modül planlanan fazda geliştirilecek</h2>
          <p class="text-sm text-muted">
            Altyapı (mimari, yetkilendirme, mock API, tasarım sistemi) hazır. Bu ekranın iş
            kuralları ve arayüzü <strong>Faz {{ phase() }}</strong> kapsamında eklenecek.
          </p>

          <ul class="placeholder__scope">
            @for (item of scope(); track item) {
              <li><app-icon name="check" [size]="14" /> {{ item }}</li>
            }
          </ul>
        </div>
      </app-card>
    </div>
  `,
  styleUrl: './module-placeholder.page.scss',
})
export class ModulePlaceholderPage {
  readonly title = input.required<string>();
  readonly summary = input('');
  readonly phase = input.required<number>();
  readonly scope = input<readonly string[]>([]);
}
