import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';

import { Permission } from '../../core/auth/permission.model';
import { PermissionService } from '../../core/auth/permission.service';

/**
 * İzin yoksa öğeyi DOM'a hiç eklemez.
 *
 * `[hidden]` veya `display: none` yerine yapısal direktif kullanılır — yetkisiz
 * kullanıcı öğeyi geliştirici araçlarından da göremez.
 *
 * Kullanım:
 *   <app-button *appHasPermission="'exam:publish'">Yayınla</app-button>
 *   <div *appHasPermission="['attempt:grade', 'attempt:override']; mode: 'any'">…</div>
 *
 * NOT: Bu yalnızca görünürlük katmanıdır. İşlemin kendisi facade ve mock backend
 * tarafında da denetlenir (üç seviyeli koruma).
 */
@Directive({ selector: '[appHasPermission]' })
export class HasPermissionDirective {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionService);

  readonly appHasPermission = input.required<Permission | readonly Permission[]>();
  readonly appHasPermissionMode = input<'any' | 'all'>('any');

  private rendered = false;

  constructor() {
    effect(() => {
      const required = this.appHasPermission();
      const list = Array.isArray(required) ? required : [required as Permission];
      const granted =
        this.appHasPermissionMode() === 'all'
          ? this.permissions.canAll(list)
          : this.permissions.canAny(list);

      if (granted && !this.rendered) {
        this.container.createEmbeddedView(this.template);
        this.rendered = true;
      } else if (!granted && this.rendered) {
        this.container.clear();
        this.rendered = false;
      }
    });
  }
}
