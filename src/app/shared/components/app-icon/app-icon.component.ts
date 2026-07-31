import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

import { AppIconName } from '../../icons/app-icons';

/**
 * Tek ikon sarmalayıcısı.
 * Uygulamada `<svg lucideIcon>` doğrudan kullanılmaz; böylece ikon kütüphanesi
 * değişirse tek dosya güncellenir (DIP).
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  template: `<svg
    [lucideIcon]="name()"
    [size]="size()"
    [strokeWidth]="strokeWidth()"
    [attr.aria-hidden]="label() ? null : true"
    [attr.role]="label() ? 'img' : null"
    [attr.aria-label]="label()"
  ></svg>`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      color: inherit;
    }
  `,
})
export class AppIconComponent {
  readonly name = input.required<AppIconName>();
  readonly size = input(16);
  readonly strokeWidth = input(1.75);
  /** Dolduruldu ise ikon anlamlı sayılır ve ekran okuyucuya duyurulur. */
  readonly label = input<string | null>(null);
}
