import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { AppErrorStateComponent } from '../../../shared/components/app-error-state/app-error-state.component';
import { AppFormFieldComponent } from '../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../shared/components/app-input/app-input.component';
import { AppLoadingStateComponent } from '../../../shared/components/app-loading-state/app-loading-state.component';
import { AppNumberInputComponent } from '../../../shared/components/app-number-input/app-number-input.component';
import { AppSelectComponent } from '../../../shared/components/app-select/app-select.component';
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  SETTING_LIMITS,
  TIME_ZONES,
  describePolicy,
  validateSettings,
} from '../../adaptive-learning/domain/system-settings.rules';
import { AdminFacade } from '../data-access/admin.facade';

/**
 * Sistem ayarları (Sprint 9 §6).
 *
 * Beş bölüm tek formda: genel, sınav, bildirim, güvenlik, analitik. Bölüm başına
 * ayrı kaydet düğmesi konmadı — ayarlar birbirine bağlı (oturum zaman aşımı ile
 * autosave aralığı gibi) ve parça parça kaydetmek geçici olarak tutarsız bir
 * yapılandırma bırakırdı.
 *
 * Hangi ayarın GERÇEKTEN etkili olduğu, hangisinin örnek olduğu her bölümde
 * yazar. Çalışmayan bir anahtarı çalışıyormuş gibi göstermek, yöneticinin
 * yapılandırmaya duyduğu güveni zedeler.
 */
@Component({
  selector: 'app-system-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppNumberInputComponent,
    AppSelectComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './system-settings.page.html',
  styleUrl: './system-settings.page.scss',
})
export class SystemSettingsPage implements OnInit {
  protected readonly facade = inject(AdminFacade);

  private readonly dirtyState = signal(false);

  readonly limits = SETTING_LIMITS;
  readonly settings = this.facade.settings;
  readonly saving = this.facade.saving;
  readonly error = this.facade.settingsError;

  readonly isLoading = computed(
    () => this.facade.settingsStatus() === 'loading' && this.facade.settings() === null,
  );
  readonly hasError = computed(() => this.facade.settingsStatus() === 'error');
  readonly isDirty = this.dirtyState.asReadonly();

  readonly timeZoneOptions = TIME_ZONES.map((zone) => ({ value: zone, label: zone }));
  readonly languageOptions = LANGUAGES.map((language) => ({
    value: language,
    label: LANGUAGE_LABELS[language],
  }));

  readonly form = new FormGroup({
    platformName: new FormControl('', { nonNullable: true }),
    logoInitials: new FormControl('', { nonNullable: true }),
    timeZone: new FormControl('Europe/Istanbul', { nonNullable: true }),
    language: new FormControl('tr', { nonNullable: true }),

    examDurationMinutes: new FormControl(60, { nonNullable: true }),
    autosaveSeconds: new FormControl(15, { nonNullable: true }),
    regradeEnabled: new FormControl(true, { nonNullable: true }),

    emailEnabled: new FormControl(false, { nonNullable: true }),
    systemNotificationsEnabled: new FormControl(true, { nonNullable: true }),

    sessionTimeoutMinutes: new FormControl(45, { nonNullable: true }),
    passwordMinLength: new FormControl(8, { nonNullable: true }),
    passwordRequireNumber: new FormControl(true, { nonNullable: true }),
    passwordRequireUppercase: new FormControl(true, { nonNullable: true }),
    passwordRequireSymbol: new FormControl(false, { nonNullable: true }),
    loginAttempts: new FormControl(5, { nonNullable: true }),

    dataRetentionMonths: new FormControl(24, { nonNullable: true }),
    exportRowLimit: new FormControl(5000, { nonNullable: true }),
  });

  /**
   * Form değerinin sinyal karşılığı.
   *
   * Reactive Forms sinyal değildir; `computed` içinde `getRawValue()` çağırmak
   * bağımlılık kurmaz. Tetikleyici olarak bir boole kullanmak da yetmiyordu:
   * bayrak bir kez `true` olduktan sonra değişmediği için hesaplama bir daha
   * tazelenmiyor ve ihlal listesi ilk hâlinde donuyordu.
   */
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Kaydetmeden önce görülen ihlaller — sunucu da aynı fonksiyonu çalıştırır. */
  readonly violations = computed(() => {
    void this.formValue();
    return validateSettings(this.form.getRawValue());
  });

  readonly canSave = computed(() => this.violations().length === 0);

  /** Parola politikasının insan diline çevrilmiş hâli. */
  readonly policyText = computed(() => {
    void this.formValue();
    const value = this.form.getRawValue();

    return describePolicy({
      minLength: value.passwordMinLength,
      requireNumber: value.passwordRequireNumber,
      requireUppercase: value.passwordRequireUppercase,
      requireSymbol: value.passwordRequireSymbol,
    });
  });

  constructor() {
    // Doğrulama ve önizleme metni form değiştikçe tazelenir.
    this.form.valueChanges.subscribe(() => this.dirtyState.set(true));

    /*
     * Sunucudan gelen ayarlar forma yazılır.
     *
     * `emitEvent: false`: doldurma işlemi formu "kirli" saymamalı, yoksa
     * kullanıcı hiçbir şey değiştirmeden "kaydedilmemiş değişiklik" uyarısı görürdü.
     */
    effect(() => {
      const settings = this.settings();
      if (!settings) return;

      untracked(() => {
        this.form.patchValue(settings, { emitEvent: false });
        this.dirtyState.set(false);
      });
    });
  }

  ngOnInit(): void {
    this.facade.loadSettings();
  }

  save(): void {
    if (!this.canSave()) return;

    this.facade.saveSettings(this.form.getRawValue()).subscribe({
      next: (settings) => {
        this.form.patchValue(settings, { emitEvent: false });
        this.dirtyState.set(false);
      },
      error: () => undefined,
    });
  }

  reset(): void {
    const settings = this.settings();
    if (!settings) return;

    this.form.patchValue(settings, { emitEvent: false });
    this.dirtyState.set(false);
  }

  /** Bir alanın ihlal mesajı — alanın altında gösterilir. */
  violationFor(field: string): string | null {
    return this.violations().find((violation) => violation.field === field)?.message ?? null;
  }
}
