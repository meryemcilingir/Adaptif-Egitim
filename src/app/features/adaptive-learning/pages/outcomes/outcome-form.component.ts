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
  AppMultiSelectComponent,
  MultiSelectOption,
} from '../../../../shared/components/app-multi-select/app-multi-select.component';
import { AppNumberInputComponent } from '../../../../shared/components/app-number-input/app-number-input.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { AppTagInputComponent } from '../../../../shared/components/app-tag-input/app-tag-input.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import { applyServerFieldErrors } from '../../../../shared/validators/server-errors';
import {
  COGNITIVE_LEVELS,
  COGNITIVE_LEVEL_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
} from '../../models/common.model';
import {
  OUTCOME_LIMITS,
  LearningOutcome,
  OutcomeCreateRequest,
} from '../../models/learning-outcome.model';

/**
 * Kazanım oluşturma/düzenleme formu.
 *
 * Önkoşul seçiminde döngü oluşturacak adaylar listede DEVRE DIŞI gösterilir ve
 * nedeni yazılır (BR-01) — kullanıcı hatayı kaydetmeye çalışmadan önce öğrenir.
 */
@Component({
  selector: 'app-outcome-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDialogComponent,
    AppFormFieldComponent,
    AppInputComponent,
    AppMultiSelectComponent,
    AppNumberInputComponent,
    AppSelectComponent,
    AppTagInputComponent,
    AppTextareaComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './outcome-form.component.html',
})
export class OutcomeFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);

  readonly outcome = input<LearningOutcome | null>(null);
  readonly courses = input.required<readonly SelectOption[]>();
  /** Önkoşul adayları — döngü oluşturanlar `disabled` işaretlenmiş gelir. */
  readonly prerequisiteOptions = input.required<readonly MultiSelectOption[]>();
  readonly tagSuggestions = input<readonly string[]>([]);
  readonly saving = input(false);
  readonly defaultCourseId = input<string | null>(null);

  readonly save = output<OutcomeCreateRequest>();
  readonly cancel = output<void>();

  readonly limits = OUTCOME_LIMITS;

  readonly levelOptions: readonly SelectOption[] = COGNITIVE_LEVELS.map((value) => ({
    value,
    label: COGNITIVE_LEVEL_LABELS[value],
  }));

  readonly difficultyOptions: readonly SelectOption[] = DIFFICULTIES.map((value) => ({
    value,
    label: DIFFICULTY_LABELS[value],
  }));

  readonly form = this.formBuilder.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(OUTCOME_LIMITS.code.min),
        Validators.maxLength(OUTCOME_LIMITS.code.max),
      ],
    ],
    title: [
      '',
      [
        Validators.required,
        Validators.minLength(OUTCOME_LIMITS.title.min),
        Validators.maxLength(OUTCOME_LIMITS.title.max),
      ],
    ],
    description: ['', [Validators.maxLength(OUTCOME_LIMITS.description.max)]],
    courseId: ['', [Validators.required]],
    level: ['remember', [Validators.required]],
    difficulty: ['medium', [Validators.required]],
    estimatedDurationMinutes: [
      60 as number | null,
      [
        Validators.required,
        Validators.min(OUTCOME_LIMITS.estimatedDurationMinutes.min),
        Validators.max(OUTCOME_LIMITS.estimatedDurationMinutes.max),
      ],
    ],
    weight: [
      1 as number | null,
      [
        Validators.required,
        Validators.min(OUTCOME_LIMITS.weight.min),
        Validators.max(OUTCOME_LIMITS.weight.max),
      ],
    ],
    tags: [[] as readonly string[], [Validators.maxLength(OUTCOME_LIMITS.tagCount.max)]],
    prerequisiteIds: [
      [] as readonly string[],
      [Validators.maxLength(OUTCOME_LIMITS.prerequisiteCount.max)],
    ],
  });

  private readonly submittedState = signal(false);
  readonly submitted = this.submittedState.asReadonly();

  readonly isEditMode = computed(() => this.outcome() !== null);
  readonly title2 = computed(() => (this.isEditMode() ? 'Kazanımı düzenle' : 'Yeni kazanım'));

  ngOnInit(): void {
    const outcome = this.outcome();

    this.form.reset({
      code: outcome?.code ?? '',
      title: outcome?.title ?? '',
      description: outcome?.description ?? '',
      courseId: outcome?.courseId ?? this.defaultCourseId() ?? this.courses()[0]?.value ?? '',
      level: outcome?.level ?? 'remember',
      difficulty: outcome?.difficulty ?? 'medium',
      estimatedDurationMinutes: outcome?.estimatedDurationMinutes ?? 60,
      weight: outcome?.weight ?? 1,
      tags: outcome?.tags ?? [],
      prerequisiteIds: outcome?.prerequisiteIds ?? [],
    });
  }

  get codeControl() {
    return this.form.controls.code;
  }
  get titleControl() {
    return this.form.controls.title;
  }
  get descriptionControl() {
    return this.form.controls.description;
  }
  get courseControl() {
    return this.form.controls.courseId;
  }
  get levelControl() {
    return this.form.controls.level;
  }
  get difficultyControl() {
    return this.form.controls.difficulty;
  }
  get durationControl() {
    return this.form.controls.estimatedDurationMinutes;
  }
  get weightControl() {
    return this.form.controls.weight;
  }
  get tagsControl() {
    return this.form.controls.tags;
  }
  get prerequisitesControl() {
    return this.form.controls.prerequisiteIds;
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
      level: value.level as OutcomeCreateRequest['level'],
      difficulty: value.difficulty as OutcomeCreateRequest['difficulty'],
      estimatedDurationMinutes: value.estimatedDurationMinutes ?? 0,
      weight: value.weight ?? 1,
    });
  }

  applyServerErrors(error: ApiError): void {
    applyServerFieldErrors(this.form, error);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
