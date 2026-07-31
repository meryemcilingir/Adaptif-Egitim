import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppIconComponent } from '../app-icon/app-icon.component';

export type TrendDirection = 'up' | 'down' | 'flat';

/**
 * KPI kartı: başlık · değer · trend · küçük ikon (DESIGN_SYSTEM.md §8.2).
 *
 * Trendin "iyi" mi "kötü" mü olduğu metriğe göre değişir; bekleyen değerlendirme
 * sayısının artması olumsuzdur. Bu yüzden renk `higherIsBetter` ile belirlenir.
 */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  template: `
    <div class="stat__head">
      <span class="stat__label text-overline text-muted">{{ label() }}</span>
      <span class="stat__icon"><app-icon [name]="icon()" [size]="16" /></span>
    </div>

    <div class="stat__value text-metric">
      {{ formattedValue() }}<span class="stat__unit">{{ unit() }}</span>
    </div>

    <div class="stat__foot">
      @if (direction() !== 'flat') {
        <span class="stat__trend" [class]="'stat__trend--' + sentiment()">
          <app-icon [name]="direction() === 'up' ? 'trending-up' : 'trending-down'" [size]="13" />
          {{ trendLabel() }}
        </span>
      } @else {
        <span class="stat__trend stat__trend--neutral">
          <app-icon name="minus" [size]="13" />
          Değişim yok
        </span>
      }
      <span class="stat__caption text-xs text-subtle">{{ caption() }}</span>
    </div>

    <ng-content />
  `,
  styleUrl: './app-stat-card.component.scss',
})
export class AppStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly unit = input('');
  readonly icon = input<AppIconName>('activity');
  readonly trendPercent = input(0);
  readonly direction = input<TrendDirection>('flat');
  readonly higherIsBetter = input(true);
  readonly caption = input('');

  readonly formattedValue = computed(() => new Intl.NumberFormat('tr-TR').format(this.value()));

  readonly trendLabel = computed(() => {
    const value = Math.abs(this.trendPercent());
    return `%${value.toFixed(1).replace('.', ',')}`;
  });

  readonly sentiment = computed(() => {
    const positive = this.direction() === 'up' ? this.higherIsBetter() : !this.higherIsBetter();
    return positive ? 'positive' : 'negative';
  });
}
