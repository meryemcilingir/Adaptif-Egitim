import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PERMISSION_LABELS, Permission } from '../../../core/auth/permission.model';
import { AppIconComponent } from '../app-icon/app-icon.component';

/**
 * Yetkisiz erişim durumu.
 * Kullanıcıya hangi iznin eksik olduğu açıkça söylenir — "bir şeyler ters gitti"
 * gibi belirsiz mesaj verilmez.
 */
@Component({
  selector: 'app-unauthorized-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, RouterLink],
  template: `
    <div class="unauthorized__icon">
      <app-icon name="lock" [size]="22" />
    </div>
    <h3 class="text-h3">{{ title() }}</h3>
    <p class="unauthorized__message text-sm text-muted">{{ description() }}</p>

    @if (requiredPermissions().length > 0) {
      <p class="text-xs text-subtle">Gerekli izin: {{ requiredLabels() }}</p>
    }

    <a class="unauthorized__link text-body-strong" routerLink="/learning/dashboard"> Panele dön </a>
  `,
  styleUrl: './app-unauthorized-state.component.scss',
  host: { role: 'alert' },
})
export class AppUnauthorizedStateComponent {
  readonly title = input('Bu içeriği görüntüleme yetkiniz yok');
  readonly description = input(
    'Sayfayı görüntülemek için gerekli izne sahip değilsiniz. Yetki talebi için program yöneticinizle iletişime geçin.',
  );
  readonly requiredPermissions = input<readonly Permission[]>([]);

  requiredLabels(): string {
    return this.requiredPermissions()
      .map((permission) => PERMISSION_LABELS[permission] ?? permission)
      .join(', ');
  }
}
