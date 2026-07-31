import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { ApiError } from '../../../../core/api/api-error';
import { AuthFacade } from '../../../../core/auth/auth.facade';
import { ROLE_LABELS, Role } from '../../../../core/auth/permission.model';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppFormFieldComponent } from '../../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../../shared/components/app-input/app-input.component';

interface DemoAccount {
  readonly email: string;
  readonly role: Role;
  readonly description: string;
}

/** AI_CONTEXT.md §9 ile birebir aynı demo hesaplar. */
const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'student@adaptif.dev', role: 'STUDENT', description: 'Çalışma planı ve sınav oturumu' },
  {
    email: 'instructor@adaptif.dev',
    role: 'INSTRUCTOR',
    description: 'İçerik, soru ve değerlendirme',
  },
  {
    email: 'specialist@adaptif.dev',
    role: 'ASSESSMENT_SPECIALIST',
    description: 'Soru kalitesi ve madde analizi',
  },
  {
    email: 'manager@adaptif.dev',
    role: 'PROGRAM_MANAGER',
    description: 'Program, cohort ve yayın',
  },
  { email: 'observer@adaptif.dev', role: 'OBSERVER', description: 'Salt okunur raporlar' },
  { email: 'admin@adaptif.dev', role: 'PLATFORM_ADMIN', description: 'Sistem ve denetim kaydı' },
];

const DEMO_PASSWORD = 'demo1234';

/**
 * Giriş ekranı.
 * Demo hesap seçici, değerlendiricinin rol farklarını hızlıca denemesini sağlar.
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthFacade);
  private readonly route = inject(ActivatedRoute);

  readonly demoAccounts = DEMO_ACCOUNTS;
  readonly roleLabels = ROLE_LABELS;

  readonly form = this.formBuilder.nonNullable.group({
    email: ['student@adaptif.dev', [Validators.required, Validators.email]],
    password: [DEMO_PASSWORD, [Validators.required, Validators.minLength(6)]],
  });

  private readonly submittedState = signal(false);
  readonly submitted = this.submittedState.asReadonly();
  readonly isSubmitting = this.auth.isAuthenticating;
  readonly error = this.auth.error;

  readonly errorMessage = computed(() => this.error()?.message ?? null);

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  useDemoAccount(account: DemoAccount): void {
    this.form.setValue({ email: account.email, password: DEMO_PASSWORD });
    this.submit();
  }

  submit(): void {
    this.submittedState.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/learning/dashboard';

    this.auth.login(this.form.getRawValue(), returnUrl).subscribe({
      // Hata durumu store'da tutulur ve şablonda gösterilir; burada ek işlem gerekmez.
      error: (_error: ApiError) => undefined,
    });
  }
}
