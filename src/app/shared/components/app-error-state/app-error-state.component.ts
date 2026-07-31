import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ApiError } from '../../../core/api/api-error';
import { AppButtonComponent } from '../app-button/app-button.component';
import { AppIconComponent } from '../app-icon/app-icon.component';

/**
 * Hata durumu.
 * Korelasyon kimliği küçük punto ile gösterilir; kullanıcı destek talebinde
 * bu kimliği paylaşabilir.
 */
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  template: `
    <div class="error__icon">
      <app-icon [name]="isNetwork() ? 'wifi-off' : 'triangle-alert'" [size]="22" />
    </div>
    <h3 class="text-h3">{{ title() }}</h3>
    <p class="error__message text-sm text-muted">{{ error()?.message ?? fallbackMessage() }}</p>

    @if (canRetry()) {
      <app-button variant="secondary" icon="refresh-cw" (pressed)="retry.emit()">
        Tekrar dene
      </app-button>
    }

    @if (error()?.correlationId; as correlationId) {
      <p class="error__correlation text-mono text-subtle">İşlem kimliği: {{ correlationId }}</p>
    }
  `,
  styleUrl: './app-error-state.component.scss',
  host: { role: 'alert' },
})
export class AppErrorStateComponent {
  readonly error = input<ApiError | null>(null);
  readonly title = input('Veriler yüklenemedi');
  readonly fallbackMessage = input('Beklenmeyen bir hata oluştu.');
  readonly retry = output<void>();

  readonly isNetwork = computed(() => {
    const code = this.error()?.code;
    return code === 'NETWORK' || code === 'TIMEOUT';
  });

  /** İş kuralı hatalarında "tekrar dene" anlamsızdır. */
  readonly canRetry = computed(() => this.error()?.retryable ?? true);
}
