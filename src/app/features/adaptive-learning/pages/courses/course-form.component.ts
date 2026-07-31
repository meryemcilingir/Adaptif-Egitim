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
import { AppNumberInputComponent } from '../../../../shared/components/app-number-input/app-number-input.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import { applyServerFieldErrors } from '../../../../shared/validators/server-errors';
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
  COURSE_LIMITS,
  Course,
  CourseCreateRequest,
} from '../../models/course.model';

/**
 * Ders oluşturma/düzenleme formu.
 * Sınırlar `COURSE_LIMITS`'ten okunur; sunucu aynı sabitleri kullanır.
 */
@Component({
  selector: 'app-course-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDialogComponent,
    AppFormFieldComponent,
    AppInputComponent,
    AppNumberInputComponent,
    AppSelectComponent,
    AppTextareaComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './course-form.component.html',
})
export class CourseFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);

  readonly course = input<Course | null>(null);
  readonly programs = input.required<readonly SelectOption[]>();
  readonly terms = input.required<readonly SelectOption[]>();
  readonly instructors = input.required<readonly SelectOption[]>();
  readonly saving = input(false);
  /** Belirli bir programdan açıldıysa program alanı önceden dolar. */
  readonly defaultProgramId = input<string | null>(null);

  readonly save = output<CourseCreateRequest>();
  readonly cancel = output<void>();

  readonly limits = COURSE_LIMITS;

  readonly categoryOptions: readonly SelectOption[] = COURSE_CATEGORIES.map((value) => ({
    value,
    label: COURSE_CATEGORY_LABELS[value],
  }));

  readonly levelOptions: readonly SelectOption[] = COURSE_LEVELS.map((value) => ({
    value,
    label: COURSE_LEVEL_LABELS[value],
  }));

  readonly form = this.formBuilder.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(COURSE_LIMITS.code.min),
        Validators.maxLength(COURSE_LIMITS.code.max),
      ],
    ],
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(COURSE_LIMITS.name.min),
        Validators.maxLength(COURSE_LIMITS.name.max),
      ],
    ],
    description: ['', [Validators.maxLength(COURSE_LIMITS.description.max)]],
    programId: ['', [Validators.required]],
    termId: ['', [Validators.required]],
    instructorId: ['', [Validators.required]],
    category: ['core', [Validators.required]],
    level: ['introductory', [Validators.required]],
    estimatedDurationHours: [
      COURSE_LIMITS.estimatedDurationHours.min as number | null,
      [
        Validators.required,
        Validators.min(COURSE_LIMITS.estimatedDurationHours.min),
        Validators.max(COURSE_LIMITS.estimatedDurationHours.max),
      ],
    ],
  });

  private readonly submittedState = signal(false);
  readonly submitted = this.submittedState.asReadonly();

  readonly isEditMode = computed(() => this.course() !== null);
  readonly title = computed(() => (this.isEditMode() ? 'Dersi düzenle' : 'Yeni ders'));

  ngOnInit(): void {
    const course = this.course();

    this.form.reset({
      code: course?.code ?? '',
      name: course?.name ?? '',
      description: course?.description ?? '',
      programId: course?.programId ?? this.defaultProgramId() ?? this.programs()[0]?.value ?? '',
      termId: course?.termId ?? this.terms()[0]?.value ?? '',
      instructorId: course?.instructorId ?? this.instructors()[0]?.value ?? '',
      category: course?.category ?? 'core',
      level: course?.level ?? 'introductory',
      estimatedDurationHours: course?.estimatedDurationHours ?? 30,
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
  get programControl() {
    return this.form.controls.programId;
  }
  get termControl() {
    return this.form.controls.termId;
  }
  get instructorControl() {
    return this.form.controls.instructorId;
  }
  get categoryControl() {
    return this.form.controls.category;
  }
  get levelControl() {
    return this.form.controls.level;
  }
  get durationControl() {
    return this.form.controls.estimatedDurationHours;
  }

  submit(): void {
    this.submittedState.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.save.emit({
      ...value,
      category: value.category as CourseCreateRequest['category'],
      level: value.level as CourseCreateRequest['level'],
      estimatedDurationHours: value.estimatedDurationHours ?? 0,
    });
  }

  applyServerErrors(error: ApiError): void {
    applyServerFieldErrors(this.form, error);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
