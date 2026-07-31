import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { AppIconComponent } from '../app-icon/app-icon.component';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** Tek seçimli açılır liste (ControlValueAccessor). */
@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AppSelectComponent), multi: true },
  ],
  template: `
    <div class="select" [class.is-invalid]="invalid()" [class.is-disabled]="isDisabled()">
      <select
        class="select__control"
        [id]="selectId()"
        [value]="value()"
        [disabled]="isDisabled()"
        [attr.aria-invalid]="invalid()"
        (change)="onSelect($event)"
        (blur)="onBlur()"
      >
        @if (placeholder(); as text) {
          <option value="" disabled>{{ text }}</option>
        }
        @for (option of options(); track option.value) {
          <option [value]="option.value" [disabled]="option.disabled ?? false">
            {{ option.label }}
          </option>
        }
      </select>
      <app-icon class="select__chevron" name="chevron-down" [size]="15" />
    </div>
  `,
  styleUrl: './app-select.component.scss',
})
export class AppSelectComponent implements ControlValueAccessor {
  readonly selectId = input.required<string>();
  readonly options = input.required<readonly SelectOption[]>();
  readonly placeholder = input<string | null>('Seçiniz');
  readonly invalid = input(false);

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

  onSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.valueState.set(value);
    this.onChange(value);
  }

  onBlur(): void {
    this.onTouched();
  }
}
