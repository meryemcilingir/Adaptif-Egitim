import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { AdminFacade } from '../../features/administration/data-access/admin.facade';
import { GlobalSearchPanelComponent } from '../../features/administration/components/global-search-panel.component';
import { ALL_NAV_ITEMS } from '../nav.config';

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
    GlobalSearchPanelComponent,
    NotificationListComponent,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly adminSearch = inject(AdminFacade);
  private readonly mockConfig = inject(MockConfig);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  /*
   * Dışarı tıklamada panel/arama kapanır — CAPTURE aşamasında dinlenir.
   *
   * `(document:click)` host binding'i BUBBLE aşamasında çalışıyordu: sayfanın
   * herhangi bir yerinde `event.stopPropagation()` çağıran bir bileşene
   * (tablo satır aksiyonu, onay kutusu, devre dışı buton, çip kaldırma vb.)
   * tıklandığında olay `document`'a hiç ulaşmıyor, panel kapanmıyordu — "bazen
   * kapanıyor bazen kapanmıyor" hatasının kaynağı buydu. Capture aşaması,
   * olay hedefine ulaşmadan ve herhangi bir `stopPropagation()` çağrılmadan
   * ÖNCE çalışır; bu sınıf hatayı tamamen ortadan kaldırır.
   */
  constructor() {
    const listener = (event: MouseEvent) => this.onOutsideClick(event);
    document.addEventListener('click', listener, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('click', listener, true));
  }

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

    const match = ALL_NAV_ITEMS.filter((entry) => this.permissions.canAny(entry.item.permissions))
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
  private readonly searchOpenState = signal(false);

  readonly search = this.searchState.asReadonly();
  readonly isSearchOpen = this.searchOpenState.asReadonly();

  readonly searchResult = this.adminSearch.searchResult;
  readonly isSearching = this.adminSearch.searching;

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

  private onOutsideClick(event: MouseEvent): void {
    // Dışarı tıklamada hem bildirim paneli hem arama paneli kapanır.
    if (this.host.nativeElement.contains(event.target as Node)) return;

    if (this.panelOpen()) this.closePanel();
    if (this.searchOpenState()) this.closeSearch();
  }

  onRoleSelect(item: DropdownItem): void {
    this.auth.switchRole(item.id as Role);
  }

  onUserAction(item: DropdownItem): void {
    if (item.id === 'logout') this.auth.logout('user');
    if (item.id === 'dev-tools') void this.router.navigate(['/dev-tools']);
  }

  /**
   * Arama sonuçları YAZARKEN gelir (§13).
   *
   * Enter beklemek, kullanıcıyı bir sonuç sayfasına götürür ve geri dönmesini
   * gerektirirdi; panel ise aradığı kaydı bulunca doğrudan tıklamasını sağlar.
   * Yetki süzmesi sunucuda yapılır: panel gördüğü her sonucu göstermeye yetkilidir.
   */
  onSearchInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.searchState.set(term);
    this.searchOpenState.set(term.trim().length > 0);
    this.adminSearch.search(term);
  }

  onSearchFocus(): void {
    if (this.searchState().trim().length > 0) this.searchOpenState.set(true);
  }

  closeSearch(): void {
    this.searchOpenState.set(false);
  }

  /** Sonuca gidilince panel kapanır ve kutu temizlenir; arama tamamlanmıştır. */
  onSearchNavigate(): void {
    this.searchOpenState.set(false);
    this.searchState.set('');
    this.adminSearch.clearSearch();
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    // Panel zaten sonuçları gösteriyor; gönderim yalnızca formun varsayılanını engeller.
  }
}
