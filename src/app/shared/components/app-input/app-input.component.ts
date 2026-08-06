import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { AppIconName } from '../../icons/app-icons';
import { AppIconComponent } from '../app-icon/app-icon.component';

export type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'search'
  | 'url'
  | 'tel'
  /** Tarayıcının kendi tarih seçicisi — ayrı bir takvim bileşeni yazılmadı. */
  | 'date';

/**
 * Metin girişi (ControlValueAccessor).
 * Görsel durum (hata/odak/devre dışı) tek yerde tanımlıdır; ekranlar ham `<input>` yazmaz.
 */
@Component({
  selector: 'app-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="input" [class.is-invalid]="invalid()" [class.is-disabled]="isDisabled()">
      @if (icon(); as name) {
        <app-icon class="input__icon" [name]="name" [size]="15" />
      }

      <input
        class="input__control"
        [id]="inputId()"
        [type]="type()"
        [placeholder]="placeholder()"
        [value]="value()"
        [disabled]="isDisabled()"
        [attr.autocomplete]="autocomplete()"
        [attr.inputmode]="inputMode()"
        [attr.maxlength]="maxLength()"
        [attr.aria-invalid]="invalid()"
        [attr.aria-describedby]="describedBy()"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />

      <ng-content select="[input-suffix]" />
    </div>
  `,
  styleUrl: './app-input.component.scss',
})
export class AppInputComponent implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly type = input<InputType>('text');
  readonly placeholder = input('');
  readonly icon = input<AppIconName | null>(null);
  readonly invalid = input(false);
  readonly autocomplete = input<string | null>(null);
  readonly inputMode = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  /**
   * Tarayıcı seviyesinde sert sınır; form validator'ı ile aynı değeri alır.
   * `AppTextarea` ile aynı sözleşme — iki giriş bileşeni arasında fark olması,
   * sınırın hangi alanda geçerli olduğunu ekran yazarına bakmadan
   * anlaşılmaz kılıyordu.
   */
  readonly maxLength = input<number | null>(null);

  private readonly valueState = signal('');
  private readonly disabledState = signal(false);

  readonly value = this.valueState.asReadonly();
  readonly isDisabled = computed(() => this.disabledState());

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | number | null): void {
    this.valueState.set(value === null || value === undefined ? '' : String(value));
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
    const value = (event.target as HTMLInputElement).value;
    this.valueState.set(value);
    this.onChange(value);
  }

  onBlur(): void {
    this.onTouched();
  }
}
