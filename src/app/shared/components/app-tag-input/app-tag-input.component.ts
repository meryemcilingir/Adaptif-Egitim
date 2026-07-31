import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { AppIconComponent } from '../app-icon/app-icon.component';

/**
 * Etiket girişi.
 *
 * Sınırlar (etiket uzunluğu ve adedi) bileşenin İÇİNDE uygulanır: kullanıcı
 * sınırı aşan bir etiketi hiç ekleyemez ve nedenini anında görür. Form validator'ı
 * ikinci savunma hattıdır (PROJECT_RULES.md §5).
 */
@Component({
  selector: 'app-tag-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppTagInputComponent),
      multi: true,
    },
  ],
  templateUrl: './app-tag-input.component.html',
  styleUrl: './app-tag-input.component.scss',
})
export class AppTagInputComponent implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly placeholder = input('Etiket yazıp Enter’a basın');
  readonly maxTags = input(10);
  readonly maxTagLength = input(30);
  readonly invalid = input(false);
  /** Öneri listesi — tıklanınca eklenir. */
  readonly suggestions = input<readonly string[]>([]);

  private readonly tagsState = signal<readonly string[]>([]);
  private readonly draftState = signal('');
  private readonly disabledState = signal(false);
  private readonly hintState = signal<string | null>(null);

  readonly tags = this.tagsState.asReadonly();
  readonly draft = this.draftState.asReadonly();
  readonly isDisabled = this.disabledState.asReadonly();
  readonly hint = this.hintState.asReadonly();

  readonly isFull = computed(() => this.tagsState().length >= this.maxTags());
  readonly availableSuggestions = computed(() =>
    this.suggestions()
      .filter((suggestion) => !this.tagsState().includes(suggestion))
      .slice(0, 8),
  );

  private onChange: (value: readonly string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: readonly string[] | null): void {
    this.tagsState.set(value ?? []);
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

  onDraftInput(event: Event): void {
    this.draftState.set((event.target as HTMLInputElement).value);
    this.hintState.set(null);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commitDraft();
      return;
    }

    // Boş girişte Backspace son etiketi siler — hızlı düzeltme.
    if (
      event.key === 'Backspace' &&
      this.draftState().length === 0 &&
      this.tagsState().length > 0
    ) {
      this.remove(this.tagsState()[this.tagsState().length - 1]!);
    }
  }

  commitDraft(): void {
    const value = this.draftState().trim();
    if (value.length === 0) return;

    if (value.length > this.maxTagLength()) {
      this.hintState.set(`Etiket en fazla ${this.maxTagLength()} karakter olabilir.`);
      return;
    }
    if (this.isFull()) {
      this.hintState.set(`En fazla ${this.maxTags()} etiket eklenebilir.`);
      return;
    }
    if (
      this.tagsState().some(
        (tag) => tag.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'),
      )
    ) {
      this.hintState.set('Bu etiket zaten eklendi.');
      this.draftState.set('');
      return;
    }

    this.write([...this.tagsState(), value]);
    this.draftState.set('');
    this.hintState.set(null);
  }

  addSuggestion(tag: string): void {
    if (this.isFull() || this.isDisabled()) return;
    this.write([...this.tagsState(), tag]);
  }

  remove(tag: string): void {
    if (this.isDisabled()) return;
    this.write(this.tagsState().filter((item) => item !== tag));
    this.hintState.set(null);
  }

  onBlur(): void {
    this.commitDraft();
    this.onTouched();
  }

  private write(tags: readonly string[]): void {
    this.tagsState.set(tags);
    this.onChange(tags);
  }
}
