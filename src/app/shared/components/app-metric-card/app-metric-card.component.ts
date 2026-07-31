import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppSparklineComponent } from '../app-sparkline/app-sparkline.component';
import { AppStatCardComponent, TrendDirection } from '../app-stat-card/app-stat-card.component';

/**
 * KPI kartı + mini trend grafiği.
 *
 * `AppStatCard`'ı yeniden yazmak yerine SARMALAR (composition) — kart görünümü
 * tek yerde tanımlı kalır, sparkline yalnızca ek bir katman olarak eklenir.
 */
@Component({
  selector: 'app-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppSparklineComponent, AppStatCardComponent],
  template: `
    <app-stat-card
      [label]="label()"
      [value]="value()"
      [unit]="unit()"
      [icon]="icon()"
      [trendPercent]="trendPercent()"
      [direction]="direction()"
      [higherIsBetter]="higherIsBetter()"
      [caption]="caption()"
    >
      @if (sparkline().length > 1) {
        <app-sparkline
          class="metric__spark"
          [values]="sparkline()"
          [color]="sparkColor()"
          [height]="40"
        />
      }
    </app-stat-card>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .metric__spark {
      margin-top: var(--space-2);
      margin-inline: calc(var(--space-2) * -1);
    }
  `,
})
export class AppMetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly unit = input('');
  readonly icon = input<AppIconName>('activity');
  readonly trendPercent = input(0);
  readonly direction = input<TrendDirection>('flat');
  readonly higherIsBetter = input(true);
  readonly caption = input('');
  readonly sparkline = input<readonly number[]>([]);

  readonly sparkColor = computed(() => {
    if (this.direction() === 'flat') return 'var(--color-text-tertiary)';
    const positive = this.direction() === 'up' ? this.higherIsBetter() : !this.higherIsBetter();
    return positive ? 'var(--color-success)' : 'var(--color-danger)';
  });
}
