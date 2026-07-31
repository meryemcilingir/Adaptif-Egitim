import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { StatisticEntry } from '../../models/dashboard.model';

/** Özet istatistik listesi — etiket, değer ve açıklama üçlüsü. */
@Component({
  selector: 'app-statistics-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="stats">
      @for (statistic of entries(); track statistic.label) {
        <div class="stats__row">
          <dt class="text-sm text-muted">{{ statistic.label }}</dt>
          <dd class="text-body-strong">{{ statistic.value }}</dd>
          <p class="stats__hint text-xs text-subtle">{{ statistic.hint }}</p>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }

    .stats {
      display: flex;
      flex-direction: column;
    }

    .stats__row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-1) var(--space-3);
      padding: var(--space-3) 0;
      border-bottom: var(--border-width) solid var(--color-border);

      &:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      &:first-child {
        padding-top: 0;
      }
    }

    .stats__hint {
      grid-column: 1 / -1;
    }
  `,
})
export class StatisticsListComponent {
  readonly entries = input.required<readonly StatisticEntry[]>();
}
