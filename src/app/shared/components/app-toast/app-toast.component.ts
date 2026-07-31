import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Toast, ToastStore, ToastTone } from '../../../core/observability/toast.store';
import { AppIconName } from '../../icons/app-icons';
import { AppButtonComponent } from '../app-button/app-button.component';
import { AppIconComponent } from '../app-icon/app-icon.component';

const TONE_ICONS: Readonly<Record<ToastTone, AppIconName>> = {
  success: 'circle-check-big',
  error: 'circle-alert',
  warning: 'triangle-alert',
  info: 'info',
};

/**
 * Bildirim yığını. Uygulama kabuğunda bir kez render edilir.
 * `role="status"` sayesinde ekran okuyucular bildirimi kesintiye uğratmadan duyurur.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  template: `
    <div class="toast__stack" role="status" aria-live="polite">
      @for (toast of toasts(); track toast.id) {
        <article class="toast" [class]="'toast--' + toast.tone">
          <app-icon class="toast__icon" [name]="iconFor(toast)" [size]="17" />

          <div class="toast__content">
            <p class="toast__title text-body-strong">{{ toast.title }}</p>
            @if (toast.message) {
              <p class="toast__message text-sm text-muted">{{ toast.message }}</p>
            }
            @if (toast.correlationId) {
              <p class="text-mono text-subtle">{{ toast.correlationId }}</p>
            }
            @if (toast.action; as action) {
              <app-button
                class="toast__action"
                variant="link"
                size="sm"
                (pressed)="runAction(toast)"
              >
                {{ action.label }}
              </app-button>
            }
          </div>

          <app-button
            variant="ghost"
            size="sm"
            icon="x"
            ariaLabel="Bildirimi kapat"
            (pressed)="store.dismiss(toast.id)"
          />
        </article>
      }
    </div>
  `,
  styleUrl: './app-toast.component.scss',
})
export class AppToastComponent {
  protected readonly store = inject(ToastStore);
  readonly toasts = this.store.toasts;

  iconFor(toast: Toast): AppIconName {
    return TONE_ICONS[toast.tone];
  }

  runAction(toast: Toast): void {
    toast.action?.run();
    this.store.dismiss(toast.id);
  }
}
