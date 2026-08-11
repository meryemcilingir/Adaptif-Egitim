import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
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

    <!--
      Geri, panele dönmekten ÖNCE gelir: kullanıcı buraya bir yerden tıklayarak
      düştü ve büyük ihtimalle o ekrana dönmek istiyor. Panele dönmek onu
      yaptığı işten koparıyordu.
    -->
    <div class="unauthorized__actions">
      <button type="button" class="unauthorized__link text-body-strong" (click)="goBack()">
        <app-icon name="arrow-left" [size]="15" />
        Geri dön
      </button>
      <a class="unauthorized__link text-body-strong" routerLink="/learning/dashboard">Panele dön</a>
    </div>
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

  private readonly location = inject(Location);

  goBack(): void {
    this.location.back();
  }

  requiredLabels(): string {
    return this.requiredPermissions()
      .map((permission) => PERMISSION_LABELS[permission] ?? permission)
      .join(', ');
  }
}
