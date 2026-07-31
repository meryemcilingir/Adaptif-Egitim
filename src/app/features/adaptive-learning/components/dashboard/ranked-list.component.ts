import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { RankedEntry } from '../../models/analytics.model';

/**
 * Sıralı liste (en zayıf kazanımlar, risk altındaki öğrenciler, yavaş maddeler…).
 *
 * Aynı görsel kalıp beş farklı ekranda kullanıldığı için tek bileşene alınmıştır;
 * yalnızca veri değişir (DRY).
 */
@Component({
  selector: 'app-ranked-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppEmptyStateComponent],
  template: `
    @if (entries().length === 0) {
      <app-empty-state
        icon="chart-column"
        [title]="emptyTitle()"
        [description]="emptyDescription()"
      />
    } @else {
      <ul class="ranked">
        @for (entry of entries(); track entry.id) {
          <li class="ranked__item">
            <button
              type="button"
              class="ranked__button"
              [disabled]="!selectable()"
              (click)="entrySelect.emit(entry)"
            >
              <span class="ranked__head">
                <span class="text-body-strong truncate">{{ entry.label }}</span>
                <span class="ranked__value text-body-strong tabular">
                  {{ entry.value }}{{ entry.unit }}
                </span>
              </span>

              <span class="text-xs text-muted truncate">{{ entry.sublabel }}</span>

              <span class="ranked__track">
                <span
                  class="ranked__fill"
                  [class]="'ranked__fill--' + entry.tone"
                  [style.width.%]="entry.ratio"
                ></span>
              </span>
            </button>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './ranked-list.component.scss',
})
export class RankedListComponent {
  readonly entries = input.required<readonly RankedEntry[]>();
  readonly selectable = input(false);
  readonly emptyTitle = input('Veri yok');
  readonly emptyDescription = input('Bu liste için yeterli veri bulunmuyor.');
  readonly entrySelect = output<RankedEntry>();
}
