import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { ClockReading, formatDuration } from '../../domain/exam-clock';

/**
 * Geri sayım göstergesi.
 *
 * Bileşen SAYMAZ: okumayı hazır alır (`ClockReading`), yalnızca gösterir. Sayaç
 * facade'de tek bir zamanlayıcıyla yürür; her bileşenin kendi `setInterval`'ı
 * olsaydı hem birbirinden kayarlar hem de gereksiz iş yapılırdı.
 *
 * Kalan süre azaldıkça renk ve vurgu değişir; son bir dakikada nabız efekti
 * eklenir ama `prefers-reduced-motion` açıksa durur.
 */
@Component({
  selector: 'app-exam-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  template: `
    @if (reading(); as clock) {
      <div
        class="timer"
        [class]="'is-' + clock.urgency"
        role="timer"
        aria-live="off"
        [attr.aria-label]="label()"
      >
        <app-icon name="clock" [size]="16" />
        <span class="timer__value tabular">{{ text() }}</span>
      </div>
    }
  `,
  styleUrl: './exam-timer.component.scss',
})
export class ExamTimerComponent {
  readonly reading = input.required<ClockReading | null>();

  readonly text = computed(() => formatDuration(this.reading()?.remainingMs ?? 0));

  /**
   * Ekran okuyucu için metin.
   *
   * `aria-live` kapalıdır: her saniye okunması sınavı takip edilemez hâle
   * getirirdi. Eşik uyarıları zaten ayrıca duyuruluyor.
   */
  readonly label = computed(() => `Kalan süre ${this.text()}`);
}
