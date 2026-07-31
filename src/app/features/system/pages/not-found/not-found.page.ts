import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';
import { inject } from '@angular/core';

import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';

/** 404 — tanımsız rotalar. */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppEmptyStateComponent],
  template: `
    <div class="page">
      <app-empty-state
        icon="search"
        title="Sayfa bulunamadı"
        description="Aradığınız sayfa taşınmış veya hiç var olmamış olabilir."
        actionLabel="Panele dön"
        actionIcon="house"
        (action)="goHome()"
      />
    </div>
  `,
})
export class NotFoundPage {
  private readonly router = inject(Router);

  goHome(): void {
    void this.router.navigate(['/learning/dashboard']);
  }
}
