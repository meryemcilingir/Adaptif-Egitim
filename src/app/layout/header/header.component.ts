import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { MockConfig } from '../../core/api/mock/mock-config';
import { AuthFacade } from '../../core/auth/auth.facade';
import { ROLE_LABELS, Role } from '../../core/auth/permission.model';
import { PermissionService } from '../../core/auth/permission.service';
import { UiStore } from '../../core/state/ui.store';
import { NotificationFacade } from '../../features/adaptive-learning/data-access/notification.facade';
import { NotificationListComponent } from '../../features/adaptive-learning/components/dashboard/notification-list.component';
import { Notification } from '../../features/adaptive-learning/models/notification.model';
import { AppAvatarComponent } from '../../shared/components/app-avatar/app-avatar.component';
import {
  AppBreadcrumbComponent,
  BreadcrumbItem,
} from '../../shared/components/app-breadcrumb/app-breadcrumb.component';
import { AppButtonComponent } from '../../shared/components/app-button/app-button.component';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../shared/components/app-dropdown/app-dropdown.component';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../shared/components/app-status-badge/app-status-badge.component';
import { NAV_GROUPS } from '../nav.config';

/**
 * Üst çubuk: kırılım, arama, rol değiştirici, bildirim merkezi ve kullanıcı menüsü.
 *
 * Mimari notu: uygulama kabuğu, domain bildirimlerini yüzeye çıkardığı için
 * `features/adaptive-learning` bildirim bileşenini kullanır. Kabuk, arayüzün
 * kompozisyon köküdür; bu bağımlılık bilinçlidir (ARCHITECTURE.md §2).
 */
@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppAvatarComponent,
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppDropdownComponent,
    AppIconComponent,
    AppStatusBadgeComponent,
    NotificationListComponent,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class HeaderComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly mockConfig = inject(MockConfig);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  protected readonly ui = inject(UiStore);
  protected readonly auth = inject(AuthFacade);
  protected readonly notifications = inject(NotificationFacade);

  private readonly url = toSignal(
    this.router.events.pipe(
      takeUntilDestroyed(),
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly isOffline = this.mockConfig.isOffline;
  readonly isLoading = this.ui.isLoading;
  readonly user = this.auth.user;

  private readonly panelOpen = signal(false);
  readonly isPanelOpen = this.panelOpen.asReadonly();

  /** Menü tanımından türetilen kırılım — ayrı bir eşleme tablosu tutulmaz. */
  readonly breadcrumb = computed<readonly BreadcrumbItem[]>(() => {
    const path = this.url().split('?')[0] ?? '';

    const match = NAV_GROUPS.flatMap((group) =>
      group.items
        .filter((item) => this.permissions.canAny(item.permissions))
        .map((item) => ({ group: group.title, item })),
    )
      // En uzun eşleşme kazanır: `/outcomes/map`, `/outcomes`ten önce gelmelidir.
      .sort((a, b) => b.item.link.length - a.item.link.length)
      .find((entry) => path.startsWith(entry.item.link.split('/:')[0] ?? entry.item.link));

    if (!match) return [{ label: 'Adaptif Eğitim' }];
    return [{ label: match.group }, { label: match.item.label, link: match.item.link }];
  });

  readonly roleItems = computed<readonly DropdownItem[]>(() =>
    this.auth.availableRoles().map((role) => ({
      id: role,
      label: ROLE_LABELS[role],
      icon: 'shield-check' as const,
      disabled: role === this.auth.activeRole(),
    })),
  );

  readonly userItems = computed<readonly DropdownItem[]>(() => [
    { id: 'dev-tools', label: 'Geliştirici paneli', icon: 'database' },
    { id: 'logout', label: 'Çıkış yap', icon: 'log-out', tone: 'danger', separatorBefore: true },
  ]);

  private readonly searchState = signal('');
  readonly search = this.searchState.asReadonly();

  togglePanel(): void {
    const next = !this.panelOpen();
    this.panelOpen.set(next);
    if (next) this.notifications.load();
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  onNotificationRead(notification: Notification): void {
    this.notifications.markRead(notification);
    this.closePanel();
  }

  onMarkAllRead(): void {
    this.notifications.markAllRead();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.panelOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.closePanel();
  }

  onRoleSelect(item: DropdownItem): void {
    this.auth.switchRole(item.id as Role);
  }

  onUserAction(item: DropdownItem): void {
    if (item.id === 'logout') this.auth.logout('user');
    if (item.id === 'dev-tools') void this.router.navigate(['/dev-tools']);
  }

  onSearchInput(event: Event): void {
    this.searchState.set((event.target as HTMLInputElement).value);
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    const term = this.searchState().trim();
    if (!term) return;
    void this.router.navigate(['/question-bank'], { queryParams: { search: term } });
  }
}
