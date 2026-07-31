import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { Permission } from '../../../../core/auth/permission.model';
import { AppUnauthorizedStateComponent } from '../../../../shared/components/app-unauthorized-state/app-unauthorized-state.component';

/** 403 — guard tarafından reddedilen erişimlerin indiği sayfa. */
@Component({
  selector: 'app-forbidden-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppUnauthorizedStateComponent],
  template: `
    <div class="page">
      <app-unauthorized-state [requiredPermissions]="required()" />
    </div>
  `,
})
export class ForbiddenPage {
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  readonly required = computed<readonly Permission[]>(() => {
    const raw = this.params()?.get('required') ?? '';
    return raw.split(',').filter(Boolean) as Permission[];
  });
}
