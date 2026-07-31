import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { UiStore } from '../../core/state/ui.store';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

/**
 * Uygulama kabuğu: Sidebar + Header + içerik alanı.
 * Kimliği doğrulanmış tüm rotalar bu bileşenin altında yer alır.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeaderComponent, RouterOutlet, SidebarComponent],
  template: `
    <a class="skip-link" href="#main-content">İçeriğe geç</a>

    <app-sidebar />

    @if (ui.isDrawerOpen()) {
      <!-- Drawer açıkken arka planı karartır; tıklayınca kapanır. -->
      <div class="shell__scrim" (click)="ui.closeDrawer()" aria-hidden="true"></div>
    }

    <div class="shell__main">
      <app-header />
      <main id="main-content" class="shell__content" tabindex="-1">
        <router-outlet />
      </main>
    </div>
  `,
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly ui = inject(UiStore);
}
