import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { GradingQueueEntry } from '../../models/dashboard.model';

/** Bekleme süresi arttıkça uyarı tonu yükselir — gecikmiş işler görünür olur. */
const WARNING_DAYS = 3;
const DANGER_DAYS = 7;

@Component({
  selector: 'app-grading-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppEmptyStateComponent, AppStatusBadgeComponent, RelativeTimePipe],
  template: `
    @if (entries().length === 0) {
      <app-empty-state
        icon="circle-check-big"
        title="Değerlendirme kuyruğu boş"
        description="Bekleyen açık uçlu cevap bulunmuyor."
      />
    } @else {
      <ul class="queue">
        @for (entry of entries(); track entry.attemptId) {
          <li class="queue__item">
            <div class="queue__info">
              <div class="queue__head">
                <span class="text-body-strong truncate">{{ entry.studentName }}</span>
                <app-status-badge
                  [label]="waitingLabel(entry)"
                  [tone]="waitingTone(entry)"
                  icon="clock"
                />
              </div>
              <p class="text-xs text-muted truncate">
                {{ entry.courseCode }} · {{ entry.examTitle }} · {{ entry.pendingAnswers }} cevap
                bekliyor
              </p>
              <p class="text-xs text-subtle">Gönderim: {{ entry.submittedAt | appRelativeTime }}</p>
            </div>

            <app-button
              variant="secondary"
              size="sm"
              trailingIcon="arrow-right"
              (pressed)="gradeSelect.emit(entry)"
            >
              Puanla
            </app-button>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './grading-queue.component.scss',
})
export class GradingQueueComponent {
  readonly entries = input.required<readonly GradingQueueEntry[]>();
  readonly gradeSelect = output<GradingQueueEntry>();

  waitingLabel(entry: GradingQueueEntry): string {
    return entry.waitingDays === 0 ? 'Bugün geldi' : `${entry.waitingDays} gündür bekliyor`;
  }

  waitingTone(entry: GradingQueueEntry): 'neutral' | 'warning' | 'danger' {
    if (entry.waitingDays >= DANGER_DAYS) return 'danger';
    if (entry.waitingDays >= WARNING_DAYS) return 'warning';
    return 'neutral';
  }
}
