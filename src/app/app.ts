import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppConfirmDialogComponent } from './shared/components/app-dialog/app-confirm-dialog.component';
import { AppToastComponent } from './shared/components/app-toast/app-toast.component';

/**
 * Kök bileşen.
 *
 * Yalnızca yönlendirme çıkışını ve uygulama genelinde TEK örneği olması gereken
 * katmanları (bildirim yığını, onay diyaloğu) barındırır.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppConfirmDialogComponent, AppToastComponent, RouterOutlet],
  template: `
    <router-outlet />
    <app-toast />
    <app-confirm-dialog />
  `,
})
export class App {}
