import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconComponent } from '../app-icon/app-icon.component';
import { AppSkeletonComponent } from '../app-skeleton/app-skeleton.component';

export type LoadingVariant = 'spinner' | 'skeleton-table' | 'skeleton-card' | 'skeleton-chart';

/**
 * Yükleme durumu.
 * Liste ve kart yüklemelerinde spinner yerine iskelet tercih edilir —
 * kullanıcı gelecek yerleşimi görür, sayfa zıplamaz.
 */
@Component({
  selector: 'app-loading-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppSkeletonComponent],
  templateUrl: './app-loading-state.component.html',
  styleUrl: './app-loading-state.component.scss',
  host: { role: 'status', 'aria-live': 'polite' },
})
export class AppLoadingStateComponent {
  readonly variant = input<LoadingVariant>('spinner');
  readonly rows = input(6);
  readonly message = input('Yükleniyor…');

  readonly rowList = computed(() => Array.from({ length: this.rows() }, (_, index) => index));
}
