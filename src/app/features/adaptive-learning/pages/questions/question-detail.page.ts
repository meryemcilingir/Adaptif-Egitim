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
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTimelineComponent, TimelineItem } from '../../../../shared/components/app-timeline/app-timeline.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PublishState } from '../../models/common.model';
import { QUESTION_LIMITS, Question, QuestionComment } from '../../models/question.model';
import { availableActions } from '../../domain/publish-workflow';
import {
  canCreateNewVersion,
  canDecideReview,
  canResubmitForReview,
  canSubmitForReview,
  isQuestionLocked,
  questionStatusPresentation,
} from '../../domain/question.rules';
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
    AppStatusBadgeComponent,
    AppTimelineComponent,
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

  /** Onay/revizyon/red/yayın kararı yalnızca Ölçme Uzmanı'nındır. */
  readonly canReview = computed(() => this.permissions.can('question:publish'));

  readonly canSubmit = computed(
    () => this.canWrite() && canSubmitForReview(this.question()?.state ?? 'DRAFT'),
  );
  readonly canResubmit = computed(() => {
    const question = this.question();
    return this.canWrite() && !!question && canResubmitForReview(question.state, question.reviewStatus);
  });
  readonly canDecide = computed(() => {
    const question = this.question();
    return this.canReview() && !!question && canDecideReview(question.state, question.reviewStatus);
  });
  readonly isLocked = computed(() => {
    const question = this.question();
    return !!question && isQuestionLocked(question.state, question.reviewStatus);
  });

  readonly reviewBadge = computed(() => {
    const question = this.question();
    return question ? questionStatusPresentation(question.state, question.reviewStatus) : null;
  });

  readonly commentTimeline = computed<readonly TimelineItem[]>(() =>
    [...(this.detail()?.comments ?? [])].reverse().map(toTimelineItem),
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
      reasonHint: `Bu not versiyon geçmişinde görünür. En az 10, en fazla ${QUESTION_LIMITS.changeNote.max} karakter.`,
      maxReasonLength: QUESTION_LIMITS.changeNote.max,
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

  /* ── İnceleme akışı ──────────────────────────────────────────────────── */

  async submitReview(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const result = await this.dialogs.ask({
      title: 'İncelemeye gönder',
      message: `"${question.title}" ölçme uzmanının incelemesine sunulacak. Onaylanana kadar düzenlenemez.`,
      confirmLabel: 'İncelemeye gönder',
      tone: 'primary',
      requireReason: false,
    });

    if (result.confirmed) {
      this.facade.submitForReview(question, result.reason).subscribe({ error: () => undefined });
    }
  }

  async resubmitReview(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const result = await this.dialogs.ask({
      title: 'Yeniden incelemeye gönder',
      message: `"${question.title}" düzeltmelerle birlikte tekrar incelemeye sunulacak.`,
      confirmLabel: 'Yeniden gönder',
      tone: 'primary',
      requireReason: false,
    });

    if (result.confirmed) {
      this.facade.resubmitForReview(question, result.reason).subscribe({ error: () => undefined });
    }
  }

  async approveQuestion(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const result = await this.dialogs.ask({
      title: 'Soruyu onayla',
      message: `"${question.title}" onaylanacak ve yayına hazır hâle gelecek.`,
      confirmLabel: 'Onayla',
      tone: 'primary',
      requireReason: false,
    });

    if (result.confirmed) {
      this.facade.approve(question, result.reason).subscribe({ error: () => undefined });
    }
  }

  async requestRevisionAction(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const result = await this.dialogs.ask({
      title: 'Revizyon iste',
      message: `"${question.title}" eğitmene geri gönderilecek. Ne düzeltilmesi gerektiğini açıklayın.`,
      confirmLabel: 'Revizyon iste',
      tone: 'warning',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: `Bu açıklama eğitmene gösterilir. En az ${QUESTION_LIMITS.commentMessage.min} karakter girin.`,
      minReasonLength: QUESTION_LIMITS.commentMessage.min,
      maxReasonLength: QUESTION_LIMITS.commentMessage.max,
    });

    if (result.confirmed) {
      this.facade.requestRevision(question, result.reason).subscribe({ error: () => undefined });
    }
  }

  async rejectQuestion(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const result = await this.dialogs.ask({
      title: 'Soruyu reddet',
      message: `"${question.title}" reddedilecek. Eğitmen gerekçeyi görüp yeniden gönderebilir.`,
      confirmLabel: 'Reddet',
      tone: 'danger',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: `Bu açıklama eğitmene gösterilir. En az ${QUESTION_LIMITS.commentMessage.min} karakter girin.`,
      minReasonLength: QUESTION_LIMITS.commentMessage.min,
      maxReasonLength: QUESTION_LIMITS.commentMessage.max,
    });

    if (result.confirmed) {
      this.facade.reject(question, result.reason).subscribe({ error: () => undefined });
    }
  }

  async addComment(): Promise<void> {
    const question = this.question();
    if (!question) return;

    const result = await this.dialogs.ask({
      title: 'Yorum ekle',
      message: `"${question.title}" için bir not bırakın.`,
      confirmLabel: 'Yorum ekle',
      tone: 'primary',
      requireReason: true,
      reasonLabel: 'Yorum',
      reasonHint: `En az ${QUESTION_LIMITS.commentMessage.min} karakter girin.`,
      minReasonLength: QUESTION_LIMITS.commentMessage.min,
      maxReasonLength: QUESTION_LIMITS.commentMessage.max,
    });

    if (result.confirmed) {
      this.facade.addComment(question, result.reason).subscribe({ error: () => undefined });
    }
  }

  /** Kullanım listesindeki sınavın yayın durumu — ham enum yerine Türkçe rozet. */
  examStateOf(state: string) {
    return statusPresentation(state);
  }

  /* ── Versiyon karşılaştırma ──────────────────────────────────────────── */

  onCompare(request: CompareRequest): void {
    this.facade.compare(this.id(), request.from, request.to);
  }

  closeComparison(): void {
    this.facade.clearComparison();
  }
}

const COMMENT_TIMELINE_META: Readonly<
  Record<QuestionComment['action'], { readonly title: string; readonly icon: TimelineItem['icon']; readonly tone: TimelineItem['tone'] }>
> = {
  comment: { title: 'Yorum', icon: 'send', tone: 'neutral' },
  submitted: { title: 'İncelemeye gönderildi', icon: 'arrow-right', tone: 'info' },
  resubmitted: { title: 'Yeniden incelemeye gönderildi', icon: 'arrow-right', tone: 'info' },
  approved: { title: 'Onaylandı', icon: 'circle-check-big', tone: 'primary' },
  revision_requested: { title: 'Revizyon istendi', icon: 'circle-alert', tone: 'warning' },
  rejected: { title: 'Reddedildi', icon: 'x', tone: 'danger' },
};

/** Sunucudaki yorum/eylem kaydı, zaman çizelgesi bileşeninin beklediği şekle çevrilir. */
function toTimelineItem(comment: QuestionComment): TimelineItem {
  const meta = COMMENT_TIMELINE_META[comment.action];

  return {
    id: comment.id,
    title: meta.title,
    description: comment.message,
    at: comment.createdAt,
    icon: meta.icon,
    tone: meta.tone,
    actor: comment.authorName,
  };
}
