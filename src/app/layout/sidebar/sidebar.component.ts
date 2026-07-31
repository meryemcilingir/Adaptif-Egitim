import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthStore } from '../../core/auth/auth.store';
import { PermissionService } from '../../core/auth/permission.service';
import { UiStore } from '../../core/state/ui.store';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';
import { NAV_GROUPS, NavGroup, resolveNavLink } from '../nav.config';

/**
 * Sol menü.
 *
 * · Yetkisiz bağlantılar ve boşalan gruplar hiç render edilmez → menü rol
 *   değiştiğinde otomatik olarak yeniden şekillenir.
 * · Geniş ekranda daraltılabilir, dar ekranda overlay drawer olur.
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  host: {
    '[class.is-collapsed]': 'ui.isSidebarCollapsed()',
    '[class.is-drawer]': 'ui.isDrawerMode()',
    '[class.is-open]': 'ui.isDrawerOpen()',
  },
})
export class SidebarComponent {
  protected readonly ui = inject(UiStore);
  private readonly permissions = inject(PermissionService);
  private readonly auth = inject(AuthStore);

  /** İzin matrisine göre filtrelenmiş, kişisel bağlantıları çözülmüş menü. */
  readonly groups = computed<readonly NavGroup[]>(() => {
    const userId = this.auth.user()?.id ?? null;

    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items
        .filter((item) => this.permissions.canAny(item.permissions))
        .map((item) => ({ ...item, link: resolveNavLink(item.link, userId) })),
    })).filter((group) => group.items.length > 0);
  });

  readonly isCollapsed = this.ui.isSidebarCollapsed;
  readonly roleLabel = this.auth.activeRoleLabel;

  onNavigate(): void {
    if (this.ui.isDrawerMode()) this.ui.closeDrawer();
  }
}
