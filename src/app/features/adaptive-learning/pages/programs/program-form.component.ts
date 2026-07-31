import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiError } from '../../../../core/api/api-error';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppDialogComponent } from '../../../../shared/components/app-dialog/app-dialog.component';
import { AppFormFieldComponent } from '../../../../shared/components/app-form-field/app-form-field.component';
import { AppInputComponent } from '../../../../shared/components/app-input/app-input.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import { applyServerFieldErrors } from '../../../../shared/validators/server-errors';
import { PROGRAM_LIMITS, Program, ProgramCreateRequest } from '../../models/program.model';

/**
 * Program oluşturma/düzenleme formu.
 *
 * Bileşen yalnızca diyalog açıkken oluşturulur (`@if` ile), bu yüzden başlangıç
 * değerleri `ngOnInit`'te bir kez kurulur — girdi senkronizasyonu için `effect`
 * gerekmez, form durumu her açılışta temiz başlar.
 *
 * Doğrulama sınırları `PROGRAM_LIMITS`'ten okunur; aynı sabitler sunucu tarafında
 * da kullanılır (PROJECT_RULES.md §5).
 */
@Component({
  selector: 'app-program-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDialogComponent,
    AppFormFieldComponent,
    AppInputComponent,
    AppSelectComponent,
    AppTextareaComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './program-form.component.html',
})
export class ProgramFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);

  /** Dolu ise düzenleme, boş ise oluşturma modudur. */
  readonly program = input<Program | null>(null);
  readonly coordinators = input.required<readonly SelectOption[]>();
  readonly saving = input(false);

  readonly save = output<ProgramCreateRequest>();
  readonly cancel = output<void>();

  readonly limits = PROGRAM_LIMITS;

  readonly form = this.formBuilder.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(PROGRAM_LIMITS.code.min),
        Validators.maxLength(PROGRAM_LIMITS.code.max),
      ],
    ],
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(PROGRAM_LIMITS.name.min),
        Validators.maxLength(PROGRAM_LIMITS.name.max),
      ],
    ],
    description: ['', [Validators.maxLength(PROGRAM_LIMITS.description.max)]],
    coordinatorId: ['', [Validators.required]],
  });

  private readonly submittedState = signal(false);
  readonly submitted = this.submittedState.asReadonly();

  readonly isEditMode = computed(() => this.program() !== null);
  readonly title = computed(() => (this.isEditMode() ? 'Programı düzenle' : 'Yeni program'));

  ngOnInit(): void {
    const program = this.program();

    this.form.reset({
      code: program?.code ?? '',
      name: program?.name ?? '',
      description: program?.description ?? '',
      coordinatorId: program?.coordinatorId ?? this.coordinators()[0]?.value ?? '',
    });
  }

  get codeControl() {
    return this.form.controls.code;
  }
  get nameControl() {
    return this.form.controls.name;
  }
  get descriptionControl() {
    return this.form.controls.description;
  }
  get coordinatorControl() {
    return this.form.controls.coordinatorId;
  }

  submit(): void {
    this.submittedState.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.save.emit(this.form.getRawValue());
  }

  /** Sunucu doğrulama hatalarını ilgili alanlara yazar. */
  applyServerErrors(error: ApiError): void {
    applyServerFieldErrors(this.form, error);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
