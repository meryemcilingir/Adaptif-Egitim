import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../../core/api/api-error';
import { createPageRequest } from '../../../../core/api/page-request';
import { AppBreadcrumbComponent } from '../../../../shared/components/app-breadcrumb/app-breadcrumb.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppFormFieldComponent } from '../../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../../shared/components/app-input/app-input.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import {
  AppMultiSelectComponent,
  MultiSelectOption,
} from '../../../../shared/components/app-multi-select/app-multi-select.component';
import { AppNumberInputComponent } from '../../../../shared/components/app-number-input/app-number-input.component';
import { AppRichTextComponent } from '../../../../shared/components/app-rich-text/app-rich-text.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { AppTagInputComponent } from '../../../../shared/components/app-tag-input/app-tag-input.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import { httpUrl, tagList } from '../../../../shared/validators/domain.validators';
import { applyServerFieldErrors } from '../../../../shared/validators/server-errors';
import { richTextLength } from '../../../../shared/utils/rich-text.util';
import {
  COGNITIVE_LEVELS,
  COGNITIVE_LEVEL_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
} from '../../models/common.model';
import { LearningOutcome } from '../../models/learning-outcome.model';
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_KIND_LABELS,
  QUESTION_LIMITS,
  QUESTION_TYPES,
  QUESTION_TYPE_META,
  Question,
  QuestionCreateRequest,
  QuestionType,
} from '../../models/question.model';
import { validateAnswerShape } from '../../domain/question.rules';
import { QuestionPreviewComponent } from '../../components/question/question-preview.component';
import { CourseRepository, OutcomeRepository } from '../../data-access/catalog.repository';
import { QuestionFacade } from '../../data-access/question.facade';
import { QuestionRepository } from '../../data-access/question.repository';

/**
 * Soru editörü.
 *
 * Form, soru TÜRÜNE göre kendini yeniden şekillendirir: hangi cevap bloğunun
 * görüneceği `QUESTION_TYPE_META.answerShape` üzerinden belirlenir, tür adına
 * göre dallanma yoktur. Yeni bir tür eklendiğinde bu dosya değişmez.
 *
 * Kaydetmeden önce canlı önizleme açılabilir; önizleme öğrencinin göreceği
 * bileşenin ta kendisidir, ayrı bir "önizleme şablonu" yoktur.
 */
@Component({
  selector: 'app-question-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppCardComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppMultiSelectComponent,
    AppNumberInputComponent,
    AppRichTextComponent,
    AppSelectComponent,
    AppTagInputComponent,
    AppTextareaComponent,
    QuestionPreviewComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './question-editor.page.html',
  styleUrl: './question-editor.page.scss',
})
export class QuestionEditorPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly facade = inject(QuestionFacade);
  private readonly questions = inject(QuestionRepository);
  private readonly courses = inject(CourseRepository);
  private readonly outcomes = inject(OutcomeRepository);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  /** Düzenleme modunda soru kimliği; yeni soruda tanımsız. */
  readonly id = input<string | null>(null);

  readonly limits = QUESTION_LIMITS;
  readonly attachmentKinds: readonly SelectOption[] = ATTACHMENT_KINDS.map((value) => ({
    value,
    label: ATTACHMENT_KIND_LABELS[value],
  }));

  readonly typeOptions: readonly SelectOption[] = QUESTION_TYPES.map((value) => ({
    value,
    label: QUESTION_TYPE_META[value].label,
  }));
  readonly difficultyOptions: readonly SelectOption[] = DIFFICULTIES.map((value) => ({
    value,
    label: DIFFICULTY_LABELS[value],
  }));
  readonly levelOptions: readonly SelectOption[] = COGNITIVE_LEVELS.map((value) => ({
    value,
    label: COGNITIVE_LEVEL_LABELS[value],
  }));

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly outcomeListState = signal<readonly LearningOutcome[]>([]);
  private readonly submittedState = signal(false);
  private readonly savingState = signal(false);
  private readonly previewOpenState = signal(false);
  private readonly loadingState = signal(false);
  private readonly loadErrorState = signal<ApiError | null>(null);
  private readonly editingState = signal<Question | null>(null);

  /* Türe ve derse bağlı alanlar signal'a taşınır ki `computed` tepki verebilsin. */
  private readonly typeState = signal<QuestionType>('single_choice');
  private readonly courseIdState = signal('');

  readonly courseOptions = this.courseOptionsState.asReadonly();
  readonly submitted = this.submittedState.asReadonly();
  readonly isSaving = this.savingState.asReadonly();
  readonly isPreviewOpen = this.previewOpenState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  readonly editing = this.editingState.asReadonly();

  readonly isEditMode = computed(() => this.editingState() !== null);
  readonly meta = computed(() => QUESTION_TYPE_META[this.typeState()]);
  readonly shape = computed(() => this.meta().answerShape);

  readonly pageTitle = computed(() => (this.isEditMode() ? 'Soruyu düzenle' : 'Yeni soru'));

  readonly breadcrumbs = computed(() => [
    { label: 'Soru bankası', link: '/question-bank' },
    { label: this.pageTitle() },
  ]);

  /** Seçili dersin kazanımları — başka dersin kazanımı seçilemez (BR-27 muadili). */
  readonly outcomeOptions = computed<readonly MultiSelectOption[]>(() =>
    this.outcomeListState()
      .filter((outcome) => outcome.courseId === this.courseIdState())
      .map((outcome) => ({
        value: outcome.id,
        label: `${outcome.code} · ${outcome.title}`,
      })),
  );

  readonly form = this.formBuilder.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(QUESTION_LIMITS.code.min),
        Validators.maxLength(QUESTION_LIMITS.code.max),
      ],
    ],
    title: [
      '',
      [
        Validators.required,
        Validators.minLength(QUESTION_LIMITS.title.min),
        Validators.maxLength(QUESTION_LIMITS.title.max),
      ],
    ],
    stem: ['', [Validators.required, richTextMaxLength(QUESTION_LIMITS.stem.max)]],
    explanation: ['', [Validators.maxLength(QUESTION_LIMITS.explanation.max)]],
    type: ['single_choice', [Validators.required]],
    courseId: ['', [Validators.required]],
    outcomeIds: [
      [] as readonly string[],
      [Validators.required, Validators.maxLength(QUESTION_LIMITS.outcomeCount.max)],
    ],
    difficulty: ['medium', [Validators.required]],
    level: ['understand', [Validators.required]],
    points: [
      4 as number | null,
      [
        Validators.required,
        Validators.min(QUESTION_LIMITS.points.min),
        Validators.max(QUESTION_LIMITS.points.max),
      ],
    ],
    estimatedSolveTimeSeconds: [
      60 as number | null,
      [
        Validators.required,
        Validators.min(QUESTION_LIMITS.estimatedSolveTimeSeconds.min),
        Validators.max(QUESTION_LIMITS.estimatedSolveTimeSeconds.max),
      ],
    ],
    expectedAnswer: [''],
    numericTolerance: [0 as number | null],
    allowPartialCredit: [false],
    tags: [
      [] as readonly string[],
      [tagList({ max: QUESTION_LIMITS.tagCount.max, itemMax: QUESTION_LIMITS.tag.max })],
    ],
    options: this.formBuilder.array<ReturnType<QuestionEditorPage['optionGroup']>>([]),
    matchPairs: this.formBuilder.array<ReturnType<QuestionEditorPage['pairGroup']>>([]),
    sequenceItems: this.formBuilder.array<ReturnType<QuestionEditorPage['sequenceGroup']>>([]),
    attachments: this.formBuilder.array<ReturnType<QuestionEditorPage['attachmentGroup']>>([]),
  });

  /** Canlı önizleme için formdan üretilen geçici soru nesnesi. */
  readonly previewQuestion = computed<Question | null>(() => {
    if (!this.previewOpenState()) return null;
    return this.toPreviewQuestion();
  });

  /** Cevap yapısı uyarıları — sunucudakiyle AYNI saf fonksiyondan gelir. */
  readonly answerIssues = signal<readonly string[]>([]);

  constructor() {
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      this.typeState.set(type as QuestionType);
      this.syncAnswerControls(type as QuestionType);
    });

    this.form.controls.courseId.valueChanges.pipe(takeUntilDestroyed()).subscribe((courseId) => {
      this.courseIdState.set(courseId);
      // Ders değişince başka derse ait kazanım seçimi temizlenir.
      const valid = this.form.controls.outcomeIds.value.filter((id) =>
        this.outcomeListState().some(
          (outcome) => outcome.id === id && outcome.courseId === courseId,
        ),
      );
      if (valid.length !== this.form.controls.outcomeIds.value.length) {
        this.form.controls.outcomeIds.setValue(valid);
      }
    });
  }

  ngOnInit(): void {
    this.loadReferences();

    const id = this.id();
    if (id) this.loadQuestion(id);
    else this.syncAnswerControls('single_choice');
  }

  /* ── Form dizileri ───────────────────────────────────────────────────── */

  get optionsArray() {
    return this.form.controls.options as FormArray;
  }
  get pairsArray() {
    return this.form.controls.matchPairs as FormArray;
  }
  get sequenceArray() {
    return this.form.controls.sequenceItems as FormArray;
  }
  get attachmentsArray() {
    return this.form.controls.attachments as FormArray;
  }

  private optionGroup(text = '', correct = false, rationale = '') {
    return this.formBuilder.nonNullable.group({
      id: [`opt_${Math.random().toString(36).slice(2, 9)}`],
      text: [text, [Validators.required, Validators.maxLength(QUESTION_LIMITS.optionText.max)]],
      correct: [correct],
      rationale: [rationale, [Validators.maxLength(QUESTION_LIMITS.rationale.max)]],
    });
  }

  private pairGroup(left = '', right = '') {
    return this.formBuilder.nonNullable.group({
      id: [`mtc_${Math.random().toString(36).slice(2, 9)}`],
      left: [left, [Validators.required, Validators.maxLength(QUESTION_LIMITS.optionText.max)]],
      right: [right, [Validators.required, Validators.maxLength(QUESTION_LIMITS.optionText.max)]],
    });
  }

  private sequenceGroup(text = '', order = 1) {
    return this.formBuilder.nonNullable.group({
      id: [`seq_${Math.random().toString(36).slice(2, 9)}`],
      text: [text, [Validators.required, Validators.maxLength(QUESTION_LIMITS.optionText.max)]],
      order: [order, [Validators.required, Validators.min(1)]],
    });
  }

  private attachmentGroup(kind = 'image', url = '', name = '') {
    return this.formBuilder.nonNullable.group({
      id: [`att_${Math.random().toString(36).slice(2, 9)}`],
      kind: [kind],
      url: [url, [Validators.required, httpUrl(), Validators.maxLength(QUESTION_LIMITS.url.max)]],
      name: [name, [Validators.maxLength(QUESTION_LIMITS.optionText.max)]],
    });
  }

  addOption(): void {
    if (this.optionsArray.length >= this.meta().maxOptions) return;
    this.optionsArray.push(this.optionGroup());
  }

  removeOption(index: number): void {
    if (this.optionsArray.length <= this.meta().minOptions) return;
    this.optionsArray.removeAt(index);
  }

  /** Tekli seçimde bir seçeneği doğru yapmak diğerlerini otomatik kapatır. */
  onCorrectToggle(index: number, checked: boolean): void {
    if (!this.meta().multipleCorrect && checked) {
      this.optionsArray.controls.forEach((control, position) => {
        control.get('correct')?.setValue(position === index, { emitEvent: false });
      });
      return;
    }
    this.optionsArray.at(index).get('correct')?.setValue(checked);
  }

  addPair(): void {
    if (this.pairsArray.length >= QUESTION_LIMITS.pairCount.max) return;
    this.pairsArray.push(this.pairGroup());
  }

  removePair(index: number): void {
    if (this.pairsArray.length <= QUESTION_LIMITS.pairCount.min) return;
    this.pairsArray.removeAt(index);
  }

  addSequenceItem(): void {
    if (this.sequenceArray.length >= QUESTION_LIMITS.sequenceCount.max) return;
    this.sequenceArray.push(this.sequenceGroup('', this.sequenceArray.length + 1));
  }

  removeSequenceItem(index: number): void {
    if (this.sequenceArray.length <= QUESTION_LIMITS.sequenceCount.min) return;
    this.sequenceArray.removeAt(index);
    // Silinen öğeden sonra sıra numaraları yeniden 1..n olur.
    this.sequenceArray.controls.forEach((control, position) =>
      control.get('order')?.setValue(position + 1, { emitEvent: false }),
    );
  }

  addAttachment(): void {
    if (this.attachmentsArray.length >= QUESTION_LIMITS.attachmentCount.max) return;
    this.attachmentsArray.push(this.attachmentGroup());
  }

  removeAttachment(index: number): void {
    this.attachmentsArray.removeAt(index);
  }

  /* ── Kaydetme ────────────────────────────────────────────────────────── */

  togglePreview(): void {
    this.previewOpenState.update((open) => !open);
  }

  submit(): void {
    this.submittedState.set(true);

    const issues = validateAnswerShape(this.currentAnswerValue());
    this.answerIssues.set(issues.map((issue) => issue.message));

    if (this.form.invalid || issues.length > 0) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.toPayload();
    const editing = this.editingState();
    this.savingState.set(true);

    const request = editing ? this.facade.update(editing, payload) : this.facade.create(payload);

    request.subscribe({
      next: (saved) => {
        this.savingState.set(false);
        this.form.markAsPristine();
        void this.router.navigate(['/questions', saved.id]);
      },
      error: (error: ApiError) => {
        this.savingState.set(false);
        applyServerFieldErrors(this.form, error);
      },
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.dialogs.confirm({
        title: 'Değişiklikleri bırak',
        message: 'Kaydedilmemiş değişiklikleriniz var. Sayfadan çıkmak istiyor musunuz?',
        confirmLabel: 'Çık',
        tone: 'warning',
      });
      if (!confirmed) return;
    }

    const editing = this.editingState();
    void this.router.navigate(editing ? ['/questions', editing.id] : ['/question-bank']);
  }

  /* ── Kontrol erişimleri (şablon için) ────────────────────────────────── */

  get codeControl() {
    return this.form.controls.code;
  }
  get titleControl() {
    return this.form.controls.title;
  }
  get stemControl() {
    return this.form.controls.stem;
  }
  get explanationControl() {
    return this.form.controls.explanation;
  }
  get typeControl() {
    return this.form.controls.type;
  }
  get courseControl() {
    return this.form.controls.courseId;
  }
  get outcomeControl() {
    return this.form.controls.outcomeIds;
  }
  get difficultyControl() {
    return this.form.controls.difficulty;
  }
  get levelControl() {
    return this.form.controls.level;
  }
  get pointsControl() {
    return this.form.controls.points;
  }
  get solveTimeControl() {
    return this.form.controls.estimatedSolveTimeSeconds;
  }
  get expectedAnswerControl() {
    return this.form.controls.expectedAnswer;
  }
  get toleranceControl() {
    return this.form.controls.numericTolerance;
  }
  get tagsControl() {
    return this.form.controls.tags;
  }

  /** Zengin metin uzunluğu düz metin üzerinden sayılır (etiketler hariç). */
  stemLength(): number {
    return richTextLength(this.stemControl.value);
  }

  /* ── İç yardımcılar ──────────────────────────────────────────────────── */

  /**
   * Türe göre cevap kontrollerini kurar.
   * Yalnızca gerekli blok doldurulur; kullanılmayan diziler boşaltılır ki
   * kaydedilen veri türle tutarsız kalmasın.
   */
  private syncAnswerControls(type: QuestionType): void {
    const meta = QUESTION_TYPE_META[type];

    this.form.controls.points.setValue(meta.defaultPoints, { emitEvent: false });

    if (meta.answerShape !== 'options') this.optionsArray.clear();
    if (meta.answerShape !== 'pairs') this.pairsArray.clear();
    if (meta.answerShape !== 'sequence') this.sequenceArray.clear();

    if (meta.answerShape === 'options' && this.optionsArray.length === 0) {
      if (type === 'true_false') {
        this.optionsArray.push(this.optionGroup('Doğru', true));
        this.optionsArray.push(this.optionGroup('Yanlış', false));
      } else {
        for (let index = 0; index < meta.minOptions + 1; index++) {
          this.optionsArray.push(this.optionGroup('', index === 0));
        }
      }
    }

    if (meta.answerShape === 'pairs' && this.pairsArray.length === 0) {
      for (let index = 0; index < QUESTION_LIMITS.pairCount.min; index++) {
        this.pairsArray.push(this.pairGroup());
      }
    }

    if (meta.answerShape === 'sequence' && this.sequenceArray.length === 0) {
      for (let index = 0; index < QUESTION_LIMITS.sequenceCount.min; index++) {
        this.sequenceArray.push(this.sequenceGroup('', index + 1));
      }
    }

    // Beklenen cevap yalnızca sayısal ve kısa cevapta zorunludur.
    const needsExpected = meta.answerShape === 'numeric' || meta.answerShape === 'text';
    this.expectedAnswerControl.setValidators(needsExpected ? [Validators.required] : []);
    this.expectedAnswerControl.updateValueAndValidity({ emitEvent: false });
  }

  private currentAnswerValue() {
    const value = this.form.getRawValue();
    return {
      type: value.type as QuestionType,
      options: value.options as { text: string; correct: boolean }[],
      matchPairs: value.matchPairs as { left: string; right: string }[],
      sequenceItems: value.sequenceItems as { text: string; order: number }[],
      expectedAnswer: value.expectedAnswer || null,
    };
  }

  private toPayload(): QuestionCreateRequest {
    const value = this.form.getRawValue();

    return {
      code: value.code,
      title: value.title,
      stem: value.stem,
      type: value.type as QuestionType,
      courseId: value.courseId,
      outcomeIds: value.outcomeIds,
      difficulty: value.difficulty as QuestionCreateRequest['difficulty'],
      level: value.level as QuestionCreateRequest['level'],
      points: value.points ?? this.meta().defaultPoints,
      estimatedSolveTimeSeconds: value.estimatedSolveTimeSeconds ?? 60,
      options: value.options as QuestionCreateRequest['options'],
      matchPairs: value.matchPairs as QuestionCreateRequest['matchPairs'],
      sequenceItems: value.sequenceItems as QuestionCreateRequest['sequenceItems'],
      expectedAnswer: value.expectedAnswer || null,
      numericTolerance: this.shape() === 'numeric' ? (value.numericTolerance ?? 0) : null,
      explanation: value.explanation,
      attachments: value.attachments as QuestionCreateRequest['attachments'],
      tags: value.tags,
      allowPartialCredit: value.allowPartialCredit,
    };
  }

  /** Önizleme için formu tam bir `Question` nesnesine dönüştürür. */
  private toPreviewQuestion(): Question {
    const payload = this.toPayload();
    const editing = this.editingState();
    const now = new Date().toISOString();

    return {
      ...payload,
      id: editing?.id ?? 'preview',
      state: editing?.state ?? 'DRAFT',
      rubricId: editing?.rubricId ?? null,
      versionNumber: editing?.versionNumber ?? 1,
      pendingChangeNote: editing?.pendingChangeNote ?? null,
      publishedVersion: editing?.publishedVersion ?? null,
      usageCount: editing?.usageCount ?? 0,
      favoritedBy: editing?.favoritedBy ?? [],
      publishedAt: editing?.publishedAt ?? null,
      archivedAt: editing?.archivedAt ?? null,
      deletedAt: null,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      version: editing?.version ?? 1,
      createdBy: editing?.createdBy ?? '',
      updatedBy: editing?.updatedBy ?? '',
    };
  }

  private loadQuestion(id: string): void {
    this.loadingState.set(true);
    this.loadErrorState.set(null);

    this.questions.get(id).subscribe({
      next: (question) => {
        this.editingState.set(question);
        this.patchFrom(question);
        this.loadingState.set(false);
      },
      error: (error: ApiError) => {
        this.loadErrorState.set(error);
        this.loadingState.set(false);
      },
    });
  }

  private patchFrom(question: Question): void {
    this.typeState.set(question.type);
    this.courseIdState.set(question.courseId);

    this.form.patchValue(
      {
        code: question.code,
        title: question.title,
        stem: question.stem,
        explanation: question.explanation,
        type: question.type,
        courseId: question.courseId,
        outcomeIds: question.outcomeIds,
        difficulty: question.difficulty,
        level: question.level,
        points: question.points,
        estimatedSolveTimeSeconds: question.estimatedSolveTimeSeconds,
        expectedAnswer: question.expectedAnswer ?? '',
        numericTolerance: question.numericTolerance ?? 0,
        allowPartialCredit: question.allowPartialCredit,
        tags: question.tags,
      },
      { emitEvent: false },
    );

    this.optionsArray.clear();
    for (const option of question.options) {
      this.optionsArray.push(this.optionGroup(option.text, option.correct, option.rationale));
    }

    this.pairsArray.clear();
    for (const pair of question.matchPairs) {
      this.pairsArray.push(this.pairGroup(pair.left, pair.right));
    }

    this.sequenceArray.clear();
    for (const item of question.sequenceItems) {
      this.sequenceArray.push(this.sequenceGroup(item.text, item.order));
    }

    this.attachmentsArray.clear();
    for (const attachment of question.attachments) {
      this.attachmentsArray.push(
        this.attachmentGroup(attachment.kind, attachment.url, attachment.name),
      );
    }

    this.form.markAsPristine();
  }

  private loadReferences(): void {
    forkJoin({
      courses: this.courses.list(createPageRequest({ size: 200 })),
      outcomes: this.outcomes.list(createPageRequest({ size: 500 })),
    }).subscribe({
      next: ({ courses, outcomes }) => {
        this.courseOptionsState.set(
          courses.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        );
        this.outcomeListState.set(outcomes.items);

        // Yeni soruda ilk ders varsayılan seçilir; kazanım listesi boş kalmasın.
        if (!this.isEditMode() && !this.form.controls.courseId.value) {
          const first = courses.items[0];
          if (first) this.form.controls.courseId.setValue(first.id);
        }
      },
    });
  }
}

/** Zengin metin için maksimum uzunluk — HTML etiketleri sayılmaz. */
function richTextMaxLength(max: number) {
  return (control: { value: unknown }) => {
    const length = richTextLength(String(control.value ?? ''));
    return length > max ? { maxlength: { requiredLength: max, actualLength: length } } : null;
  };
}
