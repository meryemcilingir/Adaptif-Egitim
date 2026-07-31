import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { StreakCard } from '../../models/dashboard.model';

/**
 * Çalışma serisi kartı.
 *
 * Oyunlaştırma ARAYÜZ seviyesindedir: gösterilen sayı gerçek çalışma günlerinden
 * hesaplanır (`domain/engagement.ts`). Seri kırılma riski varsa kullanıcı sessizce
 * kaybetmesin diye açıkça uyarılır.
 */
@Component({
  selector: 'app-streak-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  template: `
    @let data = streak();

    <div class="streak" [class.is-at-risk]="data.atRisk">
      <div class="streak__icon">
        <app-icon name="flame" [size]="20" />
      </div>

      <div class="streak__body">
        <p class="streak__value tabular">
          {{ data.currentStreak }}<span class="streak__unit">gün</span>
        </p>
        <p class="text-xs text-subtle">Çalışma serisi · en uzun {{ data.longestStreak }} gün</p>
      </div>
    </div>

    <div class="streak__week" role="list" aria-label="Son yedi gün">
      @for (day of week(); track day.index) {
        <span
          class="streak__day"
          role="listitem"
          [class.is-active]="day.active"
          [attr.title]="day.active ? 'Seri içinde' : 'Çalışma yok'"
        ></span>
      }
    </div>

    @if (data.atRisk) {
      <p class="streak__note text-xs">
        <app-icon name="triangle-alert" [size]="13" />
        Bugün çalışmazsan serin bozulacak.
      </p>
    } @else if (data.currentStreak === 0) {
      <p class="streak__note text-xs text-subtle">
        Bugün bir içerik tamamlayarak yeni bir seri başlat.
      </p>
    }
  `,
  styleUrl: './streak-card.component.scss',
})
export class StreakCardComponent {
  readonly streak = input.required<StreakCard>();

  /** Son 7 günün görsel dökümü — seri uzunluğu kadar gün dolu gösterilir. */
  readonly week = computed(() => {
    const current = Math.min(7, this.streak().currentStreak);
    return Array.from({ length: 7 }, (_, index) => ({
      index,
      active: index >= 7 - current,
    }));
  });
}
