import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PublishState } from '../../models/common.model';
import { PublishAction, availableActions } from '../../domain/publish-workflow';

export interface TransitionRequest {
  readonly state: PublishState;
  readonly reason: string;
}

/**
 * Yayın iş akışı butonları (BR-21).
 *
 * Hangi butonların görüneceği durum makinesinden TÜRETİLİR — ekranlar geçiş
 * listesi tutmaz. Geri dönüşü zor eylemler (yayınlama, arşivleme) onay diyaloğu
 * ister; onay metni de eylemin kendi açıklamasından gelir.
 */
@Component({
  selector: 'app-publish-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppStatusBadgeComponent],
  template: `
    <div class="publish">
      <app-status-badge
        [label]="presentation().label"
        [tone]="presentation().tone"
        [icon]="presentation().icon"
      />

      @for (action of actions(); track action.target) {
        <app-button
          [variant]="action.tone === 'secondary' ? 'secondary' : 'primary'"
          size="sm"
          [icon]="action.icon"
          [disabled]="disabled()"
          [loading]="pendingTarget() === action.target"
          (pressed)="run(action)"
        >
          {{ action.label }}
        </app-button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .publish {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
  `,
})
export class PublishActionsComponent {
  private readonly dialogs = inject(DialogService);

  readonly state = input.required<PublishState>();
  readonly disabled = input(false);
  /** Hangi geçişin sürdüğünü gösterir (buton spinner'ı). */
  readonly pendingTarget = input<PublishState | null>(null);

  readonly transitionRequested = output<TransitionRequest>();

  presentation() {
    return statusPresentation(this.state());
  }

  actions(): readonly PublishAction[] {
    return availableActions(this.state());
  }

  async run(action: PublishAction): Promise<void> {
    if (!action.requiresConfirmation) {
      this.transitionRequested.emit({ state: action.target, reason: '' });
      return;
    }

    const result = await this.dialogs.ask({
      title: action.label,
      message: `${action.description} Devam etmek istiyor musunuz?`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      // Yayın ve arşivleme denetim kaydına yazılır; gerekçe istenir.
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.transitionRequested.emit({ state: action.target, reason: result.reason });
    }
  }
}
