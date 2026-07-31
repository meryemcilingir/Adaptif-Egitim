import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
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
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { PublishState } from '../../models/common.model';
import { Question } from '../../models/question.model';
import { availableActions } from '../../domain/publish-workflow';
import { canCreateNewVersion } from '../../domain/question.rules';
import {
  PublishActionsComponent,
  TransitionRequest,
} from '../../components/publish-actions/publish-actions.component';
import { QuestionBadgesComponent } from '../../components/question/question-badges.component';
import { QuestionPreviewComponent } from '../../components/question/question-preview.component';
import {
  CompareRequest,
  VersionHistoryComponent,
} from '../../components/question/version-history.component';
import { VersionCompareComponent } from '../../components/question/version-compare.component';
import { QuestionFacade } from '../../data-access/question.facade';

/**
 * Soru detayı.
 *
 * Tek çağrıda gelen `QuestionDetail` payload'ı ile çalışır: soru, kazanımlar,
 * versiyon geçmişi, istatistik ve kullanım. İstatistik/kullanım blokları bugün
 * madde analizi ve sınav verisinden türetilir; sınav modülü geliştiğinde aynı
 * sözleşme gerçek veriyle dolar ve bu ekran değişmez.
 */
@Component({
  selector: 'app-question-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    PublishActionsComponent,
    QuestionBadgesComponent,
    QuestionPreviewComponent,
    RelativeTimePipe,
    VersionCompareComponent,
    VersionHistoryComponent,
  ],
  templateUrl: './question-detail.page.html',
  styleUrl: './question-detail.page.scss',
})
export class QuestionDetailPage implements OnInit, OnDestroy {
  protected readonly facade = inject(QuestionFacade);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly pendingTargetState = signal<PublishState | null>(null);
  private readonly showAnswersState = signal(true);

  readonly pendingTarget = this.pendingTargetState.asReadonly();
  readonly showAnswers = this.showAnswersState.asReadonly();

  readonly detail = this.facade.questionDetail;
  readonly question = computed<Question | null>(() => this.detail()?.question ?? null);

  readonly canWrite = computed(() => this.permissions.can('question:write'));
  readonly canEdit = computed(() => this.canWrite() && (this.detail()?.isEditable ?? false));
  readonly canVersion = computed(
    () => this.canWrite() && canCreateNewVersion(this.question()?.state ?? 'DRAFT'),
  );

  readonly breadcrumbs = computed(() => [
    { label: 'Soru bankası', link: '/question-bank' },
    { label: this.question()?.code ?? 'Soru' },
  ]);

  ngOnInit(): void {
    this.facade.loadQuestionDetail(this.id());
  }

  ngOnDestroy(): void {
    this.facade.clearQuestionDetail();
  }

  reload(): void {
    this.facade.loadQuestionDetail(this.id());
  }

  toggleAnswers(): void {
    this.showAnswersState.update((value) => !value);
  }

  /* ── Gezinme ve eylemler ─────────────────────────────────────────────── */

  openEditor(): void {
    void this.router.navigate(['/questions', this.id(), 'edit']);
  }

  openList(): void {
    void this.router.navigate(['/question-bank']);
  }

  toggleFavorite(): void {
    const detail = this.detail();
    if (!detail) return;

    this.facade
      .toggleFavorite(detail.question, !detail.isFavorite)
      .subscribe({ error: () => undefined });
  }

  duplicate(): void {
    const question = this.question();
    if (!question) return;

    this.facade.duplicate(question).subscribe({
      next: (copy) => void this.router.navigate(['/questions', copy.id, 'edit']),
      error: () => undefined,
    });
  }

  async createVersion(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const result = await this.dialogs.ask({
      title: 'Yeni versiyon oluştur',
      message: `"${question.title}" yeni bir taslak versiyona alınır. Mevcut sürüm sınav geçmişi için korunur.`,
      confirmLabel: 'Versiyon oluştur',
      tone: 'primary',
      requireReason: true,
      reasonLabel: 'Değişiklik notu',
      reasonHint: 'Bu not versiyon geçmişinde görünür. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.facade.createVersion(question, result.reason).subscribe({
        next: () => this.openEditor(),
        error: () => undefined,
      });
    }
  }

  async confirmDelete(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const confirmed = await this.dialogs.confirm({
      title: 'Soruyu sil',
      message: `"${question.code} · ${question.title}" listelerden kaldırılacak. Kayıt korunur ve gerekirse geri alınabilir.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) {
      this.facade.softDelete(question).subscribe({
        next: () => this.openList(),
        error: () => undefined,
      });
    }
  }

  /**
   * Yayın geçişi. Onay ve gerekçe `AppPublishActions` içinde alınır;
   * burada ikinci bir diyalog açılmaz.
   */
  onTransition(request: TransitionRequest): void {
    const question = this.question();
    if (!question) return;

    this.pendingTargetState.set(request.state);
    this.facade.transition(question, request.state, request.reason).subscribe({
      next: () => {
        this.pendingTargetState.set(null);
        this.reload();
      },
      error: () => this.pendingTargetState.set(null),
    });
  }

  /** Yayın butonlarının görünürlüğü durum makinesinden gelir. */
  hasWorkflowActions(state: PublishState): boolean {
    return availableActions(state).length > 0;
  }

  /* ── Versiyon karşılaştırma ──────────────────────────────────────────── */

  onCompare(request: CompareRequest): void {
    this.facade.compare(this.id(), request.from, request.to);
  }

  closeComparison(): void {
    this.facade.clearComparison();
  }
}
