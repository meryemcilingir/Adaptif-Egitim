import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type CardPadding = 'none' | 'compact' | 'default' | 'roomy';

/**
 * Temel yüzey bileşeni: beyaz zemin, ince border, hafif gölge.
 * Başlık/aksiyon/altbilgi bölgeleri içerik projeksiyonu ile doldurulur.
 */
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (title() || description() || hasActions()) {
      <header class="card__header">
        <div class="card__titles">
          @if (title(); as value) {
            <h3 class="card__title text-h3">{{ value }}</h3>
          }
          @if (description(); as value) {
            <p class="card__description text-sm text-muted">{{ value }}</p>
          }
        </div>
        <div class="card__actions"><ng-content select="[card-actions]" /></div>
      </header>
    }

    <div class="card__body" [class]="'card__body--' + padding()">
      <ng-content />
    </div>

    <ng-content select="[card-footer]" />
  `,
  styleUrl: './app-card.component.scss',
  host: {
    '[class.is-interactive]': 'interactive()',
    '[class.is-flush]': 'padding() === "none"',
  },
})
export class AppCardComponent {
  readonly title = input<string | null>(null);
  readonly description = input<string | null>(null);
  readonly padding = input<CardPadding>('default');
  /** Başlık satırında aksiyon alanı ayrılsın mı. */
  readonly hasActions = input(false);
  /** Tıklanabilir kart görünümü (hover + cursor). */
  readonly interactive = input(false);
}
