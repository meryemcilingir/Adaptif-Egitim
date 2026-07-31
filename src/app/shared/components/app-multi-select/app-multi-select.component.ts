import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { AppIconComponent } from '../app-icon/app-icon.component';

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  /** Seçilemez seçeneklerde nedenini açıklar (ör. döngü oluşturur). */
  readonly disabledReason?: string;
}

/**
 * Aranabilir çoklu seçim.
 *
 * Önkoşul seçimi gibi uzun listelerde kullanılır; seçilemeyen seçenekler
 * gizlenmez, NEDENİ ile birlikte devre dışı gösterilir — kullanıcı kısıtı öğrenir.
 */
@Component({
  selector: 'app-multi-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppMultiSelectComponent),
      multi: true,
    },
  ],
  templateUrl: './app-multi-select.component.html',
  styleUrl: './app-multi-select.component.scss',
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class AppMultiSelectComponent implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly inputId = input.required<string>();
  readonly options = input.required<readonly MultiSelectOption[]>();
  readonly placeholder = input('Seçiniz');
  readonly searchPlaceholder = input('Ara…');
  readonly maxSelected = input<number | null>(null);
  readonly invalid = input(false);
  readonly emptyMessage = input('Seçenek bulunamadı.');

  private readonly selectedState = signal<readonly string[]>([]);
  private readonly openState = signal(false);
  private readonly searchState = signal('');
  private readonly disabledState = signal(false);

  readonly selected = this.selectedState.asReadonly();
  readonly isOpen = this.openState.asReadonly();
  readonly search = this.searchState.asReadonly();
  readonly isDisabled = this.disabledState.asReadonly();

  readonly isFull = computed(() => {
    const max = this.maxSelected();
    return max !== null && this.selectedState().length >= max;
  });

  readonly selectedOptions = computed(() =>
    this.selectedState()
      .map((value) => this.options().find((option) => option.value === value))
      .filter((option): option is MultiSelectOption => option !== undefined),
  );

  readonly visibleOptions = computed(() => {
    const term = this.searchState().toLocaleLowerCase('tr-TR').trim();
    if (!term) return this.options();

    return this.options().filter(
      (option) =>
        option.label.toLocaleLowerCase('tr-TR').includes(term) ||
        (option.hint ?? '').toLocaleLowerCase('tr-TR').includes(term),
    );
  });

  private onChange: (value: readonly string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: readonly string[] | null): void {
    this.selectedState.set(value ?? []);
  }

  registerOnChange(fn: (value: readonly string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }

  isSelected(value: string): boolean {
    return this.selectedState().includes(value);
  }

  /** Seçili değilken sınır dolmuşsa veya seçenek kilitliyse tıklanamaz. */
  isOptionLocked(option: MultiSelectOption): boolean {
    if (option.disabled === true) return true;
    return this.isFull() && !this.isSelected(option.value);
  }

  toggle(): void {
    if (this.isDisabled()) return;
    this.openState.update((open) => !open);
  }

  close(): void {
    if (!this.openState()) return;
    this.openState.set(false);
    this.searchState.set('');
    this.onTouched();
  }

  onSearchInput(event: Event): void {
    this.searchState.set((event.target as HTMLInputElement).value);
  }

  select(option: MultiSelectOption): void {
    if (this.isOptionLocked(option)) return;

    const next = this.isSelected(option.value)
      ? this.selectedState().filter((value) => value !== option.value)
      : [...this.selectedState(), option.value];

    this.selectedState.set(next);
    this.onChange(next);
  }

  remove(value: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isDisabled()) return;

    const next = this.selectedState().filter((item) => item !== value);
    this.selectedState.set(next);
    this.onChange(next);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.openState()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
