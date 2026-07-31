import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Çok satırlı metin girişi.
 * Karakter sayacı `AppFormField` tarafından gösterilir; burada yalnızca giriş yönetilir.
 */
@Component({
  selector: 'app-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppTextareaComponent),
      multi: true,
    },
  ],
  template: `
    <textarea
      class="textarea"
      [class.is-invalid]="invalid()"
      [id]="inputId()"
      [rows]="rows()"
      [placeholder]="placeholder()"
      [value]="value()"
      [disabled]="isDisabled()"
      [attr.maxlength]="maxLength()"
      [attr.aria-invalid]="invalid()"
      (input)="onInput($event)"
      (blur)="onBlur()"
    ></textarea>
  `,
  styles: `
    :host {
      display: block;
    }

    .textarea {
      width: 100%;
      min-height: 88px;
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      border: var(--border-width) solid var(--color-border-strong);
      border-radius: var(--radius-md);
      font-size: var(--fs-body);
      line-height: var(--lh-body);
      color: var(--color-text);
      resize: vertical;
      transition:
        border-color var(--duration-fast) var(--ease-in-out),
        box-shadow var(--duration-fast) var(--ease-in-out);

      &::placeholder {
        color: var(--color-text-tertiary);
      }

      &:focus-visible {
        outline: none;
        border-color: var(--color-border-focus);
        box-shadow: var(--shadow-focus);
      }

      &.is-invalid {
        border-color: var(--color-danger);

        &:focus-visible {
          box-shadow: var(--shadow-focus-danger);
        }
      }

      &:disabled {
        background: var(--color-surface-muted);
        cursor: not-allowed;
      }
    }
  `,
})
export class AppTextareaComponent implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly placeholder = input('');
  readonly rows = input(4);
  readonly invalid = input(false);
  /** Tarayıcı seviyesinde sert sınır; form validator'ı ile aynı değeri alır. */
  readonly maxLength = input<number | null>(null);

  private readonly valueState = signal('');
  private readonly disabledState = signal(false);

  readonly value = this.valueState.asReadonly();
  readonly isDisabled = this.disabledState.asReadonly();

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.valueState.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.valueState.set(value);
    this.onChange(value);
  }

  onBlur(): void {
    this.onTouched();
  }
}
