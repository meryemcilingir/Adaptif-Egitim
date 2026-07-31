import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { QuickAction } from '../../models/dashboard.model';

/**
 * Hızlı işlem kartları.
 * Rolün en sık yaptığı işlere tek tıkla erişim sağlar; rozet bekleyen iş sayısını gösterir.
 */
@Component({
  selector: 'app-quick-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, RouterLink],
  template: `
    <nav class="quick" aria-label="Hızlı işlemler">
      @for (action of actions(); track action.id) {
        <a class="quick__item" [class]="'quick__item--' + action.tone" [routerLink]="action.link">
          <span class="quick__icon"><app-icon [name]="action.icon" [size]="17" /></span>

          <span class="quick__text">
            <span class="text-body-strong">{{ action.label }}</span>
            <span class="text-xs text-muted">{{ action.description }}</span>
          </span>

          @if (action.badge !== null) {
            <span class="quick__badge tabular">{{ action.badge }}</span>
          } @else {
            <app-icon class="quick__arrow" name="arrow-right" [size]="15" />
          }
        </a>
      }
    </nav>
  `,
  styleUrl: './quick-actions.component.scss',
})
export class QuickActionsComponent {
  readonly actions = input.required<readonly QuickAction[]>();
}
