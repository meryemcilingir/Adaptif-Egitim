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
import { ActivatedRoute, Router } from '@angular/router';

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
import { AppTabsComponent, TabItem } from '../../../../shared/components/app-tabs/app-tabs.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PublishState } from '../../models/common.model';
import { EXAM_RUNTIME_LABELS } from '../../models/exam.model';
import { availableActions } from '../../domain/publish-workflow';
import {
  PublishActionsComponent,
  TransitionRequest,
} from '../../components/publish-actions/publish-actions.component';
import { ConstraintPanelComponent } from '../../components/exam/constraint-panel.component';
import { ExamPreviewComponent } from '../../components/exam/exam-preview.component';
import { ExamFacade } from '../../data-access/exam.facade';

type DetailTab = 'overview' | 'questions' | 'preview' | 'history';

/**
 * Sınav detayı.
 *
 * Tek çağrıda gelen `ExamDetail` ile çalışır: sınav, blueprint özeti, kısıtlar,
 * sorular, gruplar, kazanımlar, yayın geçmişi ve istatistikler. Sekmeler yalnızca
 * sunum içindir; ek istek atmaz.
 */
@Component({
  selector: 'app-exam-detail-page',
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
    AppTabsComponent,
    ConstraintPanelComponent,
    ExamPreviewComponent,
    PublishActionsComponent,
    RelativeTimePipe,
  ],
  templateUrl: './exam-detail.page.html',
  styleUrl: './exam-detail.page.scss',
})
export class ExamDetailPage implements OnInit, OnDestroy {
  protected readonly facade = inject(ExamFacade);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly id = input.required<string>();

  private readonly tabState = signal<DetailTab>('overview');
  private readonly pendingTargetState = signal<PublishState | null>(null);

  readonly tab = this.tabState.asReadonly();
  readonly pendingTarget = this.pendingTargetState.asReadonly();

  readonly detail = this.facade.examDetail;
  readonly exam = computed(() => this.detail()?.exam ?? null);

  readonly canWrite = computed(() => this.permissions.can('exam:write'));
  /** İş akışı geçişleri ayrı yetkidir; sunucu her geçişte bunu arar. */
  readonly canPublish = computed(() => this.permissions.can('exam:publish'));
  readonly canEdit = computed(() => this.canWrite() && (this.detail()?.isEditable ?? false));

  readonly tabs: readonly TabItem[] = [
    { id: 'overview', label: 'Genel bakış', icon: 'layout-dashboard' },
    { id: 'questions', label: 'Sorular', icon: 'list-checks' },
    { id: 'preview', label: 'Önizleme', icon: 'eye' },
    { id: 'history', label: 'Yayın geçmişi', icon: 'history' },
  ];

  readonly runtimeLabel = computed(() => {
    const status = this.detail()?.runtimeStatus;
    return status ? EXAM_RUNTIME_LABELS[status] : '';
  });

  readonly runtimeTone = computed<'neutral' | 'info' | 'primary' | 'success'>(() => {
    switch (this.detail()?.runtimeStatus) {
      case 'scheduled':
        return 'info';
      case 'active':
        return 'primary';
      case 'closed':
        return 'success';
      default:
        return 'neutral';
    }
  });

  readonly statusView = computed(() => statusPresentation(this.exam()?.state ?? 'DRAFT'));

  readonly breadcrumbs = computed(() => [
    { label: 'Sınavlar', link: '/exams' },
    { label: this.exam()?.title ?? 'Sınav' },
  ]);

  ngOnInit(): void {
    this.facade.loadExamDetail(this.id());

    // Listedeki "Önizle" eylemi `#preview` ile gelir; doğrudan o sekme açılır.
    const fragment = this.route.snapshot.fragment;
    if (fragment && this.tabs.some((tab) => tab.id === fragment)) {
      this.tabState.set(fragment as DetailTab);
    }
  }

  ngOnDestroy(): void {
    this.facade.clearExamDetail();
  }

  reload(): void {
    this.facade.loadExamDetail(this.id());
  }

  onTabChange(tab: string): void {
    this.tabState.set(tab as DetailTab);
  }

  /* ── Eylemler ────────────────────────────────────────────────────────── */

  openWizard(): void {
    void this.router.navigate(['/exams', this.id(), 'wizard']);
  }

  clone(mode: 'clone' | 'duplicate'): void {
    const exam = this.exam();
    if (!exam) return;

    this.facade.duplicate(exam, mode).subscribe({
      next: (copy) => void this.router.navigate(['/exams', copy.id, 'wizard']),
      error: () => undefined,
    });
  }

  /** Onay ve gerekçe `PublishActions` içinde alınır; burada ikinci diyalog açılmaz. */
  onTransition(request: TransitionRequest): void {
    const exam = this.exam();
    if (!exam) return;

    this.pendingTargetState.set(request.state);
    this.facade.transition(exam, request.state, request.reason).subscribe({
      next: () => {
        this.pendingTargetState.set(null);
        this.reload();
      },
      error: () => this.pendingTargetState.set(null),
    });
  }

  hasWorkflowActions(state: PublishState): boolean {
    return availableActions(state).length > 0;
  }

  async confirmDelete(): Promise<void> {
    const exam = this.exam();
    if (!exam) return;

    const confirmed = await this.dialogs.confirm({
      title: 'Sınavı sil',
      message: `"${exam.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) {
      this.facade.remove(exam).subscribe({
        next: () => void this.router.navigate(['/exams']),
        error: () => undefined,
      });
    }
  }

  /** Kısıt panelindeki ihlale tıklanınca sihirbazda düzeltmeye götürür. */
  onIssueSelect(): void {
    if (this.canEdit()) this.openWizard();
  }
}
