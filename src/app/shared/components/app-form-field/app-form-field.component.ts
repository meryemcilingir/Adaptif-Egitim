import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { merge } from 'rxjs';

import { resolveValidationMessage } from '../../validators/validation-messages';
import { AppIconComponent } from '../app-icon/app-icon.component';

/**
 * Form alanı sarmalayıcısı: etiket, yardımcı açıklama, zorunluluk işareti,
 * hata mesajı ve karakter sayacı (DESIGN_SYSTEM.md §8.5).
 *
 * REAKTİVİTE NOTU: Reactive Forms `AbstractControl` bir signal değildir; değeri
 * değişse de nesne kimliği aynı kalır. Bu yüzden `computed` yalnızca kontrolün
 * kendisini izleseydi sayaç ve hata mesajı asla güncellenmezdi. Çözüm: kontrolün
 * `valueChanges`/`statusChanges` akışına abone olup bir revizyon sayacı artırmak
 * ve türetilmiş değerlerin bu sayacı okumasını sağlamak.
 */
@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  template: `
    <label class="field__label" [attr.for]="fieldId()">
      {{ label() }}
      @if (required()) {
        <span class="field__required" aria-hidden="true">*</span>
      }
    </label>

    @if (hint(); as value) {
      <p class="field__hint text-xs text-subtle" [id]="fieldId() + '-hint'">{{ value }}</p>
    }

    <div class="field__control"><ng-content /></div>

    <div class="field__footer">
      @if (errorMessage(); as message) {
        <p class="field__error text-xs" [id]="fieldId() + '-error'" role="alert">
          <app-icon name="circle-alert" [size]="12" />
          {{ message }}
        </p>
      }

      @if (maxLength() !== null) {
        <span
          class="field__counter text-xs tabular"
          [class.text-subtle]="!isNearLimit()"
          [class.text-danger]="isNearLimit()"
        >
          {{ currentLength() }} / {{ maxLength() }}
        </span>
      }
    </div>
  `,
  styleUrl: './app-form-field.component.scss',
})
export class AppFormFieldComponent {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly required = input(false);
  readonly control = input<AbstractControl | null>(null);
  readonly maxLength = input<number | null>(null);
  /** Kontrol dokunulmadan hata gösterilsin mi (gönderim denemesi sonrası). */
  readonly forceShowError = input(false);

  /** Kontrolün her değişiminde artan revizyon — türetilmiş değerlerin tetikleyicisi. */
  private readonly revision = signal(0);

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      if (!control) return;

      const subscription = merge(control.valueChanges, control.statusChanges).subscribe(() =>
        this.revision.update((value) => value + 1),
      );
      onCleanup(() => subscription.unsubscribe());
    });
  }

  readonly showError = computed(() => {
    this.revision();
    const control = this.control();
    if (!control) return false;
    return control.invalid && (this.forceShowError() || control.touched || control.dirty);
  });

  readonly errorMessage = computed(() => {
    this.revision();
    return this.showError() ? resolveValidationMessage(this.control()?.errors ?? null) : null;
  });

  readonly currentLength = computed(() => {
    this.revision();
    return String(this.control()?.value ?? '').length;
  });

  /** Sınıra yaklaşınca sayaç uyarı rengine döner. */
  readonly isNearLimit = computed(() => {
    const max = this.maxLength();
    return max !== null && this.currentLength() >= max * 0.9;
  });
}
