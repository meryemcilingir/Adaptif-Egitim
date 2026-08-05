import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AppButtonComponent } from '../app-button/app-button.component';
import { AppDialogComponent } from './app-dialog.component';
import { DialogService } from './dialog.service';

const DEFAULT_MIN_REASON_LENGTH = 10;

/**
 * Uygulama kabuğunda bir kez render edilen onay diyaloğu.
 * Gerekçe zorunluysa metin yeterli uzunlukta değilken onay butonu etkin olmaz (BR-12).
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppDialogComponent],
  template: `
    @if (pending(); as current) {
      <app-dialog
        [open]="true"
        size="sm"
        [title]="current.request.title"
        [closeOnBackdrop]="!requiresReason()"
        (closed)="onCancel()"
      >
        <p class="text-sm">{{ current.request.message }}</p>

        @if (requiresReason()) {
          <label class="confirm__label text-sm" for="confirm-reason">
            {{ current.request.reasonLabel ?? 'Gerekçe' }}
            <span class="confirm__required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="confirm-reason"
            class="confirm__reason"
            rows="3"
            [value]="reason()"
            [attr.maxlength]="maxLength()"
            [attr.aria-describedby]="'confirm-reason-hint'"
            (input)="onReasonInput($event)"
          ></textarea>
          <p id="confirm-reason-hint" class="confirm__hint text-xs">
            <span [class.text-danger]="!isReasonValid()">
              {{
                current.request.reasonHint ??
                  'Bu işlem denetim kaydına yazılır. En az ' + minLength() + ' karakter girin.'
              }}
            </span>
            @if (maxLength(); as max) {
              <span class="confirm__counter tabular" [class.text-danger]="reason().length > max">
                {{ reason().length }}/{{ max }}
              </span>
            }
          </p>
        }

        <div dialog-footer>
          <app-button variant="ghost" (pressed)="onCancel()">
            {{ current.request.cancelLabel ?? 'Vazgeç' }}
          </app-button>
          <app-button
            [variant]="current.request.tone === 'danger' ? 'danger' : 'primary'"
            [disabled]="!isReasonValid()"
            (pressed)="onConfirm()"
          >
            {{ current.request.confirmLabel ?? 'Onayla' }}
          </app-button>
        </div>
      </app-dialog>
    }
  `,
  styleUrl: './app-confirm-dialog.component.scss',
})
export class AppConfirmDialogComponent {
  private readonly dialogs = inject(DialogService);

  readonly pending = this.dialogs.pending;
  private readonly reasonState = signal('');

  readonly reason = this.reasonState.asReadonly();
  readonly requiresReason = computed(() => this.pending()?.request.requireReason === true);
  readonly minLength = computed(
    () => this.pending()?.request.minReasonLength ?? DEFAULT_MIN_REASON_LENGTH,
  );
  readonly maxLength = computed(() => this.pending()?.request.maxReasonLength ?? null);

  readonly isReasonValid = computed(() => {
    if (!this.requiresReason()) return true;
    const length = this.reasonState().trim().length;
    const max = this.maxLength();
    return length >= this.minLength() && (max === null || length <= max);
  });

  onReasonInput(event: Event): void {
    this.reasonState.set((event.target as HTMLTextAreaElement).value);
  }

  onConfirm(): void {
    if (!this.isReasonValid()) return;
    const reason = this.reasonState().trim();
    this.reasonState.set('');
    this.dialogs.resolve({ confirmed: true, reason });
  }

  onCancel(): void {
    this.reasonState.set('');
    this.dialogs.resolve({ confirmed: false, reason: '' });
  }
}
