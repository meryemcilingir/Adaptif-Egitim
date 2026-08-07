import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { createPageRequest } from '../../../core/api/page-request';
import { ToastStore } from '../../../core/observability/toast.store';
import { BlueprintOutcomeRow } from '../models/blueprint.model';
import {
  EXAM_WIZARD_STEPS,
  Exam,
  ExamCreateRequest,
  ExamDetail,
  ExamQuestionView,
  ExamWizardStep,
} from '../models/exam.model';
import { buildConstraintSnapshot } from '../domain/exam-validation';
import { CatalogFacade } from './catalog.facade';
import { BlueprintRepository, ExamRepository } from './exam.repository';

/** Wizard'ın düzenlediği, henüz kaydedilmemiş sınav bilgisi. */
export interface ExamDraft {
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly courseId: string;
  readonly blueprintId: string | null;
  readonly cohortIds: readonly string[];
  readonly durationMinutes: number;
  readonly opensAt: string;
  readonly closesAt: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Sınav orkestrasyonu ve wizard durumu.
 *
 * Kısıt paneli SUNUCUYA GİTMEDEN hesaplanır: taslak alanları + soru listesi +
 * blueprint satırları istemcide `buildConstraintSnapshot()`'a verilir. Bu, mock
 * sunucunun yayına almadan önce çalıştırdığı fonksiyonun aynısıdır; panel ile
 * sunucu farklı karar veremez.
 */
@Injectable({ providedIn: 'root' })
export class ExamFacade extends CatalogFacade<Exam, ExamCreateRequest> {
  private readonly repository = inject(ExamRepository);
  private readonly blueprints = inject(BlueprintRepository);
  private readonly toastStore = inject(ToastStore);

  /* ── Detay ───────────────────────────────────────────────────────────── */
  private readonly detailState = signal<ExamDetail | null>(null);
  private readonly detailStatusState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly detailErrorState = signal<ApiError | null>(null);

  /* ── Wizard ──────────────────────────────────────────────────────────── */
  private readonly examIdState = signal<string | null>(null);
  private readonly draftState = signal<ExamDraft>(emptyDraft());
  private readonly questionsState = signal<readonly ExamQuestionView[]>([]);
  private readonly blueprintRowsState = signal<readonly BlueprintOutcomeRow[]>([]);
  /** Bağlı blueprint YAYINDA mı — yalnızca yayındaki plan "uygun" sayılır. */
  private readonly blueprintPublishedState = signal(false);
  private readonly targetPointsState = signal(0);
  private readonly siblingTitlesState = signal<readonly string[]>([]);
  private readonly stepState = signal<ExamWizardStep>('information');
  private readonly dirtyState = signal(false);
  private readonly saveStateState = signal<SaveState>('idle');
  private readonly lastSavedAtState = signal<string | null>(null);
  private readonly busyState = signal(false);

  private autosaveHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super({
      repository: inject(ExamRepository),
      toast: inject(ToastStore),
      labels: { entity: 'Sınav', nameOf: (item) => (item as Exam).title },
      initialQuery: { sort: { field: 'opensAt', direction: 'asc' } },
    });
  }

  /* ── Detay yüzeyi ────────────────────────────────────────────────────── */
  readonly examDetail = this.detailState.asReadonly();
  readonly examDetailError = this.detailErrorState.asReadonly();
  readonly isExamDetailLoading = computed(() => this.detailStatusState() === 'loading');
  readonly hasExamDetailError = computed(() => this.detailStatusState() === 'error');

  loadExamDetail(id: string): void {
    this.detailStatusState.set('loading');
    this.detailErrorState.set(null);

    this.repository.detail(id).subscribe({
      next: (detail) => {
        this.detailState.set(detail);
        this.detailStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.detailErrorState.set(error);
        this.detailStatusState.set('error');
      },
    });
  }

  clearExamDetail(): void {
    this.detailState.set(null);
    this.detailStatusState.set('idle');
  }

  /* ── Wizard yüzeyi ───────────────────────────────────────────────────── */
  readonly examId = this.examIdState.asReadonly();
  readonly draft = this.draftState.asReadonly();
  readonly questions = this.questionsState.asReadonly();
  readonly blueprintRows = this.blueprintRowsState.asReadonly();
  readonly step = this.stepState.asReadonly();
  readonly isDirty = this.dirtyState.asReadonly();
  readonly saveState = this.saveStateState.asReadonly();
  readonly lastSavedAt = this.lastSavedAtState.asReadonly();
  readonly isBusy = this.busyState.asReadonly();

  /**
   * Canlı kısıt paneli.
   *
   * Taslağın herhangi bir alanı, soru listesi veya blueprint değiştiğinde
   * kendiliğinden yeniden hesaplanır — ek bir tetikleyici gerekmez.
   */
  readonly constraints = computed(() => {
    const draft = this.draftState();

    return buildConstraintSnapshot({
      title: draft.title,
      durationMinutes: draft.durationMinutes,
      opensAt: draft.opensAt,
      closesAt: draft.closesAt,
      cohortIds: draft.cohortIds,
      questions: this.questionsState().map((question) => ({
        questionId: question.questionId,
        points: question.points,
        difficulty: question.difficulty,
        outcomeIds: question.outcomeIds,
        estimatedSolveTimeSeconds: question.estimatedSolveTimeSeconds,
        isPublished: question.isPublished,
        isLatestVersion: question.isLatestVersion,
      })),
      blueprintRows: this.blueprintRowsState(),
      hasBlueprint: draft.blueprintId !== null,
      isBlueprintPublished: this.blueprintPublishedState(),
      targetTotalPoints: this.targetPointsState(),
      siblingTitles: this.siblingTitlesState(),
    });
  });

  readonly validation = computed(() => this.constraints().validation);
  readonly publishReady = computed(() => this.validation().publishReady);

  /**
   * Adım kilitleri.
   *
   * Bir adım, kendinden önceki adımların asgari koşulu sağlanmadan açılmaz;
   * kullanıcı yarım bilgiyle ilerleyip sonra geri dönmek zorunda kalmaz.
   */
  readonly stepAvailability = computed<Readonly<Record<ExamWizardStep, boolean>>>(() => {
    const draft = this.draftState();
    const hasInformation =
      draft.title.trim().length > 0 &&
      draft.courseId.length > 0 &&
      draft.cohortIds.length > 0 &&
      draft.opensAt.length > 0 &&
      draft.closesAt.length > 0;
    const hasBlueprint = draft.blueprintId !== null;
    const hasQuestions = this.questionsState().length > 0;

    return {
      information: true,
      blueprint: hasInformation,
      constraints: hasInformation && hasBlueprint,
      questions: hasInformation && hasBlueprint,
      validation: hasInformation && hasBlueprint && hasQuestions,
      preview: hasInformation && hasBlueprint && hasQuestions,
      publish: hasInformation && hasBlueprint && hasQuestions && this.publishReady(),
    };
  });

  canEnter(step: ExamWizardStep): boolean {
    return this.stepAvailability()[step];
  }

  goToStep(step: ExamWizardStep): void {
    if (this.canEnter(step)) this.stepState.set(step);
  }

  nextStep(): void {
    const index = EXAM_WIZARD_STEPS.indexOf(this.stepState());
    const next = EXAM_WIZARD_STEPS[index + 1];
    if (next) this.goToStep(next);
  }

  previousStep(): void {
    const index = EXAM_WIZARD_STEPS.indexOf(this.stepState());
    const previous = EXAM_WIZARD_STEPS[index - 1];
    if (previous) this.stepState.set(previous);
  }

  /* ── Taslak yönetimi ─────────────────────────────────────────────────── */

  /** Yeni sınav wizard'ı — boş taslakla başlar. */
  startNew(courseId: string): void {
    this.reset();
    this.draftState.set({ ...emptyDraft(), courseId });
    this.loadSiblingTitles(courseId);
  }

  /**
   * Var olan sınavı wizard'a yükler.
   *
   * Detay ayrıca `detailState`'e yazılır: sihirbaz ders kodu, grup adları ve
   * yayınlama sırasında sürüm bilgisi için aynı kaydı okur. Sıfırlama
   * `reset()` sonrasında yapılır, aksi hâlde hemen temizlenirdi.
   */
  startEditing(detail: ExamDetail): void {
    this.reset();
    this.detailState.set(detail);
    this.examIdState.set(detail.exam.id);
    this.draftState.set({
      title: detail.exam.title,
      description: detail.exam.description,
      instructions: detail.exam.instructions,
      courseId: detail.exam.courseId,
      blueprintId: detail.exam.blueprintId,
      cohortIds: detail.exam.cohortIds,
      durationMinutes: detail.exam.durationMinutes,
      opensAt: detail.exam.opensAt,
      closesAt: detail.exam.closesAt,
    });
    this.questionsState.set(detail.questions);
    this.loadSiblingTitles(detail.exam.courseId);
    if (detail.exam.blueprintId) this.loadBlueprintRows(detail.exam.blueprintId);
  }

  /**
   * Taslağı günceller ve otomatik kaydı tetikler.
   * Kayıtlı bir sınav yoksa (henüz oluşturulmadıysa) yalnızca yerel durum değişir.
   */
  patchDraft(patch: Partial<ExamDraft>): void {
    this.draftState.update((draft) => ({ ...draft, ...patch }));
    this.dirtyState.set(true);

    if (patch.blueprintId) this.loadBlueprintRows(patch.blueprintId);
    this.scheduleAutosave();
  }

  /** Blueprint satırları kısıt panelinin hedeflerini besler. */
  private loadBlueprintRows(blueprintId: string): void {
    this.blueprints.detail(blueprintId).subscribe({
      next: (detail) => {
        this.blueprintRowsState.set(detail.blueprint.rows);
        this.blueprintPublishedState.set(detail.blueprint.state === 'PUBLISHED');
        this.targetPointsState.set(detail.blueprint.targetTotalPoints);
      },
      error: () => {
        this.blueprintRowsState.set([]);
        this.blueprintPublishedState.set(false);
        this.targetPointsState.set(0);
      },
    });
  }

  /** Ad benzersizliği kontrolü için aynı dersin diğer sınav adları. */
  private loadSiblingTitles(courseId: string): void {
    this.repository
      .list(createPageRequest({ size: 200, filters: { courseId } }))
      .subscribe({
        next: (page) => {
          const currentId = this.examIdState();
          this.siblingTitlesState.set(
            page.items.filter((exam) => exam.id !== currentId).map((exam) => exam.title),
          );
        },
      });
  }

  /* ── Otomatik kayıt ──────────────────────────────────────────────────── */

  /**
   * Taslak, son değişiklikten 1,2 sn sonra kaydedilir.
   * Kullanıcı yazarken her tuşta istek atmamak için geciktirilir; ekranda
   * "kaydediliyor / kaydedildi" göstergesi bu durumu yansıtır.
   */
  private scheduleAutosave(): void {
    const id = this.examIdState();
    if (!id) return;

    if (this.autosaveHandle !== null) clearTimeout(this.autosaveHandle);
    this.autosaveHandle = setTimeout(() => void this.saveDraft(), 1200);
  }

  /** Taslağı hemen kaydeder (adım değişiminde ve sayfadan ayrılırken çağrılır). */
  saveDraft(): Observable<Exam> | null {
    const id = this.examIdState();
    if (!id) return null;

    const draft = this.draftState();
    this.saveStateState.set('saving');

    /*
     * `shareReplay` şart: çağıran (örn. yayınlama akışı) kaydın bitmesini
     * beklemek için aynı observable'a abone olur. Paylaşılmasaydı ikinci abone
     * ikinci bir PUT tetikler ve sürüm çakışırdı.
     */
    const request = this
      .update({ id, version: this.detailState()?.exam.version ?? 1 } as Exam, {
        ...draft,
        questions: [],
        rules: this.detailState()?.exam.rules ?? DEFAULT_RULES,
      })
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));

    request.subscribe({
      next: (saved) => {
        this.saveStateState.set('saved');
        this.dirtyState.set(false);
        this.lastSavedAtState.set(new Date().toISOString());
        const detail = this.detailState();
        if (detail) this.detailState.set({ ...detail, exam: saved });
      },
      error: () => this.saveStateState.set('error'),
    });

    return request;
  }

  /* ── Soru seçimi ─────────────────────────────────────────────────────── */

  /** Blueprint'e göre otomatik seçim. */
  autoSelect(replace: boolean): void {
    const id = this.examIdState();
    if (!id) return;

    this.busyState.set(true);
    this.repository.autoSelect(id, replace).subscribe({
      next: (response) => {
        this.busyState.set(false);
        this.questionsState.set(response.questions);

        const shortfalls = response.shortfalls ?? [];
        if (shortfalls.length === 0) {
          this.toastStore.success(
            'Sorular seçildi',
            `${response.addedCount ?? 0} soru eklendi; blueprint karşılandı.`,
          );
        } else {
          this.toastStore.warning(
            'Sorular kısmen seçildi',
            `${shortfalls.length} hücre için bankada yeterli yayında soru yok.`,
          );
        }
      },
      error: (error: ApiError) => {
        this.busyState.set(false);
        this.toastStore.fromApiError(error, 'Otomatik seçim yapılamadı');
      },
    });
  }

  /** Soru listesini elle günceller (ekle/çıkar/sırala). */
  saveQuestions(questionIds: readonly string[]): void {
    const id = this.examIdState();
    if (!id) return;

    this.busyState.set(true);
    this.repository.saveQuestions(id, questionIds).subscribe({
      next: (response) => {
        this.busyState.set(false);
        this.questionsState.set(response.questions);
      },
      error: (error: ApiError) => {
        this.busyState.set(false);
        this.toastStore.fromApiError(error, 'Soru listesi kaydedilemedi');
      },
    });
  }

  removeQuestion(questionId: string): void {
    this.saveQuestions(
      this.questionsState()
        .filter((question) => question.questionId !== questionId)
        .map((question) => question.questionId),
    );
  }

  addQuestion(questionId: string): void {
    if (this.questionsState().some((question) => question.questionId === questionId)) return;

    this.saveQuestions([
      ...this.questionsState().map((question) => question.questionId),
      questionId,
    ]);
  }

  /** Soruyu listede yukarı/aşağı taşır. */
  moveQuestion(questionId: string, direction: -1 | 1): void {
    const ids = this.questionsState().map((question) => question.questionId);
    const index = ids.indexOf(questionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    this.saveQuestions(ids);
  }

  /* ── Kopyalama ───────────────────────────────────────────────────────── */

  duplicate(exam: Exam, mode: 'clone' | 'duplicate'): Observable<Exam> {
    return this.repository.duplicate(exam.id, mode).pipe(
      tap({
        next: (copy) => {
          this.load();
          this.toastStore.success(
            mode === 'clone' ? 'Sınav klonlandı' : 'Sınav kopyalandı',
            `"${copy.title}" taslak olarak oluşturuldu.`,
          );
        },
        error: (error: ApiError) => this.toastStore.fromApiError(error, 'Sınav kopyalanamadı'),
      }),
    );
  }

  /* ── Temizlik ────────────────────────────────────────────────────────── */

  reset(): void {
    if (this.autosaveHandle !== null) clearTimeout(this.autosaveHandle);
    this.autosaveHandle = null;

    this.examIdState.set(null);
    this.draftState.set(emptyDraft());
    this.questionsState.set([]);
    this.blueprintRowsState.set([]);
    this.blueprintPublishedState.set(false);
    this.targetPointsState.set(0);
    this.siblingTitlesState.set([]);
    this.stepState.set('information');
    this.dirtyState.set(false);
    this.saveStateState.set('idle');
    this.lastSavedAtState.set(null);
  }
}

const DEFAULT_RULES = {
  shuffleQuestions: true,
  shuffleOptions: false,
  allowBackNavigation: true,
  showResultImmediately: false,
  passingScore: 50,
  maxAttempts: 1,
  autoSubmit: true,
};

function emptyDraft(): ExamDraft {
  const opens = new Date();
  opens.setDate(opens.getDate() + 7);
  const closes = new Date(opens.getTime() + 4 * 60 * 60 * 1000);

  return {
    title: '',
    description: '',
    instructions:
      'Sınav süresince sekme değiştirmeyiniz. Tüm soruları yanıtladıktan sonra "Gönder" butonuna basınız.',
    courseId: '',
    blueprintId: null,
    cohortIds: [],
    durationMinutes: 60,
    opensAt: opens.toISOString(),
    closesAt: closes.toISOString(),
  };
}
