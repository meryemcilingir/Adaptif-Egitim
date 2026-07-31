import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AvatarSize = 'sm' | 'md' | 'lg';

/** Ad-soyaddan deterministik renk üreten avatar — aynı kişi her yerde aynı renkte görünür. */
const PALETTE: readonly string[] = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as source) {
      <img class="avatar__image" [src]="source" [alt]="name()" />
    } @else {
      <span class="avatar__initials" aria-hidden="true">{{ initials() }}</span>
      <span class="sr-only">{{ name() }}</span>
    }
  `,
  styleUrl: './app-avatar.component.scss',
  host: {
    '[class]': '"avatar avatar--" + size()',
    '[style.background]': 'src() ? null : background()',
  },
})
export class AppAvatarComponent {
  readonly name = input.required<string>();
  readonly src = input<string | null>(null);
  readonly size = input<AvatarSize>('md');

  readonly initials = computed(() =>
    this.name()
      .split(' ')
      .filter((part) => part.length > 0 && !part.endsWith('.'))
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
      .join(''),
  );

  readonly background = computed(() => {
    const seed = [...this.name()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return PALETTE[seed % PALETTE.length]!;
  });
}
