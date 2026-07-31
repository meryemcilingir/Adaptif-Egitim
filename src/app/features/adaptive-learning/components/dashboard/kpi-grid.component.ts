import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AppMetricCardComponent } from '../../../../shared/components/app-metric-card/app-metric-card.component';
import { KpiCard } from '../../models/dashboard.model';

/**
 * KPI satırı.
 *
 * Tüm rollerde aynı bileşen kullanılır; farklı olan yalnızca sunucudan gelen
 * kart listesidir. Böylece KPI görünümü tek yerde tanımlı kalır (DRY).
 */
@Component({
  selector: 'app-kpi-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppMetricCardComponent],
  template: `
    <div class="grid grid-4" role="list" [attr.aria-label]="ariaLabel()">
      @for (card of cards(); track card.key) {
        <app-metric-card
          role="listitem"
          [label]="card.label"
          [value]="card.value"
          [unit]="card.unit"
          [icon]="card.icon"
          [trendPercent]="card.trendPercent"
          [direction]="card.direction"
          [higherIsBetter]="card.higherIsBetter"
          [caption]="card.caption"
          [sparkline]="card.sparkline"
        />
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class KpiGridComponent {
  readonly cards = input.required<readonly KpiCard[]>();
  readonly ariaLabel = input('Temel göstergeler');
}
