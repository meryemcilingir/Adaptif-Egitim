import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppIconComponent } from '../app-icon/app-icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Uygulamanın tek buton bileşeni.
 * Yeni bir görünüm gerektiğinde `variant` eklenir; ekranlarda ham `<button>` yazılmaz.
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  templateUrl: './app-button.component.html',
  styleUrl: './app-button.component.scss',
  host: {
    '[class.is-full-width]': 'fullWidth()',
  },
})
export class AppButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly icon = input<AppIconName | null>(null);
  readonly trailingIcon = input<AppIconName | null>(null);
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly fullWidth = input(false);
  /** Yalnızca ikon içeren butonlarda erişilebilir etiket zorunludur. */
  readonly ariaLabel = input<string | null>(null);

  readonly pressed = output<MouseEvent>();

  readonly isDisabled = computed(() => this.disabled() || this.loading());
  readonly iconSize = computed(() => (this.size() === 'lg' ? 18 : this.size() === 'sm' ? 14 : 16));

  onClick(event: MouseEvent): void {
    if (this.isDisabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.pressed.emit(event);
  }
}
