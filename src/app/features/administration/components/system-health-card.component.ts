import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HEALTH_STATE_LABELS, HealthState, SystemHealth } from '../models/admin.model';

/**
 * Sistem sağlığı kartı (Sprint 9 §14).
 *
 * Verinin ÖRNEK olduğu kartın içinde, göstergelerin hemen yanında yazar —
 * altta küçük bir dipnot olarak değil. Yönetici bir izleme panosuna baktığını
 * sanıp gerçek bir arıza anında buraya güvenirse, kart zarar vermiş olur.
 */
@Component({
  selector: 'app-system-health-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppIconComponent,
    AppProgressBarComponent,
    AppStatusBadgeComponent,
    DatePipe,
  ],
  templateUrl: './system-health-card.component.html',
  styleUrl: './system-health-card.component.scss',
})
export class SystemHealthCardComponent {
  readonly health = input.required<SystemHealth>();

  readonly labels = HEALTH_STATE_LABELS;

  readonly overallTone = computed(() => toneOf(this.health().overall));

  toneOf(state: HealthState): 'success' | 'warning' | 'danger' {
    return toneOf(state);
  }

  /** Doluluk arttıkça renk değişir; %85 üstü uyarı sayılır. */
  usageTone(percent: number): 'primary' | 'warning' | 'danger' {
    if (percent > 90) return 'danger';
    if (percent > 85) return 'warning';
    return 'primary';
  }
}

function toneOf(state: HealthState): 'success' | 'warning' | 'danger' {
  return state === 'healthy' ? 'success' : state === 'degraded' ? 'warning' : 'danger';
}
