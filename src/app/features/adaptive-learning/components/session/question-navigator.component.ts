import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { NAVIGATOR_LABELS, NavigatorState } from '../../domain/session.rules';
import { NavigatorEntry } from '../../data-access/session.facade';

/**
 * Soru navigatörü.
 *
 * Beş durum RENKLE AYRILIR ama yalnızca renge güvenilmez: her düğme durumunu
 * `aria-label`'ında yazar ve işaretli sorular ayrıca bir nokta taşır. Renk körü
 * bir öğrenci de hangi soruyu işaretlediğini görebilmelidir.
 */
@Component({
  selector: 'app-question-navigator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  templateUrl: './question-navigator.component.html',
  styleUrl: './question-navigator.component.scss',
})
export class QuestionNavigatorComponent {
  readonly entries = input.required<readonly NavigatorEntry[]>();
  /**
   * Sayaçlar DIŞARIDAN gelir, hücre durumlarından türetilmez.
   *
   * Navigatörde "şu anki soru" diğer tüm durumların önüne geçer; sayacı bu
   * durumlardan hesaplamak, üzerinde durduğunuz cevaplanmış soruyu sayımın
   * dışında bırakırdı.
   */
  readonly answeredCount = input.required<number>();
  readonly flaggedCount = input.required<number>();
  readonly disabled = input(false);

  readonly select = output<number>();

  readonly labels = NAVIGATOR_LABELS;

  /** Gösterge listesi — hangi rengin ne anlama geldiği. */
  readonly legend: readonly NavigatorState[] = [
    'answered',
    'visited',
    'not_visited',
    'flagged',
    'current',
  ];

  readonly total = computed(() => this.entries().length);

  onSelect(index: number): void {
    if (!this.disabled()) this.select.emit(index);
  }
}
