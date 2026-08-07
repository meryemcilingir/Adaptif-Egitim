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
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTabsComponent, TabItem } from '../../../../shared/components/app-tabs/app-tabs.component';
import {
  AppTimelineComponent,
  TimelineItem,
  TimelineTone,
} from '../../../../shared/components/app-timeline/app-timeline.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { TIMELINE_LABELS, TimelineKind } from '../../models/exam-session.model';
import { formatDuration } from '../../domain/exam-clock';
import { IntegrityPanelComponent } from '../../components/session/integrity-panel.component';
import { GradingFacade } from '../../data-access/grading.facade';

type DetailTab = 'answers' | 'timeline' | 'integrity' | 'history';

/**
 * Deneme detayı.
 *
 * Puanlama ekranından ayrıdır: burada iş yapılmaz, olan biten OKUNUR. Öğrenci
 * bilgisi, cevaplar, zaman çizelgesi, bütünlük sinyalleri ve puan geçmişi tek
 * kayıttan gelir; sekmeler ek istek atmaz.
 */
@Component({
  selector: 'app-attempt-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    AppTabsComponent,
    AppTimelineComponent,
    IntegrityPanelComponent,
  ],
  templateUrl: './attempt-detail.page.html',
  styleUrl: './attempt-detail.page.scss',
})
export class AttemptDetailPage implements OnInit, OnDestroy {
  protected readonly facade = inject(GradingFacade);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  readonly attemptId = input.required<string>();

  private readonly tabState = signal<DetailTab>('answers');
  readonly tab = this.tabState.asReadonly();

  readonly detail = this.facade.detail;

  readonly canGrade = computed(() => this.permissions.can('attempt:grade'));

  /** Deneme listesi ekranı yalnızca Eğitmen'e açıktır (RolesPermissions.md). */
  private readonly canViewList = computed(() => this.permissions.hasRole('INSTRUCTOR'));

  readonly tabs: readonly TabItem[] = [
    { id: 'answers', label: 'Cevaplar', icon: 'list-checks' },
    { id: 'timeline', label: 'Zaman çizelgesi', icon: 'history' },
    { id: 'integrity', label: 'Bütünlük', icon: 'shield-check' },
    { id: 'history', label: 'Puan geçmişi', icon: 'refresh-cw' },
  ];

  readonly statusView = computed(() =>
    statusPresentation(this.detail()?.attempt.state ?? 'SUBMITTED'),
  );

  /*
   * "Denemeler" bağlantısı yalnızca Eğitmen'e verilir — bu ekrana bir öğrenci
   * de kendi sonucundan (exam-results.page) gelebilir ve `/attempts` listesi
   * onun için erişilebilir değildir; bağlantı olmadan yalnızca etiket görünür.
   */
  readonly breadcrumbs = computed(() => [
    this.canViewList() ? { label: 'Denemeler', link: '/attempts' } : { label: 'Denemeler' },
    { label: this.detail()?.attempt.studentName ?? 'Deneme' },
  ]);

  /** Puan yalnızca değerlendirme bittiğinde gösterilir. */
  readonly hasScore = computed(() => {
    const state = this.detail()?.attempt.state;
    return state === 'GRADED' || state === 'RELEASED';
  });

  readonly duration = computed(() =>
    formatDuration((this.detail()?.attempt.durationSeconds ?? 0) * 1000),
  );

  /**
   * Oturum olaylarını paylaşılan zaman çizelgesi bileşeninin diline çevirir.
   *
   * Etiketler modelden gelir (`TIMELINE_LABELS`); ikon ve ton bu dosyadaki
   * tablolarda durur, çünkü ikisi de sunum kararıdır. Yeni bir olay türü
   * eklemek, bu tablolara birer satır eklemekten ibarettir.
   */
  readonly timelineItems = computed<readonly TimelineItem[]>(() =>
    (this.detail()?.timeline ?? []).map((event) => ({
      id: event.id,
      title: TIMELINE_LABELS[event.kind],
      description: event.detail,
      at: event.at,
      icon: TIMELINE_ICONS[event.kind],
      tone: toneOf(event.kind),
    })),
  );

  ngOnInit(): void {
    this.facade.loadDetail(this.attemptId());
  }

  ngOnDestroy(): void {
    this.facade.clearDetail();
  }

  reload(): void {
    this.facade.loadDetail(this.attemptId());
  }

  onTabChange(tab: string): void {
    this.tabState.set(tab as DetailTab);
  }

  openGrading(): void {
    void this.router.navigate(['/grading', this.attemptId()]);
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/**
 * Olay türü → ikon.
 *
 * `AppIconName` ile TİPLENİR: geçersiz bir ikon adı derleme anında yakalanır.
 * Gevşek `string` tipiyle tutulduğunda hata ancak çalışma zamanında, hem de
 * listenin geri kalanını çizilmez hâle getirerek ortaya çıkıyordu.
 */
const TIMELINE_ICONS: Readonly<Record<TimelineKind, AppIconName>> = {
  started: 'circle-play',
  answered: 'circle-check',
  updated: 'pencil-line',
  flagged: 'flag',
  unflagged: 'flag',
  autosave: 'refresh-cw',
  offline: 'wifi-off',
  reconnected: 'wifi',
  warning: 'triangle-alert',
  submitted: 'send',
  expired: 'clock',
};

function toneOf(kind: TimelineKind): TimelineTone {
  switch (kind) {
    case 'started':
      return 'primary';
    case 'answered':
      return 'success';
    case 'submitted':
      return 'success';
    case 'offline':
    case 'expired':
      return 'danger';
    case 'warning':
    case 'flagged':
      return 'warning';
    case 'reconnected':
      return 'info';
    default:
      return 'neutral';
  }
}
