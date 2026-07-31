import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { OutcomeHighlight } from '../../models/dashboard.model';

/**
 * Zayıf/güçlü kazanım listesi.
 *
 * Yalnızca skor göstermez; her satırda KISA BİR YÖNLENDİRME bulunur ve varsa
 * hedef içeriğe götürür. Öğrenci "ne yapmalıyım" sorusunu kart üzerinde yanıtlar.
 */
@Component({
  selector: 'app-outcome-highlight-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppEmptyStateComponent, AppIconComponent, AppProgressBarComponent],
  template: `
    @if (entries().length === 0) {
      <app-empty-state
        [icon]="emptyIcon()"
        [title]="emptyTitle()"
        [description]="emptyDescription()"
      />
    } @else {
      <ul class="highlights">
        @for (entry of entries(); track entry.outcomeId) {
          <li>
            <button
              type="button"
              class="highlight"
              [disabled]="entry.targetContentId === null"
              (click)="select.emit(entry)"
            >
              <span class="highlight__head">
                <span class="text-sm text-body-strong">{{ entry.outcomeCode }}</span>
                <span class="text-xs text-subtle tabular">%{{ entry.masteryScore }}</span>
              </span>

              <span class="text-xs text-muted truncate">
                {{ entry.courseCode }} · {{ entry.outcomeTitle }}
              </span>

              <app-progress-bar
                [value]="entry.masteryScore"
                [tone]="tone()"
                [label]="entry.outcomeCode + ' ustalık'"
              />

              <span class="highlight__advice text-xs">
                <app-icon name="lightbulb" [size]="12" />
                {{ entry.advice }}
              </span>
            </button>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './outcome-highlight-list.component.scss',
})
export class OutcomeHighlightListComponent {
  readonly entries = input.required<readonly OutcomeHighlight[]>();
  readonly tone = input<'primary' | 'success' | 'warning' | 'danger'>('warning');
  readonly emptyIcon = input<AppIconName>('target');
  readonly emptyTitle = input('Kazanım ölçümü yok');
  readonly emptyDescription = input(
    'Sınav sonuçların işlendiğinde kazanım kırılımın burada görünecek.',
  );

  readonly select = output<OutcomeHighlight>();
}
