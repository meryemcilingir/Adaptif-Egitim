import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { SubmitSummary } from '../../models/exam-session.model';

/**
 * Teslim özeti.
 *
 * Onay alınmadan sınav teslim edilmez. Özet SAYI vermekle yetinmez, boş ve
 * işaretli soruların numaralarını da gösterir ve oraya dönmek için düğme sunar —
 * "3 soru boş" bilgisi tek başına öğrencinin hangi soruya döneceğini söylemez.
 */
@Component({
  selector: 'app-submit-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  templateUrl: './submit-summary.component.html',
  styleUrl: './submit-summary.component.scss',
})
export class SubmitSummaryComponent {
  readonly summary = input.required<SubmitSummary>();
  readonly busy = input(false);

  readonly confirm = output<void>();
  readonly cancel = output<void>();
  readonly goToUnanswered = output<void>();
  readonly goToFlagged = output<void>();

  readonly hasWarnings = computed(
    () => this.summary().unanswered > 0 || this.summary().flagged > 0,
  );

  /**
   * Uzun numara listelerini kısaltır.
   *
   * 40 soruluk bir sınavda 25 boş soru varsa hepsini yazmak diyalogu okunmaz
   * hâle getirir; ilk sekiz numara ve kalanın sayısı yeterli bilgiyi verir.
   */
  formatNumbers(numbers: readonly number[]): string {
    const shown = numbers.slice(0, 8).join(', ');
    const rest = numbers.length - 8;
    return rest > 0 ? `${shown} ve ${rest} soru daha` : shown;
  }
}
