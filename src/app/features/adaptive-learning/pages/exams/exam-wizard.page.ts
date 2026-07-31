import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';

import { ApiError } from '../../../../core/api/api-error';
import { PermissionService } from '../../../../core/auth/permission.service';
import { createPageRequest } from '../../../../core/api/page-request';
import { AppBreadcrumbComponent } from '../../../../shared/components/app-breadcrumb/app-breadcrumb.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
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
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import { availableActions } from '../../domain/publish-workflow';
import { ExamBlueprint } from '../../models/blueprint.model';
import {
  EXAM_LIMITS,
  EXAM_WIZARD_STEP_HINTS,
  EXAM_WIZARD_STEP_LABELS,
  ExamWizardStep,
} from '../../models/exam.model';
import { Question } from '../../models/question.model';
import { BlueprintEditorComponent } from '../../components/exam/blueprint-editor.component';
import { ConstraintPanelComponent } from '../../components/exam/constraint-panel.component';
import { ExamPreviewComponent } from '../../components/exam/exam-preview.component';
import { QuestionPickerComponent } from '../../components/exam/question-picker.component';
import { WizardStepsComponent } from '../../components/exam/wizard-steps.component';
import { CourseRepository, OutcomeRepository } from '../../data-access/catalog.repository';
import { ExamFacade } from '../../data-access/exam.facade';
import { BlueprintRepository, ExamRepository } from '../../data-access/exam.repository';
import { QuestionRepository } from '../../data-access/question.repository';

/**
 * Sınav oluşturma sihirbazı (7 adım).
 *
 * · Adım kilitleri `ExamFacade.stepAvailability()` ile durum makinesinden gelir;
 *   sayfa kendi kuralını yazmaz.
 * · Taslak, değişiklikten 1,2 sn sonra otomatik kaydedilir; gösterge kullanıcıya
 *   "kaydediliyor / kaydedildi" bilgisini verir.
 * · Kaydedilmemiş değişiklik varken sayfadan ayrılmak onay ister
 *   (hem uygulama içi gezinme hem tarayıcı sekmesi kapatma).
 */
@Component({
  selector: 'app-exam-wizard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppMultiSelectComponent,
    AppNumberInputComponent,
    AppSelectComponent,
    AppTextareaComponent,
    BlueprintEditorComponent,
    ConstraintPanelComponent,
    ExamPreviewComponent,
    QuestionPickerComponent,
    ReactiveFormsModule,
    WizardStepsComponent,
  ],
  templateUrl: './exam-wizard.page.html',
  styleUrl: './exam-wizard.page.scss',
})
export class ExamWizardPage implements OnInit, OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly facade = inject(ExamFacade);
  private readonly exams = inject(ExamRepository);
  private readonly blueprints = inject(BlueprintRepository);
  private readonly questions = inject(QuestionRepository);
  private readonly courses = inject(CourseRepository);
  private readonly outcomes_ = inject(OutcomeRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  readonly limits = EXAM_LIMITS;
  readonly stepLabels = EXAM_WIZARD_STEP_LABELS;
  readonly stepHints = EXAM_WIZARD_STEP_HINTS;

  private readonly loadingState = signal(true);
  private readonly loadErrorState = signal<ApiError | null>(null);
  private readonly blueprintListState = signal<readonly ExamBlueprint[]>([]);
  private readonly cohortOptionsState = signal<readonly MultiSelectOption[]>([]);
  private readonly outcomeListState = signal<readonly { id: string; code: string; title: string }[]>(
    [],
  );
  private readonly poolState = signal<readonly Question[]>([]);
  private readonly publishingState = signal(false);

  readonly isLoading = this.loadingState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  readonly cohortOptions = this.cohortOptionsState.asReadonly();
  readonly outcomes = this.outcomeListState.asReadonly();
  readonly pool = this.poolState.asReadonly();
  readonly isPublishing = this.publishingState.asReadonly();

  /*
   * Yayın adımı, durum makinesinin O AN izin verdiği eylemi sunar.
   * Taslak sınav doğrudan yayına alınamaz (Draft → Review → Published);
   * bu yüzden buton "İncelemeye gönder" veya "Yayınla" olur.
   */
  readonly nextPublishAction = computed(() => {
    const state = this.facade.examDetail()?.exam.state ?? 'DRAFT';
    const actions = availableActions(state);
    return actions.find((action) => action.target === 'PUBLISHED') ?? actions[0] ?? null;
  });

  /**
   * İş akışı geçişleri ayrı bir yetkiye bağlıdır: sunucu, hedef durum ne olursa
   * olsun `exam:publish` ister. Yazma yetkisi tek başına yetmez — bu yüzden
   * yetkisiz kullanıcıya 403 ile biten bir buton gösterilmez.
   */
  readonly canRunPublishAction = computed(
    () => this.nextPublishAction() !== null && this.permissions.can('exam:publish'),
  );

  /**
   * Bilgi adımının formu.
   *
   * Alanlar değiştikçe taslak facade'e aktarılır; otomatik kayıt oradan tetiklenir.
   * Karakter sayaçları ve hata mesajları `AppFormField` tarafından bu kontrollerden
   * okunur — sayfa kendi mesajını yazmaz.
   */
  readonly form = this.formBuilder.nonNullable.group({
    title: [
      '',
      [
        Validators.required,
        Validators.minLength(EXAM_LIMITS.title.min),
        Validators.maxLength(EXAM_LIMITS.title.max),
      ],
    ],
    description: ['', [Validators.maxLength(EXAM_LIMITS.description.max)]],
    instructions: ['', [Validators.maxLength(EXAM_LIMITS.instructions.max)]],
    blueprintId: [''],
    cohortIds: [[] as readonly string[], [Validators.required]],
    durationMinutes: [
      60 as number | null,
      [
        Validators.required,
        Validators.min(EXAM_LIMITS.durationMinutes.min),
        Validators.max(EXAM_LIMITS.durationMinutes.max),
      ],
    ],
    opensAt: ['', [Validators.required]],
    closesAt: ['', [Validators.required]],
  });

  readonly courseCode = computed(() => this.facade.examDetail()?.courseCode ?? '');

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.pushDraft());
  }

  /** Form değerini taslağa aktarır; tarihler yerel girişten ISO'ya çevrilir. */
  private pushDraft(): void {
    const value = this.form.getRawValue();

    this.facade.patchDraft({
      title: value.title,
      description: value.description,
      instructions: value.instructions,
      blueprintId: value.blueprintId || null,
      cohortIds: value.cohortIds,
      durationMinutes: value.durationMinutes ?? 60,
      opensAt: toIso(value.opensAt),
      closesAt: toIso(value.closesAt),
    });
  }

  get titleControl() {
    return this.form.controls.title;
  }
  get descriptionControl() {
    return this.form.controls.description;
  }
  get instructionsControl() {
    return this.form.controls.instructions;
  }
  get blueprintControl() {
    return this.form.controls.blueprintId;
  }
  get cohortsControl() {
    return this.form.controls.cohortIds;
  }
  get durationControl() {
    return this.form.controls.durationMinutes;
  }
  get opensControl() {
    return this.form.controls.opensAt;
  }
  get closesControl() {
    return this.form.controls.closesAt;
  }

  readonly blueprintOptions = computed<readonly SelectOption[]>(() =>
    this.blueprintListState().map((blueprint) => ({
      value: blueprint.id,
      label: blueprint.cohortId
        ? `${blueprint.name} · gruba özel`
        : `${blueprint.name} · ders geneli`,
    })),
  );

  readonly selectedBlueprint = computed(() =>
    this.blueprintListState().find(
      (blueprint) => blueprint.id === this.facade.draft().blueprintId,
    ),
  );

  /** Seçili blueprint'in kazanım listesi tabloyu besler. */
  readonly blueprintOutcomes = computed(() => this.outcomeListState());

  readonly breadcrumbs = computed(() => [
    { label: 'Sınavlar', link: '/exams' },
    { label: this.facade.draft().title || 'Yeni sınav' },
  ]);

  /** Otomatik kayıt göstergesi metni. */
  readonly saveLabel = computed(() => {
    switch (this.facade.saveState()) {
      case 'saving':
        return 'Kaydediliyor…';
      case 'saved':
        return 'Taslak kaydedildi';
      case 'error':
        return 'Kaydedilemedi';
      default:
        return this.facade.isDirty() ? 'Kaydedilmemiş değişiklik' : 'Taslak güncel';
    }
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.facade.reset();
    this.facade.clearExamDetail();
  }

  /** Sekme kapatma / yenileme sırasında tarayıcı uyarısı. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.facade.isDirty()) event.preventDefault();
  }

  private load(): void {
    this.loadingState.set(true);
    this.loadErrorState.set(null);

    this.exams.detail(this.id()).subscribe({
      next: (detail) => {
        this.facade.startEditing(detail);

        this.form.patchValue(
          {
            title: detail.exam.title,
            description: detail.exam.description,
            instructions: detail.exam.instructions,
            blueprintId: detail.exam.blueprintId ?? '',
            cohortIds: detail.exam.cohortIds,
            durationMinutes: detail.exam.durationMinutes,
            opensAt: this.toLocalInput(detail.exam.opensAt),
            closesAt: this.toLocalInput(detail.exam.closesAt),
          },
          { emitEvent: false },
        );

        this.loadReferences(detail.exam.courseId);
        this.loadingState.set(false);
      },
      error: (error: ApiError) => {
        this.loadErrorState.set(error);
        this.loadingState.set(false);
      },
    });
  }

  private loadReferences(courseId: string): void {
    forkJoin({
      blueprints: this.blueprints.list(createPageRequest({ size: 100, filters: { courseId } })),
      questions: this.questions.list(
        createPageRequest({ size: 300, filters: { courseId, state: ['PUBLISHED'] } }),
      ),
      course: this.courses.get(courseId),
      outcomes: this.outcomes_.list(createPageRequest({ size: 200, filters: { courseId } })),
    }).subscribe({
      next: ({ blueprints, questions, course, outcomes }) => {
        this.blueprintListState.set(blueprints.items);
        this.poolState.set(questions.items);
        this.outcomeListState.set(
          outcomes.items.map((outcome) => ({
            id: outcome.id,
            code: outcome.code,
            title: outcome.title,
          })),
        );
        this.loadCohortLabels(course.cohortIds);
      },
    });
  }

  /** Grup adları ayrı bir uçtan gelmediği için detay payload'ından tamamlanır. */
  private loadCohortLabels(cohortIds: readonly string[]): void {
    const detail = this.facade.examDetail();
    if (!detail) return;

    const nameById = new Map(
      detail.exam.cohortIds.map((id, index) => [id, detail.cohortNames[index] ?? id] as const),
    );

    this.cohortOptionsState.set(
      cohortIds.map((id) => ({ value: id, label: nameById.get(id) ?? id })),
    );
  }

  /* ── Adım gezinme ────────────────────────────────────────────────────── */

  onStepSelect(step: ExamWizardStep): void {
    // Adım değişirken bekleyen taslak hemen kaydedilir.
    if (this.facade.isDirty()) this.facade.saveDraft();
    this.facade.goToStep(step);
  }

  next(): void {
    if (this.facade.isDirty()) this.facade.saveDraft();
    this.facade.nextStep();
  }

  previous(): void {
    this.facade.previousStep();
  }

  /* ── Alan güncellemeleri ─────────────────────────────────────────────── */

  /** ISO değeri `datetime-local` girişinin beklediği biçime çevirir. */
  toLocalInput(iso: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /* ── Soru seçimi ─────────────────────────────────────────────────────── */

  autoSelect(replace: boolean): void {
    this.facade.autoSelect(replace);
  }

  onAdd(questionId: string): void {
    this.facade.addQuestion(questionId);
  }

  onRemove(questionId: string): void {
    this.facade.removeQuestion(questionId);
  }

  onMove(event: { questionId: string; direction: -1 | 1 }): void {
    this.facade.moveQuestion(event.questionId, event.direction);
  }

  /* ── Yayınlama ───────────────────────────────────────────────────────── */

  async publish(): Promise<void> {
    const detail = this.facade.examDetail();
    const action = this.nextPublishAction();
    if (!detail || !action || !this.canRunPublishAction()) return;

    const result = await this.dialogs.ask({
      title: action.label,
      message: `"${this.facade.draft().title}" — ${action.description}`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (!result.confirmed) return;

    this.publishingState.set(true);

    /*
     * Yayın öncesi bekleyen taslak kaydedilir; sunucu güncel hâli doğrular.
     * Kayıt BİTMEDEN geçiş istenirse sürüm bayat kalır ve iyimser kilit 409
     * döndürür — bu yüzden iki istek zincirlenir ve geçiş, kayıttan dönen
     * güncel sınavla yapılır.
     */
    const saved = this.facade.saveDraft();
    const upToDate = saved ?? of(detail.exam);

    upToDate
      .pipe(switchMap((exam) => this.facade.transition(exam, action.target, result.reason)))
      .subscribe({
        next: (updated) => {
          this.publishingState.set(false);
          void this.router.navigate(['/exams', updated.id]);
        },
        error: () => this.publishingState.set(false),
      });
  }

  async exit(): Promise<void> {
    if (this.facade.isDirty()) {
      const confirmed = await this.dialogs.confirm({
        title: 'Sihirbazdan çık',
        message: 'Kaydedilmemiş değişiklikleriniz var. Çıkmadan önce kaydedilsin mi?',
        confirmLabel: 'Kaydet ve çık',
        tone: 'primary',
      });

      if (confirmed) this.facade.saveDraft();
    }

    void this.router.navigate(['/exams', this.id()]);
  }
}

/** `datetime-local` değerini ISO'ya çevirir; boş değer boş kalır. */
function toIso(local: string): string {
  if (!local) return '';
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}
