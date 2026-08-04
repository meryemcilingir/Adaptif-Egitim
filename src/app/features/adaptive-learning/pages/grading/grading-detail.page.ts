import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';

import { PermissionService } from '../../../../core/auth/permission.service';
import { AppBreadcrumbComponent } from '../../../../shared/components/app-breadcrumb/app-breadcrumb.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import {
  GRADING_LIMITS,
  GradingAnswerView,
  ResolveConflictRequest,
  RubricCriterionScore,
} from '../../models/attempt.model';
import { evaluateRubric } from '../../domain/rubric.calculator';
import { GradeInput, changesExistingScore, validateGrading } from '../../domain/grading.rules';
import {
  AnswerGrade,
  AnswerGraderComponent,
} from '../../components/grading/answer-grader.component';
import { ConflictPanelComponent } from '../../components/grading/conflict-panel.component';
import { GradingFacade } from '../../data-access/grading.facade';

/**
 * Deneme puanlama ekranı.
 *
 * Cevaplar tek tek DEĞİL, birlikte kaydedilir: değerlendirici ekranda birkaç
 * soruyu puanlayıp bir kez "Kaydet" der ve deneme toplamı tek seferde tutarlı
 * hâle gelir. Bu yüzden taslak puanlar sayfada tutulur, kayıtta topluca gider.
 *
 * Gerekçe alanı yalnızca MEVCUT bir puan değiştiğinde zorunlu olur (BR-12);
 * ilk kez puanlanan cevap için gerekçe istemek, alanı anlamsız metinle
 * doldurmaya iterdi.
 */
@Component({
  selector: 'app-grading-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnswerGraderComponent,
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    ConflictPanelComponent,
  ],
  templateUrl: './grading-detail.page.html',
  styleUrl: './grading-detail.page.scss',
})
export class GradingDetailPage implements OnInit, OnDestroy {
  protected readonly facade = inject(GradingFacade);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly attemptId = input.required<string>();

  private readonly draftsState = signal<ReadonlyMap<string, AnswerGrade>>(new Map());
  private readonly reasonState = signal('');
  private readonly showAllState = signal(false);

  readonly reason = this.reasonState.asReadonly();
  readonly showAll = this.showAllState.asReadonly();
  readonly reasonLimit = GRADING_LIMITS.regradeReason.max;

  readonly detail = this.facade.detail;

  readonly canGrade = computed(() => this.permissions.can('attempt:grade'));
  readonly canOverride = computed(() => this.permissions.can('attempt:override'));

  readonly statusView = computed(() =>
    statusPresentation(this.detail()?.attempt.state ?? 'SUBMITTED'),
  );

  readonly breadcrumbs = computed(() => [
    { label: 'Değerlendirme', link: '/grading' },
    { label: this.detail()?.attempt.studentName ?? 'Deneme' },
  ]);

  /**
   * Gösterilecek cevaplar.
   *
   * Varsayılan olarak yalnızca ELLE puanlanacaklar listelenir: 40 soruluk bir
   * sınavda otomatik puanlanmış 35 soruyu da göstermek, değerlendiricinin
   * yapması gereken işi görünmez kılardı. "Tümünü göster" ile açılır.
   */
  readonly visibleAnswers = computed<readonly GradingAnswerView[]>(() => {
    const answers = this.detail()?.answers ?? [];
    if (this.showAllState()) return answers;

    const manual = answers.filter((answer) => !answer.autoGraded);
    return manual.length > 0 ? manual : answers;
  });

  readonly manualCount = computed(
    () => (this.detail()?.answers ?? []).filter((answer) => !answer.autoGraded).length,
  );

  readonly openConflicts = computed(
    () => (this.detail()?.conflicts ?? []).filter((item) => item.resolvedPoints === null),
  );

  /** Taslakta değişen cevap var mı? Kaydet düğmesi buna bakar. */
  readonly isDirty = computed(() => this.changedAnswers().length > 0);

  /**
   * Değerlendiricinin GERÇEKTEN değiştirdiği cevaplar.
   *
   * Taslak, ekran açıldığında tüm cevaplar için kurulur; hepsini kaydetmek,
   * dokunulmamış otomatik puanlı cevapları da "elle puanlandı" durumuna
   * geçirirdi. Bu yüzden yalnızca farkı olanlar gönderilir.
   */
  private readonly changedAnswers = computed<readonly GradingAnswerView[]>(() => {
    const answers = this.detail()?.answers ?? [];

    return answers.filter((answer) => {
      const draft = this.draftsState().get(answer.questionId);
      if (!draft) return false;

      return (
        draft.awardedPoints !== answer.awardedPoints ||
        draft.feedback !== answer.feedback ||
        draft.rubricScores.length !== answer.rubricScores.length
      );
    });
  });

  /**
   * Doğrulama girdileri.
   *
   * Sunucu da AYNI `validateGrading()` fonksiyonunu bu girdilerle çalıştırır;
   * bu yüzden ekranda geçen bir kayıt sunucuda reddedilemez.
   */
  private readonly gradeInputs = computed<readonly GradeInput[]>(() =>
    this.changedAnswers().map((answer) => {
      const draft = this.draftsState().get(answer.questionId)!;
      return {
        questionId: answer.questionId,
        awardedPoints: draft.awardedPoints,
        feedback: draft.feedback,
        maxPoints: answer.maxPoints,
        previousPoints: answer.awardedPoints,
        previouslyGraded: answer.autoGraded || answer.graderScores.length > 0,
      };
    }),
  );

  /** Mevcut bir puanı değiştiren düzenleme var mı? Gerekçe zorunluluğu buna bağlı. */
  readonly changesExistingScore = computed(() => changesExistingScore(this.gradeInputs()));

  readonly issues = computed(() => {
    const detail = this.detail();
    if (!detail) return [];

    return validateGrading(this.gradeInputs(), this.reasonState(), detail.attempt.state);
  });

  readonly canSave = computed(
    () => this.canGrade() && this.isDirty() && this.issues().length === 0 && !this.facade.isSaving(),
  );

  readonly canRelease = computed(
    () =>
      this.canGrade() &&
      this.detail()?.attempt.state === 'GRADED' &&
      (this.detail()?.pendingManualCount ?? 1) === 0,
  );

  /** Taslak toplam — kaydedilmeden önceki puan. */
  readonly draftTotal = computed(() => {
    const answers = this.detail()?.answers ?? [];

    const total = answers.reduce((sum, answer) => {
      const draft = this.draftsState().get(answer.questionId);
      return sum + (draft ? draft.awardedPoints : answer.awardedPoints);
    }, 0);

    return Math.round(total * 100) / 100;
  });

  constructor() {
    // Detay geldiğinde taslaklar sunucudaki hâlden kurulur.
    effect(() => {
      const detail = this.detail();
      if (!detail) return;

      untracked(() => {
        const drafts = new Map<string, AnswerGrade>();

        for (const answer of detail.answers) {
          drafts.set(answer.questionId, {
            questionId: answer.questionId,
            awardedPoints: answer.awardedPoints,
            feedback: answer.feedback,
            rubricScores: answer.rubricScores,
          });
        }

        this.draftsState.set(drafts);
        this.reasonState.set('');
      });
    });
  }

  ngOnInit(): void {
    this.facade.loadDetail(this.attemptId());
  }

  ngOnDestroy(): void {
    this.facade.clearDetail();
  }

  reload(): void {
    this.facade.loadDetail(this.attemptId());
  }

  /* ── Taslak ────────────────────────────────────────────────────────────── */

  draftFor(questionId: string): AnswerGrade {
    return (
      this.draftsState().get(questionId) ?? {
        questionId,
        awardedPoints: 0,
        feedback: '',
        rubricScores: [],
      }
    );
  }

  /** Çakışan sorunun puan tavanı — panelde sınır denetimi buna göre yapılır. */
  maxPointsOf(questionId: string): number {
    return (
      this.detail()?.answers.find((answer) => answer.questionId === questionId)?.maxPoints ?? 0
    );
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  rubricFor(answer: GradingAnswerView) {
    if (!answer.rubricId) return null;
    return this.detail()?.rubrics.find((rubric) => rubric.id === answer.rubricId) ?? null;
  }

  onDraftChange(grade: AnswerGrade): void {
    this.draftsState.update((map) => new Map(map).set(grade.questionId, grade));
  }

  /**
   * Rubrik kriteri değişimi.
   *
   * Birleştirme burada yapılır: `draftsState` sinyali senkron okunduğu için
   * hızlı ardışık seçimlerde hiçbir kriter kaybolmaz. Puan da rubrikten yeniden
   * hesaplanır — istemcinin ürettiği değere değil, seçilen seviyelere güvenilir.
   */
  onCriterionChange(answer: GradingAnswerView, change: RubricCriterionScore): void {
    const rubric = this.rubricFor(answer);
    if (!rubric) return;

    const current = this.draftFor(answer.questionId);
    const scores = [
      ...current.rubricScores.filter((score) => score.criterionId !== change.criterionId),
      change,
    ];

    this.onDraftChange({
      ...current,
      rubricScores: scores,
      awardedPoints: evaluateRubric(rubric, scores, answer.maxPoints).scaledPoints,
    });
  }

  setReason(raw: string): void {
    this.reasonState.set(raw.slice(0, this.reasonLimit));
  }

  toggleShowAll(): void {
    this.showAllState.update((value) => !value);
  }

  /* ── Eylemler ──────────────────────────────────────────────────────────── */

  save(): void {
    const detail = this.detail();
    if (!detail || !this.canSave()) return;

    const answers = this.changedAnswers().map((answer) => {
      const draft = this.draftsState().get(answer.questionId)!;
      return {
        questionId: draft.questionId,
        awardedPoints: draft.awardedPoints,
        feedback: draft.feedback,
        rubricScores: draft.rubricScores,
      };
    });

    this.facade
      .grade(this.attemptId(), {
        answers,
        reason: this.reasonState().trim(),
        expectedVersion: detail.attempt.version,
      })
      .subscribe({ error: () => undefined });
  }

  onResolveConflict(request: ResolveConflictRequest): void {
    this.facade.resolveConflict(this.attemptId(), request).subscribe({ error: () => undefined });
  }

  /** İtiraz: sonucu açıklanmış denemeyi bile yeniden incelemeye açar. */
  async openRegrade(): Promise<void> {
    const result = await this.dialogs.ask({
      title: 'İtiraz incelemesi başlat',
      message:
        'Deneme yeniden değerlendirmeye alınacak ve durumu "İtiraz incelemesi" olarak güncellenecek. Puan değişikliğini inceleme sırasında yapabilirsiniz.',
      confirmLabel: 'İncelemeyi başlat',
      tone: 'warning',
      requireReason: true,
      reasonLabel: 'İtiraz gerekçesi',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (!result.confirmed) return;

    this.facade
      .regrade(this.attemptId(), {
        questionId: null,
        reason: result.reason ?? '',
        newScore: null,
      })
      .subscribe({ error: () => undefined });
  }

  async release(): Promise<void> {
    const detail = this.detail();
    if (!detail) return;

    const confirmed = await this.dialogs.confirm({
      title: 'Sonucu açıkla',
      message: `${detail.attempt.studentName} adlı öğrenci puanını ve geri bildirimleri görebilecek. Bu işlemden sonra puan değişikliği için itiraz incelemesi açmanız gerekir.`,
      confirmLabel: 'Sonucu açıkla',
      tone: 'primary',
    });

    if (confirmed) {
      this.facade.release(this.attemptId()).subscribe({ error: () => undefined });
    }
  }

  openAttempt(): void {
    void this.router.navigate(['/attempts', this.attemptId()]);
  }
}
