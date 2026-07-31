import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppIconComponent } from '../app-icon/app-icon.component';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

/**
 * Durum rozeti.
 *
 * Erişilebilirlik kuralı: durum ASLA yalnızca renkle anlatılmaz —
 * rozet her zaman metin içerir, gerekirse ikon eklenir (PROJECT_RULES.md §10).
 */
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  template: `
    @if (dot()) {
      <span class="badge__dot" aria-hidden="true"></span>
    } @else if (icon(); as name) {
      <app-icon [name]="name" [size]="12" [strokeWidth]="2" />
    }
    <span class="badge__label">{{ label() }}</span>
  `,
  styleUrl: './app-status-badge.component.scss',
  host: {
    '[class]': '"badge badge--" + tone()',
    '[class.is-subtle]': 'subtle()',
  },
})
export class AppStatusBadgeComponent {
  readonly label = input.required<string>();
  readonly tone = input<BadgeTone>('neutral');
  readonly icon = input<AppIconName | null>(null);
  readonly dot = input(false);
  /** Daha sessiz görünüm — tablo içi yoğun kullanımda tercih edilir. */
  readonly subtle = input(false);
}
