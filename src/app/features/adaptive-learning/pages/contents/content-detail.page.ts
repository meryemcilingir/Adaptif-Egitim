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
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../../core/api/api-error';
import { createPageRequest } from '../../../../core/api/page-request';
import { AuthFacade } from '../../../../core/auth/auth.facade';
import { PermissionService } from '../../../../core/auth/permission.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppBreadcrumbComponent } from '../../../../shared/components/app-breadcrumb/app-breadcrumb.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { COGNITIVE_LEVEL_LABELS, DIFFICULTY_LABELS, PublishState } from '../../models/common.model';
import {
  CONTENT_PROGRESS_LABELS,
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  ContentCreateRequest,
  ContentItem,
} from '../../models/content-item.model';
import {
  PublishActionsComponent,
  TransitionRequest,
} from '../../components/publish-actions/publish-actions.component';
import { CourseRepository, OutcomeRepository } from '../../data-access/catalog.repository';
import { ContentFacade } from '../../data-access/content.facade';
import { LearningOutcome } from '../../models/learning-outcome.model';
import { ContentFormComponent } from './content-form.component';

/**
 * İçerik detayı.
 *
 * İki izleyicisi vardır ve ikisi de aynı veriyi görür:
 *  · eğitmen/koordinatör → yayın iş akışı ve düzenleme,
 *  · öğrenci → ilerleme takibi, kilit durumu ve önkoşul bilgisi.
 * Rol ayrımı yalnızca GÖSTERİLEN eylemlerde yapılır; veri kapsamı sunucudadır.
 */
@Component({
  selector: 'app-content-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppProgressBarComponent,
    AppStatusBadgeComponent,
    ContentFormComponent,
    PublishActionsComponent,
    RelativeTimePipe,
  ],
  templateUrl: './content-detail.page.html',
  styleUrl: './content-detail.page.scss',
})
export class ContentDetailPage implements OnInit, OnDestroy {
  protected readonly facade = inject(ContentFacade);
  private readonly courses = inject(CourseRepository);
  private readonly outcomes = inject(OutcomeRepository);
  private readonly permissions = inject(PermissionService);
  private readonly auth = inject(AuthFacade);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly outcomeListState = signal<readonly LearningOutcome[]>([]);
  private readonly formOpenState = signal(false);
  private readonly savingProgressState = signal(false);
  private readonly pendingTargetState = signal<PublishState | null>(null);

  readonly courseOptions = this.courseOptionsState.asReadonly();
  readonly outcomeList = this.outcomeListState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly isSavingProgress = this.savingProgressState.asReadonly();
  readonly pendingTarget = this.pendingTargetState.asReadonly();

  readonly detail = this.facade.richDetail;
  readonly content = computed<ContentItem | null>(() => this.detail()?.content ?? null);

  readonly isStudent = computed(() => this.auth.activeRole() === 'STUDENT');
  readonly canWrite = computed(() => this.permissions.can('content:write'));
  readonly canEdit = computed(() => {
    const state = this.content()?.state;
    return this.canWrite() && state !== 'PUBLISHED' && state !== 'ARCHIVED';
  });

  readonly typeLabel = computed(() => {
    const type = this.content()?.type;
    return type ? CONTENT_TYPE_LABELS[type] : '';
  });
  readonly typeIcon = computed<AppIconName>(() => {
    const type = this.content()?.type;
    return (type ? CONTENT_TYPE_ICONS[type] : 'file-text') as AppIconName;
  });
  readonly difficultyLabel = computed(() => {
    const value = this.content()?.difficulty;
    return value ? DIFFICULTY_LABELS[value] : '';
  });
  readonly levelLabel = computed(() => {
    const value = this.content()?.level;
    return value ? COGNITIVE_LEVEL_LABELS[value] : '';
  });
  readonly statusView = computed(() => statusPresentation(this.content()?.state ?? 'DRAFT'));

  readonly progressLabel = computed(() => {
    const detail = this.detail();
    if (!detail) return '';
    if (detail.locked) return CONTENT_PROGRESS_LABELS.locked;
    return CONTENT_PROGRESS_LABELS[detail.progress.state];
  });

  readonly progressTone = computed(() => {
    const detail = this.detail();
    if (!detail) return 'neutral' as const;
    if (detail.locked) return 'warning' as const;
    if (detail.progress.state === 'completed') return 'success' as const;
    return detail.progress.state === 'in_progress' ? ('primary' as const) : ('neutral' as const);
  });

  readonly breadcrumbs = computed(() => [
    { label: 'İçerikler', link: '/contents' },
    { label: this.content()?.title ?? 'İçerik' },
  ]);

  readonly relatedIcon = (type: string): AppIconName =>
    (CONTENT_TYPE_ICONS[type as keyof typeof CONTENT_TYPE_ICONS] ?? 'file-text') as AppIconName;

  readonly relatedTypeLabel = (type: string): string =>
    CONTENT_TYPE_LABELS[type as keyof typeof CONTENT_TYPE_LABELS] ?? type;

  ngOnInit(): void {
    this.facade.loadRichDetail(this.id());
    this.facade.loadDetail(this.id());
    this.loadReferences();
  }

  ngOnDestroy(): void {
    this.facade.clearRichDetail();
    this.facade.clearDetail();
  }

  reload(): void {
    this.facade.loadRichDetail(this.id());
  }

  open(id: string): void {
    void this.router.navigate(['/contents', id]);
  }

  /* ── Öğrenci ilerlemesi ──────────────────────────────────────────────── */

  /** Çalışmaya başla / devam et — ilerleme kaydı açılır ve kaynak yeni sekmede açılır. */
  startStudy(): void {
    const detail = this.detail();
    if (!detail || detail.locked) return;

    const current = detail.progress.completionPercent;
    this.saveProgress(current > 0 ? current : 10);

    if (detail.content.resourceUrl) {
      window.open(detail.content.resourceUrl, '_blank', 'noopener');
    }
  }

  async completeStudy(): Promise<void> {
    const detail = this.detail();
    if (!detail) return;

    const confirmed = await this.dialogs.confirm({
      title: 'İçeriği tamamla',
      message: `"${detail.content.title}" tamamlandı olarak işaretlenecek ve öğrenme yolunuz güncellenecek.`,
      confirmLabel: 'Tamamladım',
      tone: 'primary',
    });

    if (confirmed) this.saveProgress(100);
  }

  private saveProgress(completionPercent: number): void {
    const detail = this.detail();
    if (!detail) return;

    this.savingProgressState.set(true);
    this.facade
      .saveProgress(detail.content.id, {
        completionPercent,
        // Bir oturumda geçen süre: tamamlamada kalan süre, başlangıçta 0.
        spentMinutes:
          completionPercent >= 100
            ? Math.max(0, detail.content.estimatedDurationMinutes - detail.progress.spentMinutes)
            : 0,
      })
      .subscribe({
        next: () => this.savingProgressState.set(false),
        error: () => this.savingProgressState.set(false),
      });
  }

  /* ── Yayın iş akışı ──────────────────────────────────────────────────── */

  /**
   * Yayın geçişi.
   *
   * Onay ve gerekçe `AppPublishActions` içinde alınır; burada ikinci bir diyalog
   * AÇILMAZ — aksi hâlde kullanıcı aynı işlemi iki kez onaylamak zorunda kalır.
   */
  onTransition(request: TransitionRequest): void {
    const content = this.content();
    if (!content) return;

    this.pendingTargetState.set(request.state);
    this.facade.transition(content, request.state, request.reason).subscribe({
      next: () => {
        this.pendingTargetState.set(null);
        this.reload();
      },
      error: () => this.pendingTargetState.set(null),
    });
  }

  async confirmDelete(): Promise<void> {
    const content = this.content();
    if (!content) return;

    const confirmed = await this.dialogs.confirm({
      title: 'İçeriği sil',
      message: `"${content.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) {
      this.facade.remove(content).subscribe({
        next: () => void this.router.navigate(['/contents']),
        error: () => undefined,
      });
    }
  }

  /* ── Düzenleme ───────────────────────────────────────────────────────── */

  openForm(): void {
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
  }

  onSave(payload: ContentCreateRequest, form: ContentFormComponent): void {
    const content = this.content();
    if (!content) return;

    this.facade.update(content, payload).subscribe({
      next: () => {
        this.closeForm();
        this.reload();
      },
      error: (error: ApiError) => form.applyServerErrors(error),
    });
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
      },
    });
  }
}
