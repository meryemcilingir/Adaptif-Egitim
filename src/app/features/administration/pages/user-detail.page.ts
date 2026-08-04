import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ROLE_LABELS, Role } from '../../../core/auth/permission.model';
import { AUDIT_ACTION_LABELS, AuditAction } from '../../../core/observability/audit.model';
import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../shared/components/app-dialog/dialog.service';
import { AppEmptyStateComponent } from '../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTabsComponent, TabItem } from '../../../shared/components/app-tabs/app-tabs.component';
import { USER_STATE_LABELS, UserState } from '../../adaptive-learning/models/user.model';
import { AdminFacade } from '../data-access/admin.facade';
import { UserAdminFacade } from '../data-access/user-admin.facade';

const STATE_TONES: Readonly<Record<UserState, 'success' | 'warning' | 'danger' | 'neutral'>> = {
  ACTIVE: 'success',
  INVITED: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'danger',
};

const TABS: readonly TabItem[] = [
  { id: 'overview', label: 'Genel' },
  { id: 'assignments', label: 'Atamalar' },
  { id: 'logins', label: 'Giriş geçmişi' },
  { id: 'notifications', label: 'Bildirimler' },
  { id: 'audit', label: 'Denetim' },
];

/**
 * Kullanıcı detayı (Sprint 9 §3).
 *
 * Beş sekme tek ekranda: kimlik, atamalar, giriş geçmişi, bildirimler ve
 * denetim izi. Hepsi tek istekte gelir (`/users/:id/detail`) çünkü yönetici
 * genellikle bir sorunu araştırırken sekmeler arasında gidip gelir; her
 * sekmede yeni istek beklemek incelemeyi yavaşlatırdı.
 */
@Component({
  selector: 'app-user-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    AppTabsComponent,
    DatePipe,
  ],
  templateUrl: './user-detail.page.html',
  styleUrl: './user-detail.page.scss',
})
export class UserDetailPage implements OnInit {
  /** Rota parametresi — `withComponentInputBinding()` ile bağlanır. */
  readonly id = input.required<string>();

  protected readonly facade = inject(UserAdminFacade);
  private readonly admin = inject(AdminFacade);
  private readonly dialog = inject(DialogService);
  private readonly router = inject(Router);

  private readonly activeTabState = signal('overview');
  private readonly temporaryPasswordState = signal<string | null>(null);

  readonly tabs = TABS;
  readonly activeTab = this.activeTabState.asReadonly();
  readonly temporaryPassword = this.temporaryPasswordState.asReadonly();

  readonly detail = this.facade.detail;
  readonly isLoading = this.facade.isDetailLoading;
  readonly error = this.facade.detailError;
  readonly hasError = computed(() => this.facade.detailStatus() === 'error');

  readonly stateLabels = USER_STATE_LABELS;
  readonly canManage = computed(() => this.admin.can('admin:manage'));

  readonly roleNames = computed(() =>
    (this.detail()?.user.roles ?? []).map((role) => ROLE_LABELS[role as Role] ?? role),
  );

  /** Hiç etkinliği olmayan kullanıcı için özet "sıfır" değil "yok" göstermelidir. */
  readonly hasActivity = computed(() => {
    const activity = this.detail()?.activity;
    if (!activity) return false;

    return (
      activity.examAttempts > 0 || activity.completedContents > 0 || activity.studyMinutes > 0
    );
  });

  ngOnInit(): void {
    this.facade.loadDetail(this.id());
  }

  onTab(id: string): void {
    this.activeTabState.set(id);
  }

  toneOf(state: UserState): 'success' | 'warning' | 'danger' | 'neutral' {
    return STATE_TONES[state];
  }

  actionLabel(action: string): string {
    return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
  }

  edit(): void {
    void this.router.navigate(['/admin/users', this.id(), 'edit']);
  }

  back(): void {
    void this.router.navigate(['/admin/users']);
  }

  async resetPassword(): Promise<void> {
    const detail = this.detail();
    if (!detail) return;

    const confirmed = await this.dialog.confirm({
      title: 'Parola sıfırlansın mı?',
      message: `“${detail.user.fullName}” için yeni bir geçici parola üretilecek. Bu projede e-posta gönderilmez; parolayı kullanıcıya siz iletmelisiniz.`,
      confirmLabel: 'Sıfırla',
      tone: 'warning',
    });

    if (!confirmed) return;

    this.facade.resetPassword(this.id()).subscribe({
      next: (result) => this.temporaryPasswordState.set(result.temporaryPassword),
      error: () => this.temporaryPasswordState.set(null),
    });
  }

  unlock(): void {
    this.facade.lifecycle(this.id(), 'unlock');
  }

  async toggleState(): Promise<void> {
    const detail = this.detail();
    if (!detail) return;

    const suspended = detail.user.state === 'SUSPENDED';

    if (!suspended) {
      const confirmed = await this.dialog.confirm({
        title: 'Hesap askıya alınsın mı?',
        message: `“${detail.user.fullName}” geçici olarak giriş yapamayacak.`,
        confirmLabel: 'Askıya al',
        tone: 'warning',
      });

      if (!confirmed) return;
    }

    this.facade.lifecycle(this.id(), suspended ? 'enable' : 'disable');
  }

  dismissPassword(): void {
    this.temporaryPasswordState.set(null);
  }
}
