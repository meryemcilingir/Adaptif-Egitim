import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Sayısal giriş.
 *
 * Değer daima `number | null` olarak yayınlanır — boş alan `null` olur, `NaN`
 * asla forma sızmaz. Böylece "pozitif sayı" doğrulaması tek bir kuralla çalışır.
 */
@Component({
  selector: 'app-number-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppNumberInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="number" [class.is-invalid]="invalid()" [class.is-disabled]="isDisabled()">
      <input
        class="number__control"
        type="number"
        inputmode="numeric"
        [id]="inputId()"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [placeholder]="placeholder()"
        [value]="value()"
        [disabled]="isDisabled()"
        [attr.aria-invalid]="invalid()"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />
      @if (suffix(); as text) {
        <span class="number__suffix text-sm text-muted">{{ text }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .number {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 38px;
      padding: 0 var(--space-3);
      background: var(--color-surface);
      border: var(--border-width) solid var(--color-border-strong);
      border-radius: var(--radius-md);
      transition:
        border-color var(--duration-fast) var(--ease-in-out),
        box-shadow var(--duration-fast) var(--ease-in-out);

      &:focus-within {
        border-color: var(--color-border-focus);
        box-shadow: var(--shadow-focus);
      }

      &.is-invalid {
        border-color: var(--color-danger);
      }

      &.is-disabled {
        background: var(--color-surface-muted);
      }
    }

    .number__control {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      font-size: var(--fs-body);
      font-variant-numeric: tabular-nums;
      color: var(--color-text);

      &:disabled {
        cursor: not-allowed;
      }
    }

    .number__suffix {
      flex: none;
    }
  `,
})
export class AppNumberInputComponent implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly placeholder = input('');
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly step = input(1);
  readonly suffix = input<string | null>(null);
  readonly invalid = input(false);

  private readonly valueState = signal<string>('');
  private readonly disabledState = signal(false);

  readonly value = this.valueState.asReadonly();
  readonly isDisabled = this.disabledState.asReadonly();

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: number | null): void {
    this.valueState.set(value === null || value === undefined ? '' : String(value));
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }

  onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.valueState.set(raw);

    const parsed = Number(raw);
    this.onChange(raw.trim() === '' || Number.isNaN(parsed) ? null : parsed);
  }

  onBlur(): void {
    this.onTouched();
  }
}
