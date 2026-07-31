import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppButtonComponent } from '../app-button/app-button.component';
import { AppIconComponent } from '../app-icon/app-icon.component';

/**
 * Boş durum.
 * Filtre nedeniyle boşsa kullanıcıya çıkış yolu ("Filtreleri temizle") sunulur —
 * "hiç veri yok" ile "bu filtreyle veri yok" farkı korunur.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  template: `
    <div class="empty__icon">
      <app-icon [name]="icon()" [size]="22" />
    </div>
    <h3 class="text-h3">{{ title() }}</h3>
    <p class="empty__description text-sm text-muted">{{ description() }}</p>

    <div class="empty__actions">
      @if (filtered()) {
        <app-button variant="secondary" icon="filter" (pressed)="clearFilters.emit()">
          Filtreleri temizle
        </app-button>
      }
      @if (actionLabel(); as label) {
        <app-button variant="primary" [icon]="actionIcon()" (pressed)="action.emit()">
          {{ label }}
        </app-button>
      }
    </div>
  `,
  styleUrl: './app-empty-state.component.scss',
})
export class AppEmptyStateComponent {
  readonly icon = input<AppIconName>('inbox');
  readonly title = input('Görüntülenecek kayıt yok');
  readonly description = input('Burada henüz bir kayıt bulunmuyor.');
  /** Sonuçların filtreden dolayı boş olduğu durum. */
  readonly filtered = input(false);
  readonly actionLabel = input<string | null>(null);
  readonly actionIcon = input<AppIconName>('plus');

  readonly action = output<void>();
  readonly clearFilters = output<void>();
}
