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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
import { AppTagInputComponent } from '../../../../shared/components/app-tag-input/app-tag-input.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import { httpUrl, tagList } from '../../../../shared/validators/domain.validators';
import { applyServerFieldErrors } from '../../../../shared/validators/server-errors';
import {
  COGNITIVE_LEVELS,
  COGNITIVE_LEVEL_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
} from '../../models/common.model';
import {
  CONTENT_LIMITS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  ContentCreateRequest,
  ContentItem,
} from '../../models/content-item.model';
import { LearningOutcome } from '../../models/learning-outcome.model';

/**
 * İçerik oluşturma/düzenleme formu.
 *
 * Kazanım listesi seçilen derse göre daraltılır — sunucudaki "kazanım derse ait
 * olmalı" kuralı (BR-22) kullanıcıya hata olarak değil, seçenek olarak yansır.
 * Dış bağlantı türünde kaynak adresi zorunlu hâle gelir.
 */
@Component({
  selector: 'app-content-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDialogComponent,
    AppFormFieldComponent,
    AppInputComponent,
    AppNumberInputComponent,
    AppSelectComponent,
    AppTagInputComponent,
    AppTextareaComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './content-form.component.html',
})
export class ContentFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);

  readonly content = input<ContentItem | null>(null);
  readonly courses = input.required<readonly SelectOption[]>();
  /** Tüm kazanımlar — ders seçimine göre filtrelenir. */
  readonly outcomes = input.required<readonly LearningOutcome[]>();
  readonly tagSuggestions = input<readonly string[]>([]);
  readonly defaultCourseId = input<string | null>(null);
  readonly saving = input(false);

  readonly save = output<ContentCreateRequest>();
  readonly cancel = output<void>();

  readonly limits = CONTENT_LIMITS;

  readonly typeOptions: readonly SelectOption[] = CONTENT_TYPES.map((value) => ({
    value,
    label: CONTENT_TYPE_LABELS[value],
  }));

  readonly levelOptions: readonly SelectOption[] = COGNITIVE_LEVELS.map((value) => ({
    value,
    label: COGNITIVE_LEVEL_LABELS[value],
  }));

  readonly difficultyOptions: readonly SelectOption[] = DIFFICULTIES.map((value) => ({
    value,
    label: DIFFICULTY_LABELS[value],
  }));

  readonly form = this.formBuilder.nonNullable.group({
    title: [
      '',
      [
        Validators.required,
        Validators.minLength(CONTENT_LIMITS.title.min),
        Validators.maxLength(CONTENT_LIMITS.title.max),
      ],
    ],
    description: ['', [Validators.maxLength(CONTENT_LIMITS.description.max)]],
    type: ['video', [Validators.required]],
    courseId: ['', [Validators.required]],
    outcomeId: ['', [Validators.required]],
    difficulty: ['medium', [Validators.required]],
    level: ['understand', [Validators.required]],
    estimatedDurationMinutes: [
      20 as number | null,
      [
        Validators.required,
        Validators.min(CONTENT_LIMITS.estimatedDurationMinutes.min),
        Validators.max(CONTENT_LIMITS.estimatedDurationMinutes.max),
      ],
    ],
    tags: [
      [] as readonly string[],
      [tagList({ max: CONTENT_LIMITS.tagCount.max, itemMax: CONTENT_LIMITS.tag.max })],
    ],
    resourceUrl: ['', [httpUrl(), Validators.maxLength(CONTENT_LIMITS.url.max)]],
    thumbnailUrl: ['', [httpUrl(), Validators.maxLength(CONTENT_LIMITS.url.max)]],
  });

  private readonly submittedState = signal(false);
  private readonly courseIdState = signal('');
  private readonly typeState = signal('video');

  readonly submitted = this.submittedState.asReadonly();
  readonly isEditMode = computed(() => this.content() !== null);
  readonly dialogTitle = computed(() => (this.isEditMode() ? 'İçeriği düzenle' : 'Yeni içerik'));

  /** Seçili dersin kazanımları — başka dersin kazanımı seçilemez. */
  readonly outcomeOptions = computed<readonly SelectOption[]>(() =>
    this.outcomes()
      .filter((outcome) => outcome.courseId === this.courseIdState())
      .map((outcome) => ({ value: outcome.id, label: `${outcome.code} · ${outcome.title}` })),
  );

  readonly isResourceRequired = computed(() => this.typeState() === 'external_link');

  constructor() {
    // Ders değişince kazanım listesi daralır; artık geçersiz olan seçim temizlenir.
    this.form.controls.courseId.valueChanges.pipe(takeUntilDestroyed()).subscribe((courseId) => {
      this.courseIdState.set(courseId);
      const current = this.form.controls.outcomeId.value;
      const stillValid = this.outcomes().some(
        (outcome) => outcome.id === current && outcome.courseId === courseId,
      );
      if (!stillValid) this.form.controls.outcomeId.setValue('');
    });

    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      this.typeState.set(type);
      this.applyResourceRule(type);
    });
  }

  ngOnInit(): void {
    const content = this.content();
    const courseId = content?.courseId ?? this.defaultCourseId() ?? this.courses()[0]?.value ?? '';

    this.form.reset({
      title: content?.title ?? '',
      description: content?.description ?? '',
      type: content?.type ?? 'video',
      courseId,
      outcomeId: content?.outcomeId ?? '',
      difficulty: content?.difficulty ?? 'medium',
      level: content?.level ?? 'understand',
      estimatedDurationMinutes: content?.estimatedDurationMinutes ?? 20,
      tags: content?.tags ?? [],
      resourceUrl: content?.resourceUrl ?? '',
      thumbnailUrl: content?.thumbnailUrl ?? '',
    });

    this.courseIdState.set(courseId);
    this.typeState.set(content?.type ?? 'video');
    this.applyResourceRule(content?.type ?? 'video');
  }

  get titleControl() {
    return this.form.controls.title;
  }
  get descriptionControl() {
    return this.form.controls.description;
  }
  get typeControl() {
    return this.form.controls.type;
  }
  get courseControl() {
    return this.form.controls.courseId;
  }
  get outcomeControl() {
    return this.form.controls.outcomeId;
  }
  get difficultyControl() {
    return this.form.controls.difficulty;
  }
  get levelControl() {
    return this.form.controls.level;
  }
  get durationControl() {
    return this.form.controls.estimatedDurationMinutes;
  }
  get tagsControl() {
    return this.form.controls.tags;
  }
  get resourceControl() {
    return this.form.controls.resourceUrl;
  }
  get thumbnailControl() {
    return this.form.controls.thumbnailUrl;
  }

  submit(): void {
    this.submittedState.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.save.emit({
      title: value.title,
      description: value.description,
      type: value.type as ContentCreateRequest['type'],
      courseId: value.courseId,
      outcomeId: value.outcomeId,
      difficulty: value.difficulty as ContentCreateRequest['difficulty'],
      level: value.level as ContentCreateRequest['level'],
      estimatedDurationMinutes: value.estimatedDurationMinutes ?? 0,
      tags: value.tags,
      resourceUrl: value.resourceUrl.trim() || null,
      thumbnailUrl: value.thumbnailUrl.trim() || null,
    });
  }

  applyServerErrors(error: ApiError): void {
    applyServerFieldErrors(this.form, error);
  }

  onCancel(): void {
    this.cancel.emit();
  }

  /** Dış bağlantı türünde kaynak adresi zorunludur. */
  private applyResourceRule(type: string): void {
    const control = this.form.controls.resourceUrl;
    const validators = [httpUrl(), Validators.maxLength(CONTENT_LIMITS.url.max)];

    control.setValidators(
      type === 'external_link' ? [Validators.required, ...validators] : validators,
    );
    control.updateValueAndValidity({ emitEvent: false });
  }
}
